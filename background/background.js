/**
 * Background Service Worker: Manajemen Antrian URL dan Otomasi Tab
 */

// Helper random & sleep (dengan keep-alive agar Service Worker MV3 tidak pernah mati saat jeda)
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = async (ms) => {
  let remaining = Math.max(0, ms);
  while (remaining > 0) {
    const chunk = Math.min(remaining, 1000);
    await new Promise((resolve) => setTimeout(resolve, chunk));
    remaining -= chunk;
    if (remaining > 0) {
      try { await chrome.runtime.getPlatformInfo(); } catch (e) {}
    }
  }
};
const randomSleep = (min, max) => sleep(getRandomInt(min, max));

let keepAliveTimer = null;
function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    if (runnerState && runnerState.status === 'RUNNING') {
      chrome.runtime.getPlatformInfo().catch(() => {});
    } else {
      stopKeepAlive();
    }
  }, 10000);
}
function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// Helper memformat URL agar berakhiran /edit jika belum ada.
// PENGECUALIAN: link format /app/assignment-detail/<id> TIDAK punya halaman /edit di FASIH (404),
// sehingga dibuka apa adanya dan bot mengklik tombol Edit di halaman tersebut.
function isAssignmentDetailUrl(urlStr) {
  return /\/assignment-detail\//i.test(String(urlStr || ''));
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Bentuk URL edit FASIH:
//  - /app/assignment/<periode>/<id>           -> + /edit
//  - /app/assignment-detail/<id> + periodeId  -> /app/assignment/<periode>/<id>/edit (langsung, tanpa klik Review)
//  - /app/assignment-detail/<id> tanpa periode -> dibuka apa adanya (content script membaca periode dari halaman)
function formatEditUrl(urlStr, periodeId = '') {
  if (!urlStr) return '';
  try {
    const parsed = new URL(String(urlStr).trim());
    let pathname = parsed.pathname.replace(/\/+$/, '');
    if (isAssignmentDetailUrl(pathname)) {
      const id = (pathname.split('/assignment-detail/')[1] || '').match(UUID_RE);
      if (id && periodeId && UUID_RE.test(periodeId)) {
        parsed.pathname = `/app/assignment/${periodeId.trim()}/${id[0]}/edit`;
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
      }
      parsed.pathname = pathname.replace(/\/edit$/i, '');
      return parsed.toString();
    }
    if (!pathname.endsWith('/edit')) pathname += '/edit';
    parsed.pathname = pathname;
    return parsed.toString();
  } catch (e) {
    let clean = String(urlStr).trim().replace(/\/+$/, '');
    if (isAssignmentDetailUrl(clean)) return clean.replace(/\/edit$/i, '');
    if (!clean.endsWith('/edit')) clean += '/edit';
    return clean;
  }
}

const DEFAULT_WEBHOOK_URL = 'https://n8n7309.online/webhook/notif-anomali';
const DEFAULT_WHATSAPP_SYNC_URL = 'https://n8n7309.online/webhook/tuntas-bot-sync';
const WHATSAPP_SYNC_ALARM = 'tuntasWhatsAppSyncAlarm';

let runnerState = {
  status: 'IDLE', // 'IDLE', 'RUNNING', 'PAUSED', 'STOPPED'
  currentIndex: 0,
  activeTabId: null,
  consecutiveFailures: 0, // Pelacak kegagalan beruntun untuk Circuit Breaker
  options: {
    mode: 'DC0',
    commentText: '#DC_00',
    dc0Target: 'nilai',
    dc1Target: 'kbli',
    autoRevoke: true,
    catatanKbliDiganti: '#DC_01',
    periodeId: 'fd68e454-ba45-4b85-8205-f3bf777ded24',
    stepDelay: 1500,
    enableAdaptiveThrottling: true,
    requireManualConfirm: false,
    autoSubmitSurvey: true,
    closeTabOnComplete: true,
    autoApprove: true,
    autoSsoLogin: true,
    ssoEmail: 'Haerulhaeruddin003@gmail.com',
    ssoPassword: 'Mitra123',
    pcName: 'PC 1',
    enableWebhook: true,
    enableWhatsAppRemote: true,
    whatsappSyncUrl: DEFAULT_WHATSAPP_SYNC_URL,
    notifyOnComplete: true,
    notifyOnPauseStop: true,
    webhookUrl: DEFAULT_WEBHOOK_URL,
    apiDryRun: true
  }
};


// ==================== ADAPTIVE THROTTLING ENGINE ====================
/**
 * Adaptive Throttling Engine:
 * Secara otomatis memantau latensi dan beban server FASIH BPS (loading tab, pemanggilan API, render SPA)
 * dan menyesuaikan kecepatan secara cerdas:
 * 1. Menghitung multiplier jeda (1.0x, 1.5x, 2.0x, 3.0x) saat server melambat atau tinggi beban.
 * 2. Menambahkan jeda antar-baris antrian (inter-item delay) agar server FASIH tidak terbebani request beruntun.
 * 3. Memulihkan kecepatan secara bertahap (cool-down) saat respons server kembali cepat dan stabil.
 */
const adaptiveThrottleState = {
  enabled: true,
  level: 'NORMAL', // 'NORMAL', 'MILD', 'MODERATE', 'HEAVY'
  multiplier: 1.0,
  effectiveStepDelay: 1500,
  interItemDelay: 0,
  lastLatencyMs: 0,
  avgLatencyMs: 0,
  lastSource: 'INIT',
  recentLatencies: [], // buffer 8 pengukuran terakhir { source, latencyMs, isError, at }
  consecutiveFast: 0,
  consecutiveSlow: 0,
  statusText: 'Server Cepat & Normal (1.0x)'
};

function getEffectiveStepDelay(baseStepDelay = 1500) {
  const base = typeof baseStepDelay === 'number' && !isNaN(baseStepDelay) ? baseStepDelay : 1500;
  if (runnerState.options && runnerState.options.enableAdaptiveThrottling === false) {
    return base;
  }
  const factor = adaptiveThrottleState.multiplier || 1.0;
  const scaled = Math.round(base * factor);
  const maxDelay = Math.max(6000, Math.round(base * 3.5));
  return Math.max(base, Math.min(scaled, maxDelay));
}

function getAdaptiveInterItemDelay() {
  if (runnerState.options && runnerState.options.enableAdaptiveThrottling === false) {
    return 0;
  }
  return adaptiveThrottleState.interItemDelay || 0;
}

function updateThrottleStatus() {
  const base = (runnerState.options && runnerState.options.stepDelay) || 1500;
  const eff = getEffectiveStepDelay(base);
  adaptiveThrottleState.effectiveStepDelay = eff;

  const latSec = (adaptiveThrottleState.avgLatencyMs / 1000).toFixed(1);
  const latStr = adaptiveThrottleState.avgLatencyMs > 0 ? `~${latSec}s` : '<1.5s';

  if (runnerState.options && runnerState.options.enableAdaptiveThrottling === false) {
    adaptiveThrottleState.level = 'DISABLED';
    adaptiveThrottleState.multiplier = 1.0;
    adaptiveThrottleState.interItemDelay = 0;
    adaptiveThrottleState.statusText = `Adaptive Nonaktif (Tetap ${(base / 1000).toFixed(1)}s)`;
  } else if (adaptiveThrottleState.level === 'HEAVY') {
    adaptiveThrottleState.multiplier = 3.0;
    adaptiveThrottleState.interItemDelay = 7000;
    adaptiveThrottleState.statusText = `Server Kritis/Sangat Lambat (3.0x — Jeda: ${(eff / 1000).toFixed(1)}s, Antrian: +7s) • Latensi ${latStr}`;
  } else if (adaptiveThrottleState.level === 'MODERATE') {
    adaptiveThrottleState.multiplier = 2.0;
    adaptiveThrottleState.interItemDelay = 3500;
    adaptiveThrottleState.statusText = `Beban Server Tinggi (2.0x — Jeda: ${(eff / 1000).toFixed(1)}s, Antrian: +3.5s) • Latensi ${latStr}`;
  } else if (adaptiveThrottleState.level === 'MILD') {
    adaptiveThrottleState.multiplier = 1.5;
    adaptiveThrottleState.interItemDelay = 1500;
    adaptiveThrottleState.statusText = `Server Melambat (1.5x — Jeda: ${(eff / 1000).toFixed(1)}s, Antrian: +1.5s) • Latensi ${latStr}`;
  } else {
    adaptiveThrottleState.level = 'NORMAL';
    adaptiveThrottleState.multiplier = 1.0;
    adaptiveThrottleState.interItemDelay = 0;
    adaptiveThrottleState.statusText = `Server Cepat & Normal (1.0x — Jeda: ${(eff / 1000).toFixed(1)}s) • Latensi ${latStr}`;
  }
}

function getThrottlePublicState() {
  updateThrottleStatus();
  return {
    enabled: runnerState.options && runnerState.options.enableAdaptiveThrottling !== false,
    level: adaptiveThrottleState.level,
    multiplier: adaptiveThrottleState.multiplier,
    baseStepDelay: (runnerState.options && runnerState.options.stepDelay) || 1500,
    effectiveStepDelay: adaptiveThrottleState.effectiveStepDelay,
    interItemDelay: adaptiveThrottleState.interItemDelay,
    lastLatencyMs: adaptiveThrottleState.lastLatencyMs,
    avgLatencyMs: adaptiveThrottleState.avgLatencyMs,
    statusText: adaptiveThrottleState.statusText
  };
}

function recordServerLatency(source, latencyMs, { isError = false, errorMsg = '' } = {}) {
  if (runnerState.options && runnerState.options.enableAdaptiveThrottling === false) return;

  const lat = Math.max(0, Math.round(latencyMs || 0));
  adaptiveThrottleState.lastLatencyMs = lat;
  adaptiveThrottleState.lastSource = source;

  // Simpan dalam buffer circular (maks. 8 data terakhir)
  adaptiveThrottleState.recentLatencies.push({
    source,
    latencyMs: lat,
    isError: Boolean(isError),
    errorMsg: String(errorMsg || ''),
    at: Date.now()
  });
  if (adaptiveThrottleState.recentLatencies.length > 8) {
    adaptiveThrottleState.recentLatencies.shift();
  }

  // Hitung rata-rata latensi
  const valid = adaptiveThrottleState.recentLatencies.filter(m => m.latencyMs > 0);
  if (valid.length > 0) {
    const sum = valid.reduce((acc, cur) => acc + cur.latencyMs, 0);
    adaptiveThrottleState.avgLatencyMs = Math.round(sum / valid.length);
  }

  // Klasifikasi tingkat kelambatan
  let severity = 'FAST';
  if (isError) {
    const errUpper = String(errorMsg || '').toUpperCase();
    if (
      errUpper.includes('TIMEOUT') ||
      errUpper.includes('429') ||
      errUpper.includes('502') ||
      errUpper.includes('503') ||
      errUpper.includes('504') ||
      errUpper.includes('SMART_RELOAD') ||
      errUpper.includes('SERVER_DOWN')
    ) {
      severity = 'CRITICAL';
    } else {
      severity = 'HIGH';
    }
  } else if (source === 'TAB_LOAD') {
    if (lat >= 30000) severity = 'CRITICAL';
    else if (lat >= 16000) severity = 'HIGH';
    else if (lat >= 8000) severity = 'SLOW';
    else severity = 'FAST';
  } else if (source === 'API_CALL') {
    if (lat >= 8000) severity = 'CRITICAL';
    else if (lat >= 4000) severity = 'HIGH';
    else if (lat >= 1800) severity = 'SLOW';
    else severity = 'FAST';
  } else if (source === 'DOM_WAIT') {
    if (lat >= 15000) severity = 'CRITICAL';
    else if (lat >= 7000) severity = 'HIGH';
    else if (lat >= 3000) severity = 'SLOW';
    else severity = 'FAST';
  } else {
    if (lat >= 12000) severity = 'CRITICAL';
    else if (lat >= 6000) severity = 'HIGH';
    else if (lat >= 2500) severity = 'SLOW';
    else severity = 'FAST';
  }

  const prevLevel = adaptiveThrottleState.level;

  if (severity === 'CRITICAL') {
    adaptiveThrottleState.consecutiveSlow += 2;
    adaptiveThrottleState.consecutiveFast = 0;
    adaptiveThrottleState.level = 'HEAVY';
  } else if (severity === 'HIGH') {
    adaptiveThrottleState.consecutiveSlow++;
    adaptiveThrottleState.consecutiveFast = 0;
    if (adaptiveThrottleState.level === 'MODERATE' || adaptiveThrottleState.consecutiveSlow >= 3) {
      adaptiveThrottleState.level = 'HEAVY';
    } else {
      adaptiveThrottleState.level = 'MODERATE';
    }
  } else if (severity === 'SLOW') {
    adaptiveThrottleState.consecutiveSlow++;
    adaptiveThrottleState.consecutiveFast = 0;
    if (adaptiveThrottleState.consecutiveSlow >= 3) {
      adaptiveThrottleState.level = 'MODERATE';
    } else if (adaptiveThrottleState.level === 'NORMAL') {
      adaptiveThrottleState.level = 'MILD';
    }
  } else {
    // FAST: Pemulihan bertahap (cool-down)
    adaptiveThrottleState.consecutiveFast++;
    adaptiveThrottleState.consecutiveSlow = Math.max(0, adaptiveThrottleState.consecutiveSlow - 1);

    if (adaptiveThrottleState.consecutiveFast >= 2) {
      if (adaptiveThrottleState.level === 'HEAVY') {
        adaptiveThrottleState.level = 'MODERATE';
        adaptiveThrottleState.consecutiveFast = 0;
      } else if (adaptiveThrottleState.level === 'MODERATE') {
        adaptiveThrottleState.level = 'MILD';
        adaptiveThrottleState.consecutiveFast = 0;
      } else if (adaptiveThrottleState.level === 'MILD') {
        adaptiveThrottleState.level = 'NORMAL';
        adaptiveThrottleState.consecutiveFast = 0;
      }
    }
  }

  updateThrottleStatus();

  // Siarkan status terbaru ke popup
  const pubState = getThrottlePublicState();
  broadcastToPopup({ action: 'THROTTLE_STATE_UPDATED', throttleState: pubState });

  if (prevLevel !== adaptiveThrottleState.level) {
    console.log(`[FASIH BG] Adaptive Throttle berubah: ${prevLevel} → ${adaptiveThrottleState.level} (${adaptiveThrottleState.statusText})`);
    if (runnerState.status === 'RUNNING') {
      broadcastToPopup({
        action: 'UPDATE_STEP',
        step: 'ADAPTIVE_THROTTLE',
        details: adaptiveThrottleState.statusText
      });
    }
  }
}

function recordServerSlowdownSignal(source, errorMsg = '') {
  recordServerLatency(source, 35000, { isError: true, errorMsg });
}


// ==================== TWO-WAY WHATSAPP REMOTE & DYNAMIC CLOUD QUEUE ====================
/**
 * WhatsApp Two-Way Remote & Dynamic Cloud Queue Engine:
 * 1. Mengirim status berkala bot (heartbeat telemetry) ke n8n: PC, status (IDLE/RUNNING/PAUSED/STOPPED),
 *    progress, nama usaha, sukses/gagal, dan latensi server FASIH.
 * 2. Menerima instruksi perintah jarak jauh dari WhatsApp melalui respons n8n:
 *    - PAUSE (#JEDA)
 *    - RESUME (#LANJUT)
 *    - STOP (#STOP)
 *    - ADD_QUEUE (#TAMBAH [link]): Menambahkan link antrian baru secara dinamis ke Cloud Queue tanpa upload Excel ulang!
 */
let isSyncingWhatsApp = false;
let whatsAppSyncIntervalTimer = null;
let lastWhatsAppSyncResult = {
  ok: true,
  text: 'Siap Sinkron',
  at: Date.now(),
  pc: 'PC 1'
};

async function buildWhatsAppStatusPayload() {
  const store = await chrome.storage.local.get(['fasihQueue', 'runnerState', 'runnerOptions']);
  const queue = store.fasihQueue || [];
  const state = store.runnerState || runnerState;
  const opts = store.runnerOptions || runnerState.options || {};

  const total = queue.length;
  const done = queue.filter((i) => ['SUCCESS', 'SKIPPED', 'FAILED', 'INVALID', 'DRYRUN'].includes(i.status)).length;
  const successCount = queue.filter((i) => i.status === 'SUCCESS').length;
  const failedCount = queue.filter((i) => i.status === 'FAILED').length;
  const skippedCount = queue.filter((i) => i.status === 'SKIPPED').length;
  const pendingCount = queue.filter((i) => i.status === 'PENDING').length;

  const curIndex = (state && state.currentIndex !== undefined && state.currentIndex !== null) ? state.currentIndex : null;
  const curItem = (curIndex !== null && queue[curIndex]) ? queue[curIndex] : null;
  let currentUsaha = '-';
  let curRowNum = '-';
  let currentLink = '-';

  if (curItem) {
    currentUsaha = curItem.nama_usaha || `Baris #${curIndex + 1}`;
    curRowNum = curItem.excelRowNum || (curIndex + 1);
    currentLink = curItem.link_fasih_sm || curItem.link || '-';
  }

  const serverHealth = typeof adaptiveThrottleState !== 'undefined'
    ? adaptiveThrottleState.statusText
    : 'Normal (1.0x)';

  const mode = opts.mode || 'DC0';
  const modeLabel = mode === 'API' ? 'Ubah Variabel (API)' : (mode === 'NTB' ? 'Validasi NTB' : (mode === 'DC1' ? '#DC_01' : '#DC_00'));
  const pct = total > 0 ? ((done / total) * 100).toFixed(1) : '0';

  const now = new Date();
  const waktuLokal = now.toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour12: false }) + ' WITA';

  let statusIcon = '⚪';
  let statusLabel = 'Siaga (IDLE)';
  if (state.status === 'RUNNING') {
    statusIcon = '▶️';
    statusLabel = 'Sedang Berjalan (RUNNING)';
  } else if (state.status === 'PAUSED') {
    statusIcon = '⏸️';
    statusLabel = 'Dijeda (PAUSED)';
  } else if (state.status === 'STOPPED') {
    statusIcon = '⏹️';
    statusLabel = 'Dihentikan (STOPPED)';
  } else if (total > 0 && done === total) {
    statusIcon = '🎉';
    statusLabel = 'Selesai (COMPLETED)';
  }

  const pcName = String(opts.pcName || 'PC 1').trim() || 'PC 1';

  const lines = [
    `📊 [MONITORING PERANGKAT TUNTAS | ${pcName}]`,
    `🖥️ PC: ${pcName}`,
    `⚡ Status: ${statusIcon} *${statusLabel}*`,
    `📋 Menu: ${modeLabel}`,
    `📈 Progres: *${done} / ${total}* (${pct}%)`,
    `✅ Sukses: ${successCount} | ❌ Gagal: ${failedCount}${skippedCount ? ` | ⏩ Dilewati: ${skippedCount}` : ''}`,
    `⏳ Sisa Antrian: ${pendingCount}`,
    curItem ? `🏢 Usaha Aktif: ${currentUsaha}${curRowNum !== '-' ? ` (Baris #${curRowNum})` : ''}` : null,
    `🌐 Respon Server: ${serverHealth}`,
    `⏰ Waktu: ${waktuLokal}`
  ].filter(Boolean);

  const formattedStatusMessage = lines.join('\n');

  return {
    app: 'TUNTAS SE2026',
    pc: pcName,
    pc_name: pcName,
    status: state.status || 'IDLE',
    statusLabel,
    mode,
    modeLabel,
    progress: `${done} / ${total}`,
    progres: `${done} / ${total}`,
    persen: `${pct}%`,
    nama_usaha: currentUsaha,
    no_baris: curRowNum,
    link_fasih_sm: currentLink,
    successCount,
    failedCount,
    skippedCount,
    sukses: successCount,
    gagal: failedCount,
    dilewati: skippedCount,
    queueRemaining: pendingCount,
    sisa_antrian: pendingCount,
    totalQueue: total,
    total_antrian: total,
    currentIndex: curIndex || 0,
    serverHealth,
    server_health: serverHealth,
    activeTabUrl: state.activeTargetUrl || (currentLink !== '-' ? currentLink : ''),
    timestamp: Date.now(),
    waktu_lokal: waktuLokal,
    updatedAt: waktuLokal,
    message: formattedStatusMessage,
    text: formattedStatusMessage
  };
}

async function syncWithWhatsAppRemote({ force = false, test = false } = {}) {
  const store = await chrome.storage.local.get(['runnerOptions', 'runnerState']);
  if (store.runnerOptions) {
    runnerState.options = { ...runnerState.options, ...store.runnerOptions };
  }
  const opts = store.runnerOptions || runnerState.options || {};
  if (!force && !test && opts.enableWhatsAppRemote === false) {
    return { ok: false, skipped: true, reason: 'Fitur WhatsApp Remote dinonaktifkan di pengaturan' };
  }

  const syncUrl = String(opts.whatsappSyncUrl || DEFAULT_WHATSAPP_SYNC_URL).trim();
  if (!syncUrl || !/^https?:\/\//i.test(syncUrl)) {
    return { ok: false, error: 'URL Webhook Sync WhatsApp tidak valid' };
  }

  if (isSyncingWhatsApp && !force) return { ok: false, busy: true };
  isSyncingWhatsApp = true;

  try {
    const payload = await buildWhatsAppStatusPayload();
    if (test) {
      payload.test = true;
      payload.status = `${payload.status} (Uji Coba)`;
      payload.nama_usaha = 'Uji Koneksi WhatsApp Remote';
      payload.message = `🧪 [UJI KONEKSI WHATSAPP SYNC | ${payload.pc}]\n${payload.message}`;
      payload.text = payload.message;
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutHandle);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const resJson = await response.json().catch(() => ({ status: 'OK' }));
    lastWhatsAppSyncResult = {
      ok: true,
      text: 'Terhubung',
      at: Date.now(),
      pc: payload.pc
    };

    broadcastToPopup({
      action: 'WHATSAPP_SYNC_UPDATED',
      syncState: lastWhatsAppSyncResult
    });

    // Jalankan perintah remote jika ada pesan masuk dari WhatsApp
    if (resJson && resJson.command && resJson.command.action && resJson.command.action !== 'NONE') {
      await handleRemoteWhatsAppCommand(resJson.command);
    }

    return { ok: true, data: resJson };
  } catch (err) {
    const errMsg = err.name === 'AbortError' ? 'Timeout koneksi (>12 detik)' : (err.message || String(err));
    lastWhatsAppSyncResult = {
      ok: false,
      text: `Gagal: ${errMsg}`,
      at: Date.now()
    };
    broadcastToPopup({
      action: 'WHATSAPP_SYNC_UPDATED',
      syncState: lastWhatsAppSyncResult
    });
    return { ok: false, error: errMsg };
  } finally {
    isSyncingWhatsApp = false;
  }
}



// Kirim notifikasi status (Selesai, Dijeda, Berhenti) ke Webhook n8n / WhatsApp
async function sendWebhookStatusNotification({
  event = 'STATUS_NOTIFICATION',
  status = 'COMPLETED',
  details = '',
  customUrl = ''
} = {}) {
  try {
    const storeOpts = await chrome.storage.local.get(['runnerOptions']);
    if (storeOpts.runnerOptions) {
      runnerState.options = { ...runnerState.options, ...storeOpts.runnerOptions };
    }
    const opts = storeOpts.runnerOptions || (runnerState && runnerState.options) || {};
    if (!customUrl && (opts.enableWebhook === false || opts.notifyStatus === false)) {
      return { ok: false, skipped: true, reason: 'Webhook dinonaktifkan' };
    }

    if (status === 'COMPLETED' && (opts.notifyOnComplete === false || opts.notifyStatus === false)) {
      return { ok: false, skipped: true, reason: 'Notifikasi selesai dinonaktifkan' };
    }
    if ((status === 'PAUSED' || status === 'STOPPED') && (opts.notifyOnPauseStop === false || opts.notifyStatus === false)) {
      return { ok: false, skipped: true, reason: 'Notifikasi jeda/stop dinonaktifkan' };
    }

    const webhookUrl = String(customUrl || opts.webhookUrl || DEFAULT_WEBHOOK_URL).trim();
    if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
      return { ok: false, error: 'URL Webhook tidak valid' };
    }

    const pcName = String(opts.pcName || 'PC 1').trim() || 'PC 1';
    const store = await chrome.storage.local.get(['fasihQueue', 'runnerState']);
    const queue = store.fasihQueue || [];
    const state = store.runnerState || runnerState;
    const total = queue.length;
    const done = queue.filter((i) => ['SUCCESS', 'SKIPPED', 'FAILED', 'INVALID', 'DRYRUN'].includes(i.status)).length;
    const successCount = queue.filter((i) => i.status === 'SUCCESS').length;
    const failedCount = queue.filter((i) => i.status === 'FAILED').length;
    const skippedCount = queue.filter((i) => i.status === 'SKIPPED').length;

    const curIndex = (state && state.currentIndex !== undefined && state.currentIndex !== null) ? state.currentIndex : null;
    const curItem = (curIndex !== null && queue[curIndex]) ? queue[curIndex] : null;
    const currentUsaha = curItem ? (curItem.nama_usaha || `Baris #${curIndex + 1}`) : '-';
    const currentLink = curItem ? (curItem.link_fasih_sm || curItem.link || '-') : '-';
    const rowNum = curItem ? (curItem.excelRowNum || (curIndex !== null ? curIndex + 1 : '-')) : (curIndex !== null ? curIndex + 1 : '-');

    const now = new Date();
    const waktuLokal = now.toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour12: false }) + ' WITA';

    let icon = 'ℹ️';
    let title = 'UPDATE STATUS';
    if (status === 'COMPLETED' || event === 'ALL_COMPLETED') {
      icon = '🎉';
      title = 'ANTRIAN SELESAI';
    } else if (status === 'PAUSED' || event === 'QUEUE_PAUSED') {
      icon = '⏸️';
      title = 'ANTRIAN DIJEDA';
    } else if (status === 'STOPPED' || event === 'QUEUE_STOPPED') {
      icon = '⏹️';
      title = 'ANTRIAN DIHENTIKAN';
    }

    const mode = (curItem && curItem.mode) || opts.mode || (runnerState && runnerState.options && runnerState.options.mode) || 'DC0';
    const modeLabel = mode === 'API' ? 'Ubah Variabel (API)' : (mode === 'NTB' ? 'Validasi NTB' : (mode === 'DC1' ? '#DC_01 (Ganti KBLI)' : '#DC_00 (Tanpa Perubahan)'));

    const lines = [
      `${icon} [TUNTAS SE2026 - ${title} | ${pcName}]`,
      `💻 PC: ${pcName}`,
      `⚡ Status: *${status}*`,
      `📋 Menu: ${modeLabel}`,
      `📈 Progres: *${done} / ${total}*`,
      `✅ Sukses: ${successCount} | ❌ Gagal: ${failedCount}${skippedCount ? ` | ⏩ Dilewati: ${skippedCount}` : ''}`,
      details ? `📝 Keterangan: ${details}` : null,
      `⏰ Waktu: ${waktuLokal}`
    ].filter(Boolean);

    const formattedMessage = lines.join('\n');

    const statusDesc = status === 'PAUSED'
      ? `⏸️ Antrian Dijeda (${details || 'Tombol Jeda ditekan'})`
      : status === 'STOPPED'
      ? `⏹️ Antrian Dihentikan (${details || 'Tombol Stop ditekan'})`
      : `🎉 Seluruh antrian selesai (${done}/${total})`;

    const payload = {
      event,
      app: 'TUNTAS SE2026',
      pc: pcName,
      pc_name: pcName,
      status,
      timestamp: now.toISOString(),
      waktu_lokal: waktuLokal,
      progres: `${done} / ${total}`,
      sukses: successCount,
      gagal: failedCount,
      dilewati: skippedCount,
      total_antrian: total,
      keterangan: details || statusDesc,
      // Fallback jika template WhatsApp n8n masih memformat sebagai error:
      error: statusDesc,
      no_baris: rowNum,
      nama_usaha: currentUsaha,
      link_fasih_sm: currentLink,
      kategori_error: status,
      message: formattedMessage,
      text: formattedMessage
    };

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 10000);
    let response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (response.status === 404 || response.status === 405) {
      try {
        const u = new URL(webhookUrl);
        u.searchParams.set('event', payload.event);
        u.searchParams.set('status', payload.status);
        u.searchParams.set('pc', payload.pc);
        u.searchParams.set('pc_name', payload.pc_name);
        u.searchParams.set('error', payload.error);
        u.searchParams.set('nama_usaha', payload.nama_usaha);
        u.searchParams.set('no_baris', String(payload.no_baris));
        u.searchParams.set('link_fasih_sm', payload.link_fasih_sm);
        u.searchParams.set('message', payload.message);
        response = await fetch(u.toString(), { method: 'GET' });
      } catch (_) {}
    }
    clearTimeout(timeoutHandle);
    return { ok: response.ok, status: response.status };
  } catch (err) {
    console.warn('[TUNTAS Webhook] Gagal mengirim notifikasi status:', err);
    return { ok: false, error: err.message };
  }
}

// Eksekusi jeda antrian secara menyeluruh (digunakan oleh Pop-up UI & Remote WhatsApp)
async function pauseQueueExecution(details = 'Otomasi dijeda.') {
  runnerState.status = 'PAUSED';
  await chrome.storage.local.set({ runnerState });
  if (runnerState.activeTabId) {
    chrome.tabs.sendMessage(runnerState.activeTabId, { action: 'PAUSE_WORKFLOW' }).catch(() => {});
  }
  chrome.tabs.query({ url: ['*://fasih-sm.bps.go.id/*', '*://*.bps.go.id/*'] }, (tabs) => {
    if (tabs && tabs.length > 0) {
      for (const t of tabs) {
        chrome.tabs.sendMessage(t.id, { action: 'PAUSE_WORKFLOW' }).catch(() => {});
      }
    }
  });
  if (runnerState.currentIndex !== null && runnerState.currentIndex !== undefined) {
    await updateItemStatus(runnerState.currentIndex, 'PAUSED', 'Dijeda');
  }
  broadcastToPopup({ action: 'QUEUE_PAUSED' });
  sendWebhookStatusNotification({
    event: 'QUEUE_PAUSED',
    status: 'PAUSED',
    details
  }).catch(() => {});
  syncWithWhatsAppRemote({ force: true }).catch(() => {});
  return { success: true };
}

// Eksekusi pemulihan antrian secara menyeluruh (digunakan oleh Pop-up UI & Remote WhatsApp)
async function resumeQueueExecution(options = null) {
  const queue = await loadStateFromStorage();
  runnerState.consecutiveFailures = 0;
  runnerState.status = 'RUNNING';
  if (options) {
    runnerState.options = { ...runnerState.options, ...options };
  }
  await chrome.storage.local.set({ runnerState, runnerOptions: runnerState.options });
  broadcastToPopup({ action: 'QUEUE_RESUMED' });

  // 1. Jika loop antrian masih aktif dan tab saat ini masih dalam proses/dijeda, lanjutkan tab tersebut
  const curItem = queue[runnerState.currentIndex];
  const isCurrentTabStillInProgress = curItem && (curItem.status === 'PAUSED' || curItem.status === 'PROCESSING' || curItem.status === 'OPENING_TAB');
  if (isQueueRunning && runnerState.activeTabId && isCurrentTabStillInProgress) {
    try {
      const tab = await chrome.tabs.get(runnerState.activeTabId);
      if (tab && !tab.discarded) {
        // Kembalikan item PAUSED lainnya ke PENDING, dan item aktif ke PROCESSING
        for (let i = 0; i < queue.length; i++) {
          if (queue[i] && queue[i].status === 'PAUSED') {
            queue[i].status = (i === runnerState.currentIndex) ? 'PROCESSING' : 'PENDING';
          }
        }
        await chrome.storage.local.set({ fasihQueue: queue });
        broadcastToPopup({ action: 'QUEUE_UPDATED', index: runnerState.currentIndex, queue });
        chrome.tabs.sendMessage(runnerState.activeTabId, { action: 'RESUME_WORKFLOW' }).catch(() => {});
        return { success: true, resumedTab: runnerState.activeTabId };
      }
    } catch (e) {}
  }

  // 2. Kembalikan semua item yang menggantung (PAUSED/PROCESSING/OPENING_TAB) ke PENDING
  let hasReset = false;
  for (let i = 0; i < queue.length; i++) {
    if (queue[i] && (queue[i].status === 'PAUSED' || queue[i].status === 'PROCESSING' || queue[i].status === 'OPENING_TAB')) {
      queue[i].status = 'PENDING';
      hasReset = true;
    }
  }
  if (hasReset) {
    await chrome.storage.local.set({ fasihQueue: queue });
    broadcastToPopup({ action: 'QUEUE_UPDATED', queue });
  }

  // 3. Lanjutkan antrian ke item PENDING mulai dari currentIndex
  let nextIndex = findNextPendingIndex(queue, runnerState.currentIndex);
  if (nextIndex === -1) {
    nextIndex = findNextPendingIndex(queue, 0);
  }

  if (nextIndex === -1) {
    if (runnerState.activeTabId && runnerState.options.closeTabOnComplete !== false) {
      await safeCloseTab(runnerState.activeTabId);
    }
    stopKeepAlive();
    runnerState.status = 'IDLE';
    runnerState.activeTabId = null;
    await chrome.storage.local.set({ runnerState });
    broadcastToPopup({ action: 'ALL_COMPLETED' });
    sendWebhookStatusNotification({
      event: 'ALL_COMPLETED',
      status: 'COMPLETED',
      details: 'Semua item dalam antrian sudah selesai diproses.'
    }).catch(() => {});
    return { success: false, allCompleted: true, message: 'Semua item dalam antrian sudah selesai diproses.' };
  }

  startQueueRunner(nextIndex, { forceRestart: true });
  return { success: true, nextIndex };
}


// Eksekusi penghentian total antrian (digunakan oleh Pop-up UI & Remote WhatsApp)
async function stopQueueExecution(details = 'Otomasi dihentikan total.') {
  closeApiHelperTab();
  stopKeepAlive();
  queueRunToken++;
  isQueueRunning = false;
  runnerState.status = 'STOPPED';
  const activeTabToClose = runnerState.activeTabId;
  runnerState.activeTabId = null;
  await chrome.storage.local.set({ runnerState });

  if (activeTabToClose) {
    chrome.tabs.sendMessage(activeTabToClose, { action: 'STOP_WORKFLOW' }).catch(() => {});
    if (runnerState.options.closeTabOnComplete !== false) {
      await safeCloseTab(activeTabToClose);
    }
  }
  chrome.tabs.query({ url: ['*://fasih-sm.bps.go.id/*', '*://*.bps.go.id/*'] }, (tabs) => {
    if (tabs && tabs.length > 0) {
      for (const t of tabs) {
        chrome.tabs.sendMessage(t.id, { action: 'STOP_WORKFLOW' }).catch(() => {});
      }
    }
  });

  const data = await chrome.storage.local.get(['fasihQueue']);
  const q = data.fasihQueue || [];
  let changed = false;
  for (let i = 0; i < q.length; i++) {
    if (q[i] && (q[i].status === 'OPENING_TAB' || q[i].status === 'PROCESSING' || q[i].status === 'PAUSED')) {
      q[i].status = 'PENDING';
      q[i].error = 'Diberhentikan (Stop)';
      changed = true;
    }
  }
  if (changed) {
    await chrome.storage.local.set({ fasihQueue: q });
    broadcastToPopup({ action: 'QUEUE_UPDATED', queue: q });
  }

  broadcastToPopup({ action: 'QUEUE_STOPPED' });
  sendWebhookStatusNotification({
    event: 'QUEUE_STOPPED',
    status: 'STOPPED',
    details
  }).catch(() => {});
  syncWithWhatsAppRemote({ force: true }).catch(() => {});

  return { success: true };
}

// Ulangi baris yang berstatus FAILED dalam antrian (bisa dipanggil dari popup atau WhatsApp remote)
async function retryFailedQueueItems(options = null) {
  try {
    const data = await chrome.storage.local.get(['fasihQueue']);
    const queue = data.fasihQueue || [];
    let resetCount = 0;
    let firstResetIndex = -1;
    queue.forEach((item, idx) => {
      if (item && item.status === 'FAILED') {
        item.status = 'PENDING';
        item.error = null;
        if (firstResetIndex === -1) firstResetIndex = idx;
        resetCount++;
      }
    });

    if (resetCount === 0) {
      return { success: false, resetCount: 0, message: 'Tidak ada item yang berstatus gagal.' };
    }

    runnerState.consecutiveFailures = 0;
    runnerState.status = 'RUNNING';
    runnerState.currentIndex = firstResetIndex !== -1 ? firstResetIndex : 0;
    if (options) {
      runnerState.options = { ...runnerState.options, ...options };
    }
    await chrome.storage.local.set({ fasihQueue: queue, runnerState });
    broadcastToPopup({ action: 'QUEUE_UPDATED', queue });
    broadcastToPopup({ action: 'QUEUE_RESUMED' });

    startQueueRunner(runnerState.currentIndex, { forceRestart: true });
    return { success: true, resetCount, startIndex: runnerState.currentIndex };
  } catch (err) {
    console.error('[TUNTAS] Gagal mengulang baris gagal:', err);
    return { success: false, error: err.message || String(err) };
  }
}

async function handleRemoteWhatsAppCommand(cmd) {
  if (!cmd || !cmd.action || cmd.action === 'NONE') return;

  const action = String(cmd.action).toUpperCase().trim();
  console.log(`[TUNTAS Remote WA] Menjalankan perintah remote dari WhatsApp: ${action}`, cmd);

  // Pastikan status runnerState sinkron dengan penyimpanan lokal (jika Service Worker baru aktif kembali)
  const stored = (await chrome.storage.local.get(['runnerState'])).runnerState;
  if (stored && stored.status) {
    runnerState.status = stored.status;
    if (stored.currentIndex !== undefined) runnerState.currentIndex = stored.currentIndex;
    if (stored.activeTabId !== undefined) runnerState.activeTabId = stored.activeTabId;
  }

  if (action === 'STATUS') {
    broadcastToPopup({
      action: 'UPDATE_STEP',
      step: 'REMOTE_WA',
      details: '📊 Permintaan status diterima via WhatsApp (#STATUS)'
    });
    setTimeout(() => syncWithWhatsAppRemote({ force: true }), 100);
  } else if (action === 'PAUSE' || action === 'JEDA') {
    broadcastToPopup({
      action: 'UPDATE_STEP',
      step: 'REMOTE_WA',
      details: '⏸️ Otomasi dijeda jarak jauh via WhatsApp (#JEDA)'
    });
    await pauseQueueExecution('Dijeda jarak jauh via WhatsApp (#JEDA)');
    setTimeout(() => syncWithWhatsAppRemote({ force: true }), 500);
  } else if (action === 'RESUME' || action === 'LANJUT') {
    broadcastToPopup({
      action: 'UPDATE_STEP',
      step: 'REMOTE_WA',
      details: '▶️ Otomasi dilanjutkan jarak jauh via WhatsApp (#LANJUT)'
    });
    await resumeQueueExecution();
    setTimeout(() => syncWithWhatsAppRemote({ force: true }), 500);
  } else if (action === 'STOP' || action === 'BERHENTI') {
    broadcastToPopup({
      action: 'UPDATE_STEP',
      step: 'REMOTE_WA',
      details: '⏹️ Otomasi dihentikan jarak jauh via WhatsApp (#STOP)'
    });
    await stopQueueExecution('Dihentikan jarak jauh via WhatsApp (#STOP)');
    setTimeout(() => syncWithWhatsAppRemote({ force: true }), 500);
  } else if (action === 'RETRY_FAILED' || action === 'ULANG' || action === 'RETRY' || action === 'ULANGI_GAGAL') {
    broadcastToPopup({
      action: 'UPDATE_STEP',
      step: 'REMOTE_WA',
      details: '🔄 Mengulang baris gagal jarak jauh via WhatsApp (#ULANG)'
    });
    await retryFailedQueueItems();
    setTimeout(() => syncWithWhatsAppRemote({ force: true }), 500);
  } else if (action === 'ADD_QUEUE') {
    const rawLink = String(cmd.link || '').trim();
    if (rawLink && /^https?:\/\//i.test(rawLink)) {
      const data = await chrome.storage.local.get(['fasihQueue', 'fasihAllRows']);
      const queue = data.fasihQueue || [];
      const allRows = data.fasihAllRows || [];

      const usahaLabel = cmd.nama_usaha || `Antrian WhatsApp (#${queue.length + 1})`;
      const newItem = {
        link_fasih_sm: rawLink,
        link: rawLink,
        nama_usaha: usahaLabel,
        mode: runnerState.options.mode || 'DC0',
        commentText: runnerState.options.commentText || '#DC_00',
        dc0Target: runnerState.options.dc0Target || 'nilai',
        status: 'PENDING',
        source: 'WHATSAPP_CLOUD_QUEUE',
        addedAt: new Date().toISOString()
      };

      queue.push(newItem);
      allRows.push(newItem);

      await chrome.storage.local.set({ fasihQueue: queue, fasihAllRows: allRows });
      broadcastToPopup({ action: 'QUEUE_UPDATED', queue });
      broadcastToPopup({
        action: 'UPDATE_STEP',
        step: 'CLOUD_QUEUE',
        details: `➕ Link baru ditambahkan ke antrian via WhatsApp: ${usahaLabel}`
      });

      // Jika bot sedang IDLE / selesai, jalankan antrian baru secara otomatis!
      if (runnerState.status === 'IDLE') {
        runnerState.status = 'RUNNING';
        await chrome.storage.local.set({ runnerState });
        startQueueRunner(queue.length - 1, { forceRestart: true });
      }

      setTimeout(() => syncWithWhatsAppRemote({ force: true }), 500);
    }
  }
}

function startWhatsAppSyncLoop() {
  if (whatsAppSyncIntervalTimer) clearInterval(whatsAppSyncIntervalTimer);
  whatsAppSyncIntervalTimer = setInterval(() => {
    // Jalankan sync berkala
    syncWithWhatsAppRemote().catch(() => {});
  }, 8000); // interval 8 detik
}

async function setupWhatsAppSyncAlarm() {
  if (!chrome.alarms) return;
  try {
    const a = await chrome.alarms.get(WHATSAPP_SYNC_ALARM);
    if (!a) {
      chrome.alarms.create(WHATSAPP_SYNC_ALARM, { delayInMinutes: 0.5, periodInMinutes: 1 });
    }
  } catch (_) {}
}

// Klasifikasi kategori error untuk laporan Webhook
function classifyErrorCategory(errorMsg = '') {
  const upper = String(errorMsg || '').toUpperCase();
  if (upper.includes('CIRCUIT BREAKER')) return 'CIRCUIT_BREAKER';
  if (
    upper.includes('TIMEOUT') ||
    upper.includes('SERVER_DOWN') ||
    upper.includes('BAD GATEWAY') ||
    upper.includes('SERVICE UNAVAILABLE') ||
    upper.includes('500') ||
    upper.includes('502') ||
    upper.includes('503') ||
    upper.includes('504') ||
    upper.includes('ERR_CONNECTION') ||
    upper.includes('TIDAK MERESPONS')
  ) {
    return 'GAGAL_KONEKSI';
  }
  if (
    upper.includes('REMARK') ||
    upper.includes('CATATAN') ||
    upper.includes('MODAL CATATAN') ||
    upper.includes('PERTANYAAN TARGET') ||
    upper.includes('TARGET CATATAN') ||
    upper.includes('FORMULIR KUISIONER TIDAK TERBUKA') ||
    upper.includes('FORMULIR TIDAK TERBUKA') ||
    upper.includes('FORMULIR TIDAK DAPAT DIBUKA')
  ) {
    return 'GAGAL_REMARK';
  }
  if (upper.includes('REVOKE')) return 'GAGAL_REVOKE';
  if (upper.includes('API:') || upper.includes('API')) return 'GAGAL_API';
  if (upper.includes('KBLI')) return 'GAGAL_KBLI';
  if (upper.includes('APPROVE')) return 'GAGAL_APPROVE';
  if (upper.includes('TERPUTUS') || upper.includes('DISCONNECTED')) return 'TERPUTUS';
  if (upper.includes('SSO') || upper.includes('LOGIN')) return 'GAGAL_LOGIN_SSO';
  if (
    upper.includes('GALAT') ||
    upper.includes('BELUM DIISI') ||
    upper.includes('WAJIB DIISI') ||
    upper.includes('BELUM LENGKAP') ||
    upper.includes('TIDAK VALID')
  ) {
    return 'GAGAL_GALAT';
  }
  return 'ERROR_LAINNYA';
}

/**
 * Memeriksa apakah suatu error memenuhi syarat untuk dikirimkan ke Webhook n8n/Telegram.
 * Sesuai kebutuhan: Notifikasi HANYA dikirim jika:
 * 1. Ekstensinya tidak jalan (Server BPS down, 500/502/503/504, timeout loading >35s/70s, koneksi terputus, gagal login SSO, circuit breaker triggered, formulir kuisioner tidak terbuka).
 * 2. Kandas dalam proses pemberian remark (pertanyaan target tidak ditemukan, modal catatan gagal dibuka/disimpan, KBLI tidak ditemukan, gagal revoke untuk isi catatan, API gagal menyimpan nilai/catatan, galat penolakan kirim formulir).
 *
 * Diabaikan (TIDAK kirim webhook):
 * - Catatan sudah tersimpan / terkirim tetapi Approve gagal (APPROVE GAGAL).
 * - Remark sudah ada sebelumnya (alreadyHasRemark / skip wajar).
 * - Link URL tidak valid / id assignment tidak terbaca dari file Excel.
 * - Diberhentikan atau dijeda manual oleh pengguna.
 */
function shouldSendWebhookNotification(event, errorMsg = '') {
  if (event === 'TEST_WEBHOOK') return true;
  if (event === 'CIRCUIT_BREAKER_TRIGGERED') return true;

  const raw = String(errorMsg || '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();

  // 1. DAFTAR PENGECUALIAN (Strict Exclusions - Tidak boleh memicu Webhook)
  // a. Diberhentikan atau dijeda manual oleh pengguna
  if (
    upper.includes('DIBERHENTIKAN') ||
    upper.includes('STOPPED') ||
    upper.includes('DIJEDA') ||
    upper.includes('PAUSED')
  ) {
    return false;
  }

  // b. Dokumen sudah terkirim / catatan sudah tersimpan, tetapi langkah Approve gagal atau tombol Approve tidak muncul
  if (
    upper.includes('APPROVE GAGAL') ||
    upper.includes('GAGAL APPROVE') ||
    upper.includes('APPROVE TIDAK') ||
    upper.includes('TOMBOL APPROVE') ||
    (upper.includes('APPROVE') && (upper.includes('TERKIRIM') || upper.includes('CATATAN TERSIMPAN') || upper.includes('SUKSES') || upper.includes('DILEWATI')))
  ) {
    return false;
  }

  // c. Remark sudah ada sebelumnya (Skip wajar)
  if (
    upper.includes('REMARK SUDAH ADA') ||
    upper.includes('SUDAH MEMILIKI REMARK') ||
    (upper.includes('SUDAH ADA') && !upper.includes('FORMULIR')) ||
    (upper.includes('DILEWATI') && !upper.includes('FORMULIR'))
  ) {
    return false;
  }

  // d. Link URL tidak valid atau ID Assignment tidak terbaca (Kesalahan baris data Excel pengguna)
  if (
    upper.includes('LINK URL TIDAK VALID') ||
    upper.includes('URL TIDAK VALID') ||
    upper.includes('ASSIGNMENT_ID TIDAK TERBACA') ||
    upper.includes('LINK TIDAK VALID')
  ) {
    return false;
  }

  // 2. KRITERIA 1: EKSTENSI TIDAK JALAN (Server Down, Timeout, Tab Crash, SSO Login Gagal, Formulir Macet, dsb)
  const isExtensionNotRunning =
    upper.includes('CIRCUIT BREAKER') ||
    upper.includes('TIMEOUT') ||
    upper.includes('SERVER_DOWN') ||
    upper.includes('BAD GATEWAY') ||
    upper.includes('SERVICE UNAVAILABLE') ||
    upper.includes('500') ||
    upper.includes('502') ||
    upper.includes('503') ||
    upper.includes('504') ||
    upper.includes('404 NOT FOUND') ||
    upper.includes('ERR_CONNECTION') ||
    upper.includes('TIDAK MERESPONS') ||
    upper.includes('TERPUTUS') ||
    upper.includes('DISCONNECTED') ||
    upper.includes('SSO') ||
    upper.includes('LOGIN') ||
    upper.includes('FORMULIR KUISIONER TIDAK TERBUKA') ||
    upper.includes('FORMULIR TIDAK TERBUKA') ||
    upper.includes('FORMULIR TIDAK DAPAT DIBUKA') ||
    upper.includes('MESIN API BELUM DIMUAT');

  if (isExtensionNotRunning) {
    return true;
  }

  // 3. KRITERIA 2: KANDAS DALAM PROSES PEMBERIAN REMARK
  const isRemarkProcessFailed =
    upper.includes('PERTANYAAN TARGET') ||
    upper.includes('TARGET CATATAN') ||
    upper.includes('MODAL CATATAN') ||
    upper.includes('TOMBOL CATATAN') ||
    upper.includes('GAGAL REMARK') ||
    upper.includes('GAGAL PEMBERIAN REMARK') ||
    upper.includes('CATATAN TIDAK DITEMUKAN') ||
    upper.includes('UNIT USAHA') ||
    upper.includes('KBLI') ||
    upper.includes('REVOKE') ||
    upper.includes('API:') ||
    upper.includes('GALAT:') ||
    upper.includes('GALAT') ||
    upper.includes('ISIAN WAJIB') ||
    upper.includes('BELUM LENGKAP');

  if (isRemarkProcessFailed) {
    return true;
  }

  return false;
}

// Kirim notifikasi error ke Webhook n8n (mendukung POST JSON & fallback GET query)
async function sendWebhookErrorNotification({
  event = 'ERROR_NOTIFICATION',
  index = null,
  item = null,
  totalQueue = 0,
  errorMsg = '',
  customUrl = ''
} = {}) {
  try {
    const opts = (runnerState && runnerState.options) || {};
    if (!customUrl && opts.enableWebhook === false) {
      return { ok: false, skipped: true, reason: 'Webhook dinonaktifkan' };
    }

    // Filter ketat: Kirim HANYA jika ekstensi macet/tidak jalan ATAU kandas dalam proses pemberian remark
    if (event !== 'TEST_WEBHOOK' && !shouldSendWebhookNotification(event, errorMsg)) {
      console.log(`[TUNTAS Webhook] Notifikasi dilewati (bukan error kritis / kandas remark): "${errorMsg}"`);
      return { ok: false, skipped: true, reason: 'Dilewati: bukan error kritis atau kandas remark' };
    }
    const webhookUrl = String(customUrl || opts.webhookUrl || DEFAULT_WEBHOOK_URL).trim();
    if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
      return { ok: false, error: 'URL Webhook tidak valid' };
    }

    const pcName = String(opts.pcName || 'PC 1').trim() || 'PC 1';
    const kategori = event === 'TEST_WEBHOOK' ? 'TEST_WEBHOOK' : classifyErrorCategory(errorMsg);
    const isNtb = (item && item.ntbInfo) || opts.mode === 'NTB';
    const modeCode = isNtb ? (item && item.mode === 'API' ? 'NTB_IMPUTASI' : 'NTB_WAJAR') : ((item && item.mode === 'DC1') || opts.mode === 'DC1' ? '#DC_01' : ((item && item.mode === 'API') || opts.mode === 'API' ? 'API_VARIABEL' : '#DC_00'));
    const rowNum = item ? (item.excelRowNum || (index !== null ? index + 1 : '-')) : (index !== null ? index + 1 : '-');
    const namaUsaha = (item && item.nama_usaha) || '-';
    const linkFasih = (item && (item.link_fasih_sm || item.link)) || (runnerState && runnerState.activeTargetUrl) || '-';
    const urlEdit = (linkFasih && linkFasih !== '-') ? formatEditUrl(linkFasih, opts.periodeId) : '-';
    const orig = (item && item.originalRow) || {};
    const idAssignment = orig.id_assignment || orig.assignment_id || orig.ID_ASSIGNMENT || '';
    const kbliAwal = item && item.kbliTask ? item.kbliTask.kbliAwal : '';
    const kbliTujuan = item && item.kbliTask ? item.kbliTask.kbliTujuan : '';
    const now = new Date();
    const waktuLokal = now.toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour12: false }) + ' WITA';

    const lines = [
      event === 'TEST_WEBHOOK' ? `🔔 [TUNTAS SE2026 - TES WEBHOOK | ${pcName}]` : `⚠️ [TUNTAS SE2026 - NOTIFIKASI ERROR | ${pcName}]`,
      `🖥️ PC: ${pcName}`,
      `📋 Menu: ${modeCode}`,
      `🏷️ Kategori: ${kategori}`,
      `🔢 Baris Excel: #${rowNum}${totalQueue ? ` (dari ${totalQueue})` : ''}`,
      `🏢 Nama Usaha / ID: ${namaUsaha}`,
      idAssignment ? `🆔 ID Assignment: ${idAssignment}` : null,
      kbliAwal && kbliTujuan ? `🔄 KBLI: ${kbliAwal} → ${kbliTujuan}` : null,
      `❌ Detail Error: ${errorMsg}`,
      `🔗 Link FASIH: ${linkFasih}`,
      `⏰ Waktu: ${waktuLokal}`
    ].filter(Boolean);

    const formattedMessage = lines.join('\n');

    const payload = {
      event,
      app: 'TUNTAS SE2026',
      pc: pcName,
      pc_name: pcName,
      timestamp: now.toISOString(),
      waktu_lokal: waktuLokal,
      mode: modeCode,
      kategori_error: kategori,
      no_baris: rowNum,
      index_antrian: index,
      total_antrian: totalQueue,
      id_assignment: idAssignment,
      nama_usaha: namaUsaha,
      link_fasih_sm: linkFasih,
      url_edit: urlEdit,
      kbli_awal: kbliAwal,
      kbli_tujuan: kbliTujuan,
      sso_email: opts.ssoEmail || '',
      status: event === 'TEST_WEBHOOK' ? 'TEST' : 'FAILED',
      error: errorMsg,
      message: formattedMessage,
      text: formattedMessage
    };

    let res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify(payload)
    });

    // Fallback otomatis ke GET jika node Webhook di n8n diatur menggunakan metode GET
    if (res.status === 404 || res.status === 405) {
      const u = new URL(webhookUrl);
      u.searchParams.set('event', payload.event);
      u.searchParams.set('pc', payload.pc);
      u.searchParams.set('pc_name', payload.pc_name);
      u.searchParams.set('mode', payload.mode);
      u.searchParams.set('kategori_error', payload.kategori_error);
      u.searchParams.set('no_baris', String(payload.no_baris));
      u.searchParams.set('nama_usaha', payload.nama_usaha);
      u.searchParams.set('id_assignment', payload.id_assignment);
      u.searchParams.set('link_fasih_sm', payload.link_fasih_sm);
      u.searchParams.set('error', payload.error);
      u.searchParams.set('waktu_lokal', payload.waktu_lokal);
      u.searchParams.set('message', payload.message);
      res = await fetch(u.toString(), { method: 'GET' });
    }

    if (!res.ok) {
      console.warn(`[TUNTAS Webhook] HTTP ${res.status} saat mengirim ke ${webhookUrl}`);
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    console.log(`[TUNTAS Webhook] Notifikasi terkirim ke ${webhookUrl} (${kategori})`);
    return { ok: true, status: res.status };
  } catch (err) {
    console.warn('[TUNTAS Webhook] Gagal mengirim webhook:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

// Circuit Breaker: otomatis jeda antrian jika terjadi 3 kegagalan beruntun (server down / timeout)
function checkCircuitBreaker() {
  if (runnerState.consecutiveFailures >= 3 && runnerState.status === 'RUNNING') {
    console.warn(`[FASIH BG] Circuit Breaker aktif! ${runnerState.consecutiveFailures} kegagalan berturut-turut.`);
    const cbMessage = '🚨 Circuit Breaker: Terdeteksi 3 kegagalan berturut-turut (server FASIH down / koneksi timeout). Otomasi dijeda otomatis agar sisa antrian aman.';
    broadcastToPopup({
      action: 'CIRCUIT_BREAKER_TRIGGERED',
      consecutiveFailures: runnerState.consecutiveFailures,
      message: cbMessage
    });
    pauseQueueExecution(cbMessage).catch(() => {});
  }
}

// Helper: Cari index item PENDING berikutnya mulai dari fromIndex, lalu dari awal jika perlu
function findNextPendingIndex(queue, fromIndex = 0) {
  if (!queue || queue.length === 0) return -1;
  const start = Math.max(0, Math.min(fromIndex, queue.length));

  // 1. Cari item PENDING mulai dari start ke depan
  for (let i = start; i < queue.length; i++) {
    if (queue[i] && queue[i].status === 'PENDING') {
      return i;
    }
  }

  // 2. Jika tidak ada di depan, cari dari awal (index 0) hingga start - 1
  for (let i = 0; i < start; i++) {
    if (queue[i] && queue[i].status === 'PENDING') {
      return i;
    }
  }

  return -1;
}

// Ambil state dari chrome.storage
async function loadStateFromStorage() {
  const data = await chrome.storage.local.get(['fasihQueue', 'runnerState', 'runnerOptions']);
  if (data.runnerState) {
    runnerState = { ...runnerState, ...data.runnerState };
  }
  if (data.runnerOptions) {
    runnerState.options = { ...runnerState.options, ...data.runnerOptions };
  }
  return data.fasihQueue || [];
}

// Simpan state ke chrome.storage
async function saveQueueToStorage(queue) {
  await chrome.storage.local.set({ fasihQueue: queue, runnerState });
}

// Update status baris tertentu
async function updateItemStatus(index, itemStatus, errorMsg = '') {
  const data = await chrome.storage.local.get(['fasihQueue']);
  const queue = data.fasihQueue || [];
  if (queue[index]) {
    queue[index].status = itemStatus;
    if (errorMsg) {
      queue[index].error = errorMsg;
    } else if (itemStatus === 'SUCCESS') {
      queue[index].error = null;
    }
    await chrome.storage.local.set({ fasihQueue: queue });
    broadcastToPopup({
      action: 'QUEUE_UPDATED',
      index,
      itemStatus,
      queue
    });

    // Notifikasi Webhook difokuskan khusus untuk status makro antrian (Jeda, Stop, Selesai).
    // Error atau galat pada baris kuesioner dicatat lokal pada tabel antrian tanpa membanjiri notifikasi pesan.
  }
}

// Broadcast event ke popup
function broadcastToPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup sedang tertutup, tidak masalah
  });
}

// Variabel pengunci runner antrian agar tidak berjalan ganda
let isQueueRunning = false;
let queueRunToken = 0;
let isActiveTabTesting = false;

// Helper menutup tab secara aman dengan retry (mengatasi error transien Chrome "Tabs cannot be edited right now")
async function safeCloseTab(tabId, { allowSingleTabWindow = false } = {}) {
  if (!tabId) return true;
  for (let attempt = 1; attempt <= 4; attempt++) {
    let tabObj = null;
    try {
      tabObj = await chrome.tabs.get(tabId);
    } catch (e) {
      // Tab sudah tertutup
      return true;
    }
    if (!tabObj) return true;

    if (!allowSingleTabWindow) {
      try {
        const winTabs = await chrome.tabs.query({ windowId: tabObj.windowId });
        if (!winTabs || winTabs.length <= 1) {
          // Jangan tutup jika ini satu-satunya tab di window agar window Chrome tidak ikut tertutup
          return false;
        }
      } catch (e) {}
    }

    try {
      await chrome.tabs.remove(tabId);
      return true;
    } catch (err) {
      // Tunggu sebentar jika Chrome sedang mengunci tab strip (mis. user sedang klik tab/popup)
      await sleep(180 * attempt);
    }
  }

  // Cek terakhir apakah tab sudah hilang
  try {
    await chrome.tabs.get(tabId);
    return false;
  } catch (e) {
    return true;
  }
}


let apiHelperTabId = null;
let apiHelperNav = [];

// Listener perpindahan URL pada tab bantu API
chrome.tabs.onUpdated.addListener(async (tId, c, tab) => {
  if (tId === apiHelperTabId && c.url) apiHelperNav.push(c.url);

  // Jika suatu tab memasuki halaman login / SSO dan selesai dimuat:
  if (c.status === 'complete') {
    const url = (tab && tab.url) || c.url || '';
    if (isSsoOrLoginUrl(url)) {
      try {
        const stored = await chrome.storage.local.get(['runnerOptions', 'runnerState']).catch(() => null);
        const opts = stored?.runnerOptions || runnerState.options || {};
        const rState = stored?.runnerState || runnerState || {};
        // HANYA kirim trigger login SSO jika bot sedang RUNNING (Mulai Otomasi sudah ditekan)
        if (opts.autoSsoLogin !== false && rState.status === 'RUNNING') {
          chrome.tabs.sendMessage(tId, { action: 'TRIGGER_SSO_LOGIN', options: opts }).catch(() => {});
        }
      } catch (_) {}
    }
  }
});

// Jalankan pekerjaan API di tab bantu sebagai job + tanya status berkala
async function callApiJob(message, timeoutMs = 180000) {
  const tabId = await getApiHelperTab();
  const jobId = `j${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const start = await sendTabMessageWithRetry(tabId, { ...message, jobId });
  if (!start || start.status !== 'STARTED') return start;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(700);
    if (runnerState.status === 'STOPPED') return { status: 'ABORTED' };
    let st;
    try { st = await chrome.tabs.sendMessage(tabId, { action: 'API_JOB_STATUS', jobId }); }
    catch (e) { st = { status: 'DISCONNECTED', error: e.message || String(e) }; }
    if (st && st.status === 'RUNNING') continue;
    if (st && st.status === 'UNKNOWN_JOB') return { status: 'DISCONNECTED', error: 'halaman tab bantu dimuat ulang saat menyimpan' };
    return st;
  }
  return { status: 'DISCONNECTED', error: 'waktu tunggu API habis' };
}

function assignmentIdOf(item) {
  if (item.assignmentId && /^[0-9a-f-]{36}$/i.test(item.assignmentId)) return item.assignmentId;
  const ids = String(item.link_fasih_sm || item.link || '').match(UUID_RE_GLOBAL) || [];
  return ids.length ? ids[ids.length - 1] : null;
}

// Tab bantu (halaman FASIH tanpa form) untuk memanggil API — dipakai ulang selama antrian berjalan
async function getApiHelperTab() {
  if (apiHelperTabId) {
    try {
      const existingTab = await chrome.tabs.get(apiHelperTabId);
      if (existingTab && !isSsoOrLoginUrl(existingTab.url)) {
        return apiHelperTabId;
      }
    } catch (e) {
      apiHelperTabId = null;
    }
  }
  const t = await chrome.tabs.create({ url: 'https://fasih-sm.bps.go.id/app/', active: false });
  apiHelperTabId = t.id;
  apiHelperNav = [];
  await waitForTabComplete(t.id, 35000);
  await randomSleep(1500, 2200);

  // Jika tab bantu diarahkan ke login / SSO, proses login otomatis dan tunggu hingga kembali ke /app/
  let checkTab = null;
  try { checkTab = await chrome.tabs.get(t.id); } catch (_) {}
  if (checkTab && isSsoOrLoginUrl(checkTab.url)) {
    console.log('[TUNTAS BG] Tab bantu API dialihkan ke SSO/login. Memproses auto login SSO...');
    try {
      await chrome.tabs.sendMessage(t.id, {
        action: 'TRIGGER_SSO_LOGIN',
        options: runnerState.options
      });
    } catch (_) {}
    const landed = await waitForPostSsoLanding(t.id, 25000);
    if (landed) {
      await randomSleep(1500, 2200);
    }
  }

  return t.id;
}

function closeApiHelperTab() {
  if (apiHelperTabId) { chrome.tabs.remove(apiHelperTabId).catch(() => {}); apiHelperTabId = null; }
}

const ringkasPerubahan = (changes) => (changes || []).slice(0, 8)
  .map((c) => `${c.dataKey}: ${String(c.dari).slice(0, 30)} → ${String(c.ke).slice(0, 30)}`).join('; ') +
  ((changes || []).length > 8 ? ` (+${changes.length - 8} lagi)` : '');

// Hasil: { done: true } bila baris selesai di sini (uji coba / gagal), atau { done: false, note } untuk lanjut Kirim lewat form
async function runApiStep(item, index, { skipApprovedCheck = false } = {}) {
  const dryRun = runnerState.options.apiDryRun !== false;
  const id = assignmentIdOf(item);
  if (!id) { await updateItemStatus(index, 'FAILED', 'assignment_id tidak terbaca dari link / kolom'); return { done: true }; }
  await updateItemStatus(index, 'PROCESSING', dryRun ? 'Uji coba (dry run) lewat API...' : 'Menyimpan perubahan lewat API...');

  const row = { assignmentId: id, values: item.apiValues || {}, remarks: item.apiRemarks || {}, namaUsaha: item.namaUsahaExcel || item.nama_usaha || '' };
  const autoNote = item.apiNoteCode || '#1';
  const call = async (dr) => {
    try { return await callApiJob({ action: 'API_APPLY', row, dryRun: dr, autoNote, skipApprovedCheck }); }
    catch (e) { return { status: 'ERROR', error: e.message || String(e) }; }
  };
  let res = await call(dryRun);
  let verifikasi = '';
  for (let coba = 1; coba <= 2 && res && res.status === 'DISCONNECTED' && runnerState.status === 'RUNNING'; coba++) {
    const jejak = apiHelperNav.length ? ` [tab bantu: ${apiHelperNav.slice(-3).join(' → ')}]` : '';
    console.warn('[TUNTAS] API terputus:', res.error, jejak);
    closeApiHelperTab();
    await sleep(2000);
    await updateItemStatus(index, 'PROCESSING', `Koneksi terputus, memeriksa ulang ke server (${coba})...`);
    const cek = await call(true);
    if (!cek || cek.status !== 'DONE') { res = { status: 'ERROR', error: `koneksi ke tab bantu terputus (${res.error})${jejak}` }; break; }
    if (dryRun) { res = cek; break; }
    if (cek.result.noChange) {
      const b = (await chrome.storage.local.get(['apiBackups'])).apiBackups || {};
      res = { status: 'DONE', result: { ...cek.result, version: b[id] ? b[id].version : cek.result.version, versionAfter: cek.result.version } };
      verifikasi = ' (terverifikasi ulang)';
      break;
    }
    res = await call(false);
  }
  if (res && res.status === 'ABORTED') { await updateItemStatus(index, 'PENDING', 'Diberhentikan (Stop)'); return { done: true }; }
  if (res && res.result && res.result.needRevoke) {
    return { done: false, needRevoke: true, status: res.result.status, error: res.result.error };
  }
  const isApprovedError = res && res.error && /APPROV|sudah diapprove|sudah di-approve/i.test(String(res.error));
  if (isApprovedError) {
    return { done: false, needRevoke: true, error: res.error };
  }
  if (!res || res.status !== 'DONE') {
    await updateItemStatus(index, 'FAILED', `API: ${(res && res.error) || 'tidak ada respons'}`);
    return { done: true };
  }
  const r = res.result;
  const ringkas = r.noChange ? 'tidak ada perubahan (nilai sudah sama)' : `${r.nChanges} perubahan: ${ringkasPerubahan(r.changes)}`;

  if (dryRun) {
    await updateItemStatus(index, 'DRYRUN', `UJI ${r.code || ''} (v${r.version}): ${ringkas}`);
    return { done: true };
  }
  if (r.backup) {
    const store = await chrome.storage.local.get(['apiBackups']);
    let backups = store.apiBackups || {};
    backups[id] = r.backup;
    const keys = Object.keys(backups);
    if (keys.length > 60) {
      const trimmed = {};
      keys.slice(-50).forEach(k => { trimmed[k] = backups[k]; });
      backups = trimmed;
    }
    await chrome.storage.local.set({ apiBackups: backups });
  }
  if (verifikasi) return { done: false, note: `API tersimpan${verifikasi}, v${r.versionAfter}` };
  return { done: false, note: r.noChange ? 'API: tidak ada perubahan' : `API v${r.version}→v${r.versionAfter}: ${ringkas}` };
}

async function restoreApiBackups(ids, dryRun) {
  const store = await chrome.storage.local.get(['apiBackups']);
  const backups = store.apiBackups || {};
  const targets = (ids && ids.length ? ids : Object.keys(backups)).filter((id) => backups[id]);
  const results = [];
  const tabId = await getApiHelperTab();
  for (const id of targets) {
    const res = await callApiJob({ action: 'API_RESTORE', backup: backups[id], dryRun });
    results.push({ id, code: backups[id].code, ok: res && res.status === 'DONE', error: res && res.error,
      versionBefore: res && res.result && res.result.versionBefore, versionAfter: res && res.result && res.result.versionAfter });
    broadcastToPopup({ action: 'UPDATE_STEP', step: 'RESTORE', details: `${results.length}/${targets.length} ${backups[id].code || id}` });
  }
  closeApiHelperTab();
  return results;
}

// Fungsi pemroses 1 item antrian secara independen
async function processQueueItemSingle(queue, index, prevTabIdToClose = null) {
  if (runnerState.status !== 'RUNNING') {
    return { tabIdToClose: prevTabIdToClose };
  }

  if (!queue || !queue[index]) {
    return { tabIdToClose: prevTabIdToClose };
  }

  const item = queue[index];

  // Lewati jika BUKAN PENDING (misal sudah SUCCESS, SKIPPED, atau FAILED)
  if (item.status !== 'PENDING') {
    return { tabIdToClose: prevTabIdToClose };
  }

  const rawUrl = String(item.link_fasih_sm || item.link || '').trim().replace(/[\r\n\t]/g, '');
  if (!rawUrl || !rawUrl.startsWith('http')) {
    await updateItemStatus(index, 'FAILED', 'Link URL tidak valid.');
    return { tabIdToClose: prevTabIdToClose };
  }

  // Tambahkan /edit langsung di belakang link_fasih_sm untuk antrian
  const targetUrl = formatEditUrl(rawUrl, runnerState.options && runnerState.options.periodeId);

  // ===== Menu "Ubah Variabel" (API): data diubah lewat API SEBELUM form dibuka =====
  let apiNote = '';
  let tab = null;
  if (item.mode === 'API') {
    let pre = await runApiStep(item, index);
    if (pre.done) {
      return { tabIdToClose: prevTabIdToClose };
    }

    // Auto Revoke jika assignment sudah Approved sebelum simpan via API
    if (pre.needRevoke) {
      if (runnerState.options.autoRevoke === false) {
        await updateItemStatus(index, 'SKIPPED', 'Assignment sudah di-Approve (Auto Revoke tidak aktif)');
        return { tabIdToClose: prevTabIdToClose };
      }

      await updateItemStatus(index, 'PROCESSING', 'Assignment berstatus Approved. Memproses Auto Revoke...');
      let revokeTab = null;
      try {
        revokeTab = await chrome.tabs.create({ url: targetUrl, active: true });
        if (prevTabIdToClose && prevTabIdToClose !== revokeTab.id) {
          await safeCloseTab(prevTabIdToClose, { allowSingleTabWindow: true });
          prevTabIdToClose = null;
        }
        runnerState.activeTabId = revokeTab.id;
        runnerState.activeTargetUrl = targetUrl;
        await chrome.storage.local.set({ runnerState });

        await waitForTabComplete(revokeTab.id, 35000);
        await randomSleep(2000, 3000);

        let revRes = await sendTabMessageWithRetry(revokeTab.id, {
          action: 'REVOKE_ASSIGNMENT',
          options: runnerState.options
        }, 5);

        let isRevOk = (revRes && revRes.status === 'DONE' && revRes.result && revRes.result.success) ||
                      (revRes && revRes.status === 'DISCONNECTED' && runnerState.tabRevokedRecently);

        if (!isRevOk) {
          const reviewUrl = targetUrl.split('?')[0].split('#')[0].replace(/\/+$/, '').replace(/\/edit$/i, '');
          if (reviewUrl && reviewUrl !== targetUrl) {
            await chrome.tabs.update(revokeTab.id, { url: reviewUrl });
            await waitForTabComplete(revokeTab.id, 35000);
            await randomSleep(1800, 2600);
            revRes = await sendTabMessageWithRetry(revokeTab.id, {
              action: 'REVOKE_ASSIGNMENT',
              options: runnerState.options
            }, 5);
            isRevOk = (revRes && revRes.status === 'DONE' && revRes.result && revRes.result.success) ||
                      (revRes && revRes.status === 'DISCONNECTED');
          }
        }

        if (!isRevOk) {
          // Tombol Revoke tidak ada di toolbar kanan bawah (baik di /edit maupun reviewUrl).
          // Artinya: Dokumen BELUM di-Approve (sudah terbuka untuk langsung diedit)!
          console.log('[FASIH BG] Tombol Revoke tidak ditemukan: assignment belum di-Approve. Langsung melanjutkan penyimpanan variabel via API...');
          await updateItemStatus(index, 'PROCESSING', 'Assignment belum di-Approve. Menyimpan perubahan variabel via API...');
        } else {
          await updateItemStatus(index, 'PROCESSING', 'Revoke berhasil! Menyimpan perubahan variabel via API...');
        }

        // Jalankan penyimpanan variabel via API (skipApprovedCheck: true karena tab sudah diverifikasi langsung)
        pre = await runApiStep(item, index, { skipApprovedCheck: true });
        if (pre.done) {
          return { tabIdToClose: revokeTab.id };
        }
        apiNote = (pre.note || '') + (isRevOk ? ' (setelah Revoke)' : '');

        if (!runnerState.options.autoSubmitSurvey) {
          await updateItemStatus(index, 'SUCCESS', `Tersimpan lewat API (tanpa Kirim form) | ${apiNote}`);
          return { tabIdToClose: revokeTab.id };
        }

        // Muat ulang formulir /edit untuk verifikasi & submit
        await chrome.tabs.update(revokeTab.id, { url: targetUrl });
        await waitForTabComplete(revokeTab.id, 35000);
        await randomSleep(2000, 3000);
        tab = revokeTab;
      } catch (errRev) {
        await updateItemStatus(index, 'FAILED', `Gagal saat proses Revoke: ${errRev.message || errRev}`);
        return { tabIdToClose: revokeTab ? revokeTab.id : prevTabIdToClose };
      }
    } else {
      apiNote = pre.note;
      if (!runnerState.options.autoSubmitSurvey) {
        await updateItemStatus(index, 'SUCCESS', `Tersimpan lewat API (tanpa Kirim form) | ${apiNote}`);
        return { tabIdToClose: prevTabIdToClose };
      }
    }
  }

  await updateItemStatus(index, 'OPENING_TAB');

  let shouldCloseCurrentTab = false;
  let response = null;
  try {
    // Buat tab baru jika belum dibuat saat alur Revoke di atas
    if (!tab) {
      tab = await chrome.tabs.create({ url: targetUrl, active: true });
    }

    // KARENA tab baru sudah berhasil dibuat di window yang sama,
    // menutup tab sebelumnya (prevTabIdToClose) DIJAMIN AMAN dan tidak akan pernah menutup window browser!
    if (prevTabIdToClose && prevTabIdToClose !== tab.id) {
      await safeCloseTab(prevTabIdToClose, { allowSingleTabWindow: true });
      prevTabIdToClose = null;
    }

    runnerState.activeTabId = tab.id;
    runnerState.activeTargetUrl = targetUrl;
    await chrome.storage.local.set({ runnerState });

    // Tunggu sampai tab selesai loading (Smart Timeout 35s & 1x Reload jika macet)
    let isTabComplete = await waitForTabComplete(tab.id, 35000);
    if (!isTabComplete && runnerState.status === 'RUNNING') {
      console.log(`[FASIH BG] Tab ${tab.id} loading lambat (>35s). Mencoba 1x Smart Reload...`);
      broadcastToPopup({
        action: 'UPDATE_STEP',
        step: 'SMART_RELOAD',
        details: 'Loading lambat (>35 detik). Memuat ulang (reload) halaman...'
      });
      try {
        await chrome.tabs.reload(tab.id);
        isTabComplete = await waitForTabComplete(tab.id, 35000);
      } catch (eReload) {
        console.warn('Gagal reload tab:', eReload);
      }
    }

    await randomSleep(2000, 3200); // jeda stabilisasi rendering SPA secara natural

    if (runnerState.status !== 'RUNNING') {
      if (runnerState.status === 'PAUSED') {
        await updateItemStatus(index, 'PAUSED');
      } else {
        await updateItemStatus(index, 'PENDING');
      }
      return { tabIdToClose: tab.id };
    }

    // Jika setelah 1x reload halaman tetap tidak selesai dimuat (>70 detik)
    if (!isTabComplete) {
      const timeoutError = 'TIMEOUT_LOADING: Website FASIH tidak merespons setelah 70 detik.';
      await updateItemStatus(index, 'FAILED', timeoutError);
      runnerState.consecutiveFailures = (runnerState.consecutiveFailures || 0) + 1;
      checkCircuitBreaker();
      shouldCloseCurrentTab = Boolean(runnerState.options.closeTabOnComplete);
      await randomSleep(1000, 1500);
      return { tabIdToClose: shouldCloseCurrentTab && tab ? tab.id : null };
    }

    await updateItemStatus(index, 'PROCESSING');
    runnerState.ssoStepOnActiveTab = false;
    runnerState.lastWorkflowStep = '';

    let preStepUrl = '';
    try {
      const tBefore = await chrome.tabs.get(tab.id);
      preStepUrl = (tBefore && tBefore.url) || '';
    } catch (e) {}

    const baseReviewUrlFromTarget = targetUrl
      ? targetUrl.split('?')[0].split('#')[0].replace(/\/+$/, '').replace(/\/edit$/i, '')
      : '';

    const isRevokeStep = (stepName) => [
    'REVOKE_START',
    'REVOKE_CLICK',
    'REVOKE_CONFIRM',
    'REVOKE_CONFIRM_CLICK',
    'REVOKE_SUCCESS',
    'AUTO_REVOKE',
    'AUTO_REVOKE_DONE',
    'STEP_6_REVOKE_DIRECT',
    'STEP_6_REVOKE_OK'
  ].includes(stepName);

  const isPostSubmitStep = (stepName) => [
      'STEP_6_TOP_SUBMIT_CLICK',
      'STEP_6_SECONDARY_KIRIM',
      'STEP_7_CONFIRM',
      'STEP_7_CONFIRM_CLICK',
      'STEP_7_RETRY',
      'STEP_7_SUCCESS',
      'STEP_7_NO_CONFIRM',
      'FINISHED'
    ].includes(stepName);

    // Kirim pesan ke content script di tab (isActiveTabTest: false untuk antrian)
    response = await sendTabMessageWithRetry(tab.id, {
      action: 'EXECUTE_FASIH_WORKFLOW',
      options: {
        ...runnerState.options,
        targetUrl: targetUrl,
        isActiveTabTest: false,
        mode: (queue[index] && queue[index].mode) || runnerState.options.mode,
        kbliTask: (queue[index] && queue[index].kbliTask) || null,
        targetUsaha: (queue[index] && queue[index].targetUsaha) || '',
        commentText: (queue[index] && queue[index].commentText) || runnerState.options.commentText || '#DC_00',
        dc0Target: (queue[index] && queue[index].dc0Target) || runnerState.options.dc0Target || 'nilai',
        apiFinalize: (queue[index] && queue[index].mode === 'API') || runnerState.options.mode === 'API',
        blockOnGalat: (queue[index] && queue[index].mode === 'API') || runnerState.options.mode === 'API'
      }
    }, 5);

    // Periksa status runner setelah eksekusi tab selesai atau dibatalkan
    if (runnerState.status === 'STOPPED') {
      await updateItemStatus(index, 'PENDING', 'Diberhentikan (Stop)');
      return { tabIdToClose: tab.id };
    }
    if (runnerState.status === 'PAUSED') {
      await updateItemStatus(index, 'PAUSED', 'Dijeda (Pause)');
      return { tabIdToClose: tab.id };
    }

    // Tangani pengalihan bertahap (misal: /edit -> halaman login Selamat Datang Kembali -> SSO eksternal -> halaman /app -> halaman /edit)
    for (let redirectCount = 0; redirectCount < 8; redirectCount++) {
      const needRedirect = response && response.status === 'DONE' && response.result && response.result.needRedirectEdit;
      const ssoStage = response && response.status === 'DONE' && response.result && response.result.ssoStage;
      const isDisconnected = response && response.status === 'DISCONNECTED';

      // Jika terputus karena halaman otomatis berpindah/reload SETELAH klik Kirim/Konfirmasi, anggap submit selesai & lanjut ke Approve
      if (isDisconnected && isPostSubmitStep(runnerState.lastWorkflowStep)) {
        response = {
          status: 'DONE',
          result: {
            success: true,
            submitted: true,
            reviewUrl: baseReviewUrlFromTarget
          }
        };
        break;
      }

      // Jika terputus karena halaman otomatis reload SETELAH Revoke dikonfirmasi, tunggu reload selesai lalu lanjutkan workflow
      if (isDisconnected && (isRevokeStep(runnerState.lastWorkflowStep) || runnerState.tabRevokedRecently)) {
        console.log('[FASIH BG] Halaman reload terdeteksi setelah Revoke dikonfirmasi. Menunggu reload selesai...');
        runnerState.tabRevokedRecently = false;
        runnerState.lastWorkflowStep = '';
        await updateItemStatus(index, 'PROCESSING', 'Revoke berhasil! Menunggu formulir selesai dimuat ulang...');
        await sleep(1500);
        await waitForTabComplete(tab.id, 35000);
        await randomSleep(2000, 3000);

        let curTabUrl = '';
        try {
          const tNow = await chrome.tabs.get(tab.id);
          curTabUrl = (tNow && tNow.url) || '';
        } catch (_) {}

        if (targetUrl && !checkIsEditUrl(curTabUrl)) {
          await chrome.tabs.update(tab.id, { url: targetUrl });
          await waitForTabComplete(tab.id, 35000);
          await randomSleep(1800, 2600);
        }

        response = await sendTabMessageWithRetry(tab.id, {
          action: 'EXECUTE_FASIH_WORKFLOW',
          options: {
            ...runnerState.options,
            targetUrl: targetUrl,
            isActiveTabTest: false,
            isPostRevoke: true,
            mode: (queue[index] && queue[index].mode) || runnerState.options.mode,
            kbliTask: (queue[index] && queue[index].kbliTask) || null,
            targetUsaha: (queue[index] && queue[index].targetUsaha) || '',
            commentText: (queue[index] && queue[index].commentText) || runnerState.options.commentText || '#DC_00',
            dc0Target: (queue[index] && queue[index].dc0Target) || runnerState.options.dc0Target || 'nilai',
            apiFinalize: (queue[index] && queue[index].mode === 'API') || runnerState.options.mode === 'API',
            blockOnGalat: (queue[index] && queue[index].mode === 'API') || runnerState.options.mode === 'API'
          }
        }, 5);
        continue;
      }

      if (!needRedirect && !isDisconnected) break;

      const wasOnExternalSso = isExternalSsoIdpUrl(preStepUrl) || ssoStage === 'SUBMITTED_CREDENTIALS';
      const hadSsoStep = Boolean(runnerState.ssoStepOnActiveTab);
      runnerState.ssoStepOnActiveTab = false;

      if (wasOnExternalSso) {
        // Baru saja submit email & password di sso.bps.go.id -> tunggu hingga OAuth callback selesai mendarat di fasih-sm.bps.go.id
        await updateItemStatus(index, 'PROCESSING', 'Menyelesaikan sesi SSO & membuka /edit...');
        await waitForPostSsoLanding(tab.id, 18000);
        await sleep(1200);
      } else {
        await sleep(1200);
        await waitForTabComplete(tab.id, 35000);
        await randomSleep(1400, 2200);
      }

      let curUrl = '';
      try {
        const curTab = await chrome.tabs.get(tab.id);
        curUrl = (curTab && curTab.url) || '';
      } catch (e) {}

      // Jika DISCONNECTED tetapi bukan karena SSO/login dan bukan karena needRedirectEdit, jangan mengulang baris yang sama tanpa henti
      if (isDisconnected && !needRedirect && !wasOnExternalSso && !hadSsoStep && !isSsoOrLoginUrl(curUrl) && !isSsoOrLoginUrl(preStepUrl)) {
        // Beri jeda 800ms dan periksa ulang tab URL untuk memastikan tab bukan sedang navigasi ke SSO
        await sleep(800);
        let recheckUrl = '';
        try {
          const tNow = await chrome.tabs.get(tab.id);
          recheckUrl = (tNow && tNow.url) || '';
        } catch (_) {}
        if (!isSsoOrLoginUrl(recheckUrl) && !isExternalSsoIdpUrl(recheckUrl)) {
          break;
        }
        curUrl = recheckUrl;
      }

      const candidateEditUrl = (needRedirect && response.result && response.result.editUrl && /\/assignment\//i.test(response.result.editUrl))
        ? response.result.editUrl
        : '';
      let nextUrl = candidateEditUrl || targetUrl;

      const isStillSsoPage = isSsoOrLoginUrl(curUrl);
      if (isStillSsoPage || ssoStage === 'CLICKED_SSO_EKSTERNAL') {
        nextUrl = '';
      } else if (curUrl === nextUrl) {
        nextUrl = '';
      }

      if (nextUrl) {
        console.log(`[FASIH BG] Mengalihkan tab ${tab.id} ke: ${nextUrl}`);
        await updateItemStatus(index, 'PROCESSING', 'Membuka /edit...');
        await chrome.tabs.update(tab.id, { url: nextUrl });
        const editWaitComplete = await waitForTabComplete(tab.id, 35000);
        if (!editWaitComplete && runnerState.status === 'RUNNING') {
          try {
            await chrome.tabs.reload(tab.id);
            await waitForTabComplete(tab.id, 35000);
          } catch (e) {}
        }
        await randomSleep(2000, 3000);
      }

      if (runnerState.status === 'STOPPED') {
        await updateItemStatus(index, 'PENDING', 'Diberhentikan (Stop)');
        return { tabIdToClose: tab.id };
      }
      if (runnerState.status === 'PAUSED') {
        await updateItemStatus(index, 'PAUSED', 'Dijeda (Pause)');
        return { tabIdToClose: tab.id };
      }

      try {
        const tBeforeNext = await chrome.tabs.get(tab.id);
        preStepUrl = (tBeforeNext && tBeforeNext.url) || '';
      } catch (e) {
        preStepUrl = '';
      }

      runnerState.lastWorkflowStep = '';

      // Kirim ulang alur otomasi pada tab
      response = await sendTabMessageWithRetry(tab.id, {
        action: 'EXECUTE_FASIH_WORKFLOW',
        options: {
          ...runnerState.options,
          targetUrl: targetUrl,
          isActiveTabTest: false,
          mode: (queue[index] && queue[index].mode) || runnerState.options.mode,
          kbliTask: (queue[index] && queue[index].kbliTask) || null,
          targetUsaha: (queue[index] && queue[index].targetUsaha) || '',
          commentText: (queue[index] && queue[index].commentText) || runnerState.options.commentText || '#DC_00',
          dc0Target: (queue[index] && queue[index].dc0Target) || runnerState.options.dc0Target || 'nilai'
        }
      }, 5);

      if (runnerState.status === 'STOPPED') {
        await updateItemStatus(index, 'PENDING', 'Diberhentikan (Stop)');
        return { tabIdToClose: tab.id };
      }
      if (runnerState.status === 'PAUSED') {
        await updateItemStatus(index, 'PAUSED', 'Dijeda (Pause)');
        return { tabIdToClose: tab.id };
      }
    }

    if (response && response.status === 'DONE') {
      let res = response.result || {};

      // ALUR AUTO REVOKE: Jika assignment sudah di-Approve dan tombol Kirim tidak muncul
      if (res && res.needRevoke && runnerState.options.autoRevoke !== false) {
        await updateItemStatus(index, 'PROCESSING', 'Assignment sudah di-Approve. Memproses Revoke...');
        let revokeSuccess = false;
        let revokeError = null;
        try {
          // Coba Revoke langsung pada tab yang sedang aktif terlebih dahulu
          let revRes = await sendTabMessageWithRetry(tab.id, {
            action: 'REVOKE_ASSIGNMENT',
            options: runnerState.options
          }, 2);

          const isRevDisconn = (r) => r && r.status === 'DISCONNECTED' && (runnerState.tabRevokedRecently || isRevokeStep(runnerState.lastWorkflowStep));

          if ((revRes && revRes.status === 'DONE' && revRes.result && revRes.result.success) || isRevDisconn(revRes)) {
            revokeSuccess = true;
          } else if (res.reviewUrl) {
            // Jika tidak ditemukan di halaman aktif, buka halaman review
            await chrome.tabs.update(tab.id, { url: res.reviewUrl });
            await waitForTabComplete(tab.id, 35000, (u) => !/\/edit(\b|\/|$)/i.test(String(u || '').split('?')[0].split('#')[0]));
            await randomSleep(2000, 3000);

            revRes = await sendTabMessageWithRetry(tab.id, {
              action: 'REVOKE_ASSIGNMENT',
              options: runnerState.options
            }, 5);

            if ((revRes && revRes.status === 'DONE' && revRes.result && revRes.result.success) || isRevDisconn(revRes)) {
              revokeSuccess = true;
            } else {
              revokeError = (revRes && (revRes.result?.error || revRes.error)) || 'Tombol Revoke tidak ditemukan di halaman review';
            }
          } else {
            revokeError = (revRes && (revRes.result?.error || revRes.error)) || 'Tombol Revoke tidak ditemukan';
          }
        } catch (e) {
          revokeError = e.message || String(e);
        }

        if (!revokeSuccess) {
          await updateItemStatus(index, 'FAILED', `Gagal Revoke: ${revokeError}`);
          return { tabIdToClose: tab.id };
        }

        // Revoke berhasil! Sekarang buka kembali link /edit dan jalankan alur ulang
        await updateItemStatus(index, 'PROCESSING', 'Revoke berhasil! Membuka kembali formulir untuk mengisi catatan & kirim ulang...');
        await chrome.tabs.update(tab.id, { url: targetUrl });
        await waitForTabComplete(tab.id, 35000);
        await randomSleep(2000, 3000);

        const retryRes = await sendTabMessageWithRetry(tab.id, {
          action: 'EXECUTE_FASIH_WORKFLOW',
          options: {
            ...runnerState.options,
            ...item,
            isPostRevoke: true,
            mode: item.mode || runnerState.options.mode,
            targetUrl: targetUrl
          }
        }, 5);

        if (!retryRes || retryRes.status === 'ERROR') {
          await updateItemStatus(index, 'FAILED', `Setelah Revoke, pengisian formulir gagal: ${retryRes?.error || 'Tidak ada respon'}`);
          return { tabIdToClose: tab.id };
        }
        res = retryRes.result || {};
        res.wasRevoked = true;
      }
      if (res.skipped) {
        const reason = res.reason || 'Dilewati (Skip)';
        await updateItemStatus(index, 'SKIPPED', reason);
        runnerState.consecutiveFailures = 0;
      } else if (res.stoppedByUser) {
        await updateItemStatus(index, 'PENDING', 'Diberhentikan oleh pengguna');
        return { tabIdToClose: tab.id };
      } else if (res.success === false || res.hasGalat) {
        const errReason = res.error || 'Gagal validasi / terdapat galat formulir';
        await updateItemStatus(index, 'FAILED', errReason);
        // Galat formulir adalah validasi data survei normal, BUKAN server crash.
        // Hanya picu circuit breaker jika server terdeteksi down atau timeout jaringan.
        if (res.isServerDown || String(errReason).includes('SERVER_DOWN')) {
          runnerState.consecutiveFailures = (runnerState.consecutiveFailures || 0) + 1;
          checkCircuitBreaker();
        } else {
          runnerState.consecutiveFailures = 0;
        }
      } else {
        // Langkah Approve: setelah berhasil Kirim, buka halaman review lalu klik Approve
        let approveNote = '';
        let approveFailed = false;
        let noApproveButton = Boolean(res.noApproveButton);
        const reviewUrlToOpen = res.reviewUrl || baseReviewUrlFromTarget;
        if (res.approved) {
          approveNote = ' + Approve';
        } else if (noApproveButton) {
          approveNote = ' (Tombol Approve tidak muncul — langsung lanjut)';
        } else if (runnerState.options.autoApprove && (res.submitted || res.alreadySubmitted) && reviewUrlToOpen && tab && tab.id) {
          await updateItemStatus(index, 'PROCESSING', 'Membuka halaman review untuk Approve...');
          try {
            await chrome.tabs.update(tab.id, { url: reviewUrlToOpen });
            await waitForTabComplete(
              tab.id,
              35000,
              (u) => !/\/edit(\b|\/|$)/i.test(String(u || '').split('?')[0].split('#')[0])
            );
            await randomSleep(1800, 2600);
            const apr = await sendTabMessageWithRetry(tab.id, {
              action: 'APPROVE_ASSIGNMENT',
              options: runnerState.options
            }, 5);
            if (apr && apr.status === 'DONE' && apr.result && apr.result.success) {
              approveNote = ' + Approve';
            } else if (apr && apr.status === 'DONE' && apr.result && apr.result.noApproveButton) {
              noApproveButton = true;
              approveNote = ' (Tombol Approve tidak muncul — langsung lanjut)';
            } else if (apr && apr.status === 'DISCONNECTED') {
              // Halaman dimuat ulang setelah klik Approve
              approveNote = ' + Approve';
            } else {
              approveFailed = true;
              approveNote = (apr && (apr.result?.error || apr.error)) || 'Approve tidak terkonfirmasi';
            }
          } catch (e) {
            approveFailed = true;
            approveNote = 'Approve gagal: ' + (e.message || e);
          }
        }
        const kirimNote = res.alreadySubmitted
          ? 'Tombol Kirim tidak ada (sudah terkirim sebelumnya)'
          : (res.submitted ? `Sukses terkirim${res.wasRevoked ? ' (setelah Revoke)' : ''}` : 'Catatan tersimpan (tanpa kirim)');
        const remarkNote = res.alreadyHasRemark ? ' (Remark sudah ada)' : '';
        if (noApproveButton) {
          res.noApproveButton = true;
          if (res.alreadySubmitted) {
            await updateItemStatus(index, 'SKIPPED', `Tombol Kirim & Approve tidak muncul (dilewati)${remarkNote}`);
          } else {
            const msg = `${kirimNote}${remarkNote}${approveNote}${res.kbliSummary ? ' | KBLI: ' + res.kbliSummary : ''}`;
            await updateItemStatus(index, 'SKIPPED', msg);
          }
        } else if (approveFailed) {
          await updateItemStatus(index, 'FAILED', `${kirimNote}${remarkNote}, tetapi APPROVE GAGAL: ${approveNote}`);
        } else if (res.alreadySubmitted && !approveNote) {
          await updateItemStatus(index, 'SKIPPED', `${kirimNote}${remarkNote}; Approve tidak dijalankan`);
        } else {
          const msg = `${kirimNote}${remarkNote}${approveNote}${res.kbliSummary ? ' | KBLI: ' + res.kbliSummary : ''}`;
          await updateItemStatus(index, 'SUCCESS', msg);
        }
        runnerState.consecutiveFailures = 0; // Reset counter kegagalan beruntun
      }

      const shouldCloseByOption = runnerState.options.closeTabOnComplete !== false;
      if (shouldCloseByOption && (res.skipped || res.alreadyHasRemark || res.noApproveButton || res.alreadySubmitted || res.success)) {
        shouldCloseCurrentTab = true;
      }
    } else if (response && response.status === 'ABORTED') {
      await updateItemStatus(index, 'PENDING', 'Diberhentikan oleh pengguna');
      return { tabIdToClose: tab.id };
    } else if (response && response.status === 'DISCONNECTED') {
      let where = '';
      try { where = (await chrome.tabs.get(tab.id)).url || ''; } catch (e) {}
      await updateItemStatus(index, 'FAILED',
        'TERPUTUS: halaman berpindah sebelum bot selesai, tidak diulang otomatis. Cek status dokumen di FASIH' + (where ? ` (${where})` : ''));
      runnerState.consecutiveFailures = 0;
      shouldCloseCurrentTab = true;
    } else {
      let err = (response && response.error) ? response.error : 'Eksekusi gagal';
      const isServerIssue = Boolean(response?.result?.isServerDown || String(err).includes('TIMEOUT') || String(err).includes('SERVER_DOWN'));
      if (response && response.result && response.result.isServerDown) {
        err = response.result.error || err;
      }
      await updateItemStatus(index, 'FAILED', err);
      if (isServerIssue) {
        runnerState.consecutiveFailures = (runnerState.consecutiveFailures || 0) + 1;
        checkCircuitBreaker();
      } else {
        runnerState.consecutiveFailures = 0;
      }
      shouldCloseCurrentTab = true;
    }

    // Jika dilewati (remark sudah ada, submit sudah ada, no approve), langsung lanjut tanpa jeda lama
    const isFastSkip = Boolean(
      response &&
      response.status === 'DONE' &&
      response.result &&
      (response.result.alreadyHasRemark || response.result.noApproveButton || response.result.skipped || response.result.alreadySubmitted)
    );

    const shouldCloseByOption = runnerState.options.closeTabOnComplete !== false;
    let tabIdToClose = null;

    if (shouldCloseCurrentTab && shouldCloseByOption && tab && tab.id) {
      if (!isFastSkip) {
        await randomSleep(400, 750);
      }

      const closedNow = await safeCloseTab(tab.id);
      if (closedNow) {
        tabIdToClose = null;
        if (runnerState.activeTabId === tab.id) {
          runnerState.activeTabId = null;
          await chrome.storage.local.set({ runnerState });
        }
        await sleep(isFastSkip ? 150 : 400);
      } else {
        // Jika window hanya punya 1 tab atau Chrome sempat mengunci tab strip,
        // serahkan tab.id ini ke iterasi berikutnya agar ditutup begitu tab baris selanjutnya dibuka!
        tabIdToClose = tab.id;
        await sleep(isFastSkip ? 150 : 400);
      }
    }

    return { tabIdToClose };
  } catch (err) {
    if (runnerState.status === 'STOPPED') {
      await updateItemStatus(index, 'PENDING', 'Diberhentikan (Stop)');
      return { tabIdToClose: tab && tab.id ? tab.id : null };
    }
    console.error('Error processing item', index, err);
    const errMsg = err.message || String(err);
    const isServerIssue = errMsg.includes('TIMEOUT') || errMsg.includes('SERVER_DOWN');
    await updateItemStatus(index, 'FAILED', errMsg);
    if (isServerIssue) {
      runnerState.consecutiveFailures = (runnerState.consecutiveFailures || 0) + 1;
      checkCircuitBreaker();
    } else {
      runnerState.consecutiveFailures = 0;
    }
    if (runnerState.options.closeTabOnComplete !== false && tab && tab.id) {
      try {
        const closed = await safeCloseTab(tab.id);
        return { tabIdToClose: closed ? null : tab.id };
      } catch (eClose) {}
    }
    return { tabIdToClose: null };
  }
}

// Runner utama berbasis perulangan sekuensial (while-loop) yang stabil, anti-stuck & anti-terminasi SW
async function startQueueRunner(fromIndex = null, { forceRestart = false } = {}) {
  if (isQueueRunning && !forceRestart) {
    console.log('[FASIH BG] Queue runner sedang berjalan, panggilan diabaikan.');
    return;
  }
  const myRunToken = ++queueRunToken;
  isQueueRunning = true;
  startKeepAlive();

  try {
    let prevTabIdToClose = runnerState.activeTabId || null;
    let targetIndex = fromIndex;

    while (runnerState.status === 'RUNNING' && queueRunToken === myRunToken) {
      const data = await chrome.storage.local.get(['fasihQueue', 'runnerState']);
      if (data.runnerState && data.runnerState.status !== 'RUNNING') {
        runnerState.status = data.runnerState.status;
        break;
      }
      const queue = data.fasihQueue || [];
      if (!queue.length) break;

      const searchFrom = targetIndex !== null ? targetIndex : runnerState.currentIndex;
      targetIndex = null;

      const nextIdx = findNextPendingIndex(queue, searchFrom);
      if (nextIdx === -1) {
        // Semua item PENDING dalam antrian telah selesai
        break;
      }

      runnerState.currentIndex = nextIdx;
      await chrome.storage.local.set({ runnerState });

      // Proses 1 baris antrian secara sekuensial dan tunggu sampai selesai
      let res = null;
      try {
        res = await processQueueItemSingle(queue, nextIdx, prevTabIdToClose);
      } catch (errProc) {
        console.error('[FASIH BG] Error saat memproses baris', nextIdx, errProc);
        res = { tabIdToClose: prevTabIdToClose };
      }
      if (queueRunToken !== myRunToken) break;
      prevTabIdToClose = (res && res.tabIdToClose) || null;

      // Pastikan iterasi berikutnya mulai mencari dari baris setelah nextIdx
      targetIndex = (nextIdx + 1) < queue.length ? (nextIdx + 1) : 0;

      // Sinkronkan status runner & majukan currentIndex ke baris PENDING berikutnya agar UI tidak nyangkut di baris lama
      const refreshedState = await chrome.storage.local.get(['runnerState', 'fasihQueue']);
      if (refreshedState.runnerState?.status) {
        runnerState.status = refreshedState.runnerState.status;
      }
      if (runnerState.status !== 'RUNNING') break;

      const latestQueue = refreshedState.fasihQueue || queue;
      const upcomingIdx = findNextPendingIndex(latestQueue, targetIndex);
      if (upcomingIdx !== -1) {
        runnerState.currentIndex = upcomingIdx;
        await chrome.storage.local.set({ runnerState });
      }
    }

    // Jika antrian selesai sampai akhir (masih RUNNING dan tidak ada PENDING lagi)
    if (queueRunToken === myRunToken && runnerState.status === 'RUNNING') {
      const shouldCloseByOption = runnerState.options.closeTabOnComplete !== false;
      if (shouldCloseByOption && prevTabIdToClose) {
        const closedLast = await safeCloseTab(prevTabIdToClose);
        if (!closedLast) {
          try {
            await chrome.tabs.update(prevTabIdToClose, { url: 'https://fasih-sm.bps.go.id/app' });
          } catch (e) {}
        }
      }
      runnerState.status = 'IDLE';
      runnerState.activeTabId = null;
      stopKeepAlive();
      await chrome.storage.local.set({ runnerState });
      broadcastToPopup({ action: 'ALL_COMPLETED' });
      sendWebhookStatusNotification({
        event: 'ALL_COMPLETED',
        status: 'COMPLETED',
        details: 'Semua item dalam antrian sudah selesai diproses.'
      }).catch(() => {});
      syncWithWhatsAppRemote({ force: true }).catch(() => {});
    }
  } catch (err) {
    console.error('[FASIH BG] Error pada antrian loop:', err);
  } finally {
    if (queueRunToken === myRunToken) {
      isQueueRunning = false;
    }
  }
}

// Wrapper backward-compatible
function processQueueItem(queue, index, prevTabIdToClose = null) {
  if (runnerState.status === 'RUNNING') {
    startQueueRunner(index, { forceRestart: true });
  }
}

// Helper deteksi apakah URL masih dalam tahap SSO / OAuth / Login
function isSsoOrLoginUrl(urlStr) {
  const lower = String(urlStr || '').toLowerCase();
  if (!lower) return false;
  return (
    lower.includes('/login') ||
    lower.includes('/auth') ||
    lower.includes('/oauth') ||
    lower.includes('sso.bps.go.id') ||
    lower.includes('cas.bps.go.id') ||
    lower.includes('auth.bps.go.id') ||
    lower.includes('protocol/openid-connect') ||
    lower.includes('code=') ||
    lower.includes('session_state=')
  );
}

// Helper deteksi apakah URL berada di halaman IdP SSO Eksternal BPS
function isExternalSsoIdpUrl(urlStr) {
  const lower = String(urlStr || '').toLowerCase();
  if (!lower) return false;
  return (
    lower.includes('sso.bps.go.id') ||
    lower.includes('cas.bps.go.id') ||
    lower.includes('auth.bps.go.id') ||
    lower.includes('protocol/openid-connect')
  );
}

// Helper: Tunggu hingga proses redirect pasca-submit SSO kembali ke domain fasih-sm.bps.go.id (di luar halaman login/oauth)
async function waitForPostSsoLanding(tabId, maxWaitMs = 18000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (runnerState.status === 'STOPPED' || runnerState.status === 'PAUSED') return '';
    try {
      const t = await chrome.tabs.get(tabId);
      const u = (t && t.url) || '';
      if (u && t.status === 'complete' && u.toLowerCase().includes('fasih-sm.bps.go.id') && !isSsoOrLoginUrl(u)) {
        return u;
      }
    } catch (e) {
      return '';
    }
    await sleep(450);
  }
  try {
    const t = await chrome.tabs.get(tabId);
    return (t && t.url) || '';
  } catch (e) {
    return '';
  }
}

// Helper: Tunggu tab selesai load dengan pengecekan status STOP/PAUSE & status tab berkala
function waitForTabComplete(tabId, timeoutMs = 35000, urlValidator = null) {
  return new Promise((resolve) => {
    let finished = false;
    const startTime = Date.now();
    const isTabReady = (t) => {
      if (!t || t.status !== 'complete' || t.pendingUrl) return false;
      const u = t.url || '';
      if (!/^https?:\/\//i.test(u)) return false;
      if (typeof urlValidator === 'function' && !urlValidator(u)) return false;
      return true;
    };

    const cleanUp = () => {
      if (finished) return;
      finished = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearInterval(checkInterval);
      clearTimeout(timer);
    };

    const listener = async (updatedTabId, changeInfo, tabObj) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        try {
          const t = tabObj && tabObj.url ? tabObj : await chrome.tabs.get(tabId);
          if (isTabReady(t)) {
            cleanUp();
            resolve(true);
          }
        } catch (e) {}
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // Cek stop/pause segera & cek apakah tab sudah 'complete' setiap 250ms
    const checkInterval = setInterval(async () => {
      if (runnerState.status === 'STOPPED' || runnerState.status === 'PAUSED') {
        cleanUp();
        resolve(false);
        return;
      }
      if (Date.now() - startTime >= 350) {
        try {
          const t = await chrome.tabs.get(tabId);
          if (isTabReady(t)) {
            cleanUp();
            resolve(true);
          }
        } catch (e) {
          cleanUp();
          resolve(false);
        }
      }
    }, 250);

    // Timeout fallback (halaman tidak selesai dalam timeoutMs)
    const timer = setTimeout(() => {
      cleanUp();
      resolve(false);
    }, timeoutMs);
  });
}

// Helper kirim pesan ke tab dengan retry (antisipasi content script belum siap)
// Buka /app/assignment-detail/<id> lalu baca STATUS ASSIGNMENT (mis. "APPROVED BY Admin Kabupaten")
async function readAssignmentStatus(tabId, reviewUrl) {
  try {
    const id = (String(reviewUrl).match(UUID_RE_GLOBAL) || []).pop();
    if (!id) return '';
    const origin = new URL(reviewUrl).origin;
    await chrome.tabs.update(tabId, { url: `${origin}/app/assignment-detail/${id}` });
    await waitForTabComplete(tabId, 35000);
    for (let i = 0; i < 10; i++) {
      await sleep(1200);
      const r = await sendTabMessageWithRetry(tabId, { action: 'READ_STATUS' });
      if (r && r.statusText) return r.statusText;
    }
  } catch (e) {}
  return '';
}
const UUID_RE_GLOBAL = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Pastikan content script siap (PING berulang), lalu kirim perintah SATU KALI.
// Perintah TIDAK pernah dikirim ulang: bila halaman berpindah/terputus di tengah proses,
// hasilnya DISCONNECTED (dokumen tidak diproses ulang secara otomatis).
async function waitContentReady(tabId, maxTries = 8) {
  for (let i = 1; i <= maxTries; i++) {
    if (runnerState.status === 'STOPPED') return false;
    try {
      const pong = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (pong && pong.status === 'PONG') return true;
    } catch (e) {
      if (i === Math.ceil(maxTries / 2)) {
        try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] }); } catch (e2) {}
      }
    }
    await sleep(1500);
  }
  return false;
}

async function sendTabMessageWithRetry(tabId, message) {
  if (runnerState.status === 'STOPPED') return { status: 'ABORTED' };
  while (runnerState.status === 'PAUSED') {
    await sleep(300);
    if (runnerState.status === 'STOPPED') return { status: 'ABORTED' };
  }
  const ready = await waitContentReady(tabId);
  if (!ready) {
    if (runnerState.status === 'STOPPED') return { status: 'ABORTED' };
    return { status: 'ERROR', error: 'Halaman FASIH tidak merespons (content script belum siap). Coba lagi.' };
  }
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (runnerState.status === 'STOPPED') return { status: 'ABORTED' };
    return { status: 'DISCONNECTED', error: err.message || String(err) };
  }
}

// Listener pesan dari Popup dan Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_THROTTLE_STATE') {
    sendResponse(getThrottlePublicState());
    return false;
  }

  if (request.action === 'SET_ADAPTIVE_THROTTLE') {
    if (runnerState.options) {
      runnerState.options.enableAdaptiveThrottling = Boolean(request.enabled);
    }
    updateThrottleStatus();
    broadcastToPopup({ action: 'THROTTLE_STATE_UPDATED', throttleState: getThrottlePublicState() });
    chrome.storage.local.set({ runnerOptions: runnerState.options }).catch(() => {});
    sendResponse({ ok: true, throttleState: getThrottlePublicState() });
    return false;
  }

  if (request.action === 'RECORD_SERVER_LATENCY') {
    recordServerLatency(request.source || 'DOM_WAIT', request.duration || 0, {
      isError: Boolean(request.isError),
      errorMsg: request.errorMsg || ''
    });
    sendResponse({ ok: true, throttleState: getThrottlePublicState() });
    return false;
  }

  if (request.action === 'UPDATE_OPTIONS') {
    if (request.options) {
      runnerState.options = { ...runnerState.options, ...request.options };
      chrome.storage.local.set({ runnerOptions: runnerState.options }).catch(() => {});
    }
    sendResponse({ ok: true, options: runnerState.options });
    return false;
  }

  if (request.action === 'TEST_WHATSAPP_SYNC') {
    (async () => {
      if (request.whatsappSyncUrl) {
        const url = request.whatsappSyncUrl.trim();
        runnerState.options.whatsappSyncUrl = url;
        const store = await chrome.storage.local.get(['runnerOptions']);
        const curOpts = store.runnerOptions || {};
        curOpts.whatsappSyncUrl = url;
        await chrome.storage.local.set({ runnerOptions: { ...runnerState.options, ...curOpts } });
      }
      const res = await syncWithWhatsAppRemote({ force: true, test: true });
      sendResponse(res);
    })();
    return true;
  }

  if (request.action === 'GET_WHATSAPP_SYNC_STATE') {
    sendResponse(lastWhatsAppSyncResult);
    return false;
  }

  if (request.action === 'START_QUEUE') {
    (async () => {
      const queue = await loadStateFromStorage();
      if (!queue || queue.length === 0) {
        sendResponse({ success: false, message: 'Antrian kosong.' });
        return;
      }
      // Pulihkan item yang sempat menggantung (OPENING_TAB / PROCESSING / PAUSED) menjadi PENDING
      let hasStuckReset = false;
      for (let i = 0; i < queue.length; i++) {
        if (queue[i] && (queue[i].status === 'OPENING_TAB' || queue[i].status === 'PROCESSING' || queue[i].status === 'PAUSED')) {
          queue[i].status = 'PENDING';
          hasStuckReset = true;
        }
      }
      if (hasStuckReset) {
        await chrome.storage.local.set({ fasihQueue: queue });
      }

      runnerState.consecutiveFailures = 0;
      runnerState.status = 'RUNNING';
      if (request.options) {
        runnerState.options = { ...runnerState.options, ...request.options };
      }

      // Cari item PENDING mulai dari runnerState.currentIndex, lalu fallback dari awal (index 0)
      let startIndex = findNextPendingIndex(queue, runnerState.currentIndex);
      if (startIndex === -1) {
        startIndex = findNextPendingIndex(queue, 0);
      }

      // Jika seluruh antrian sudah selesai (tidak ada item PENDING)
      if (startIndex === -1) {
        stopKeepAlive();
        runnerState.status = 'IDLE';
        await chrome.storage.local.set({ runnerState, runnerOptions: runnerState.options });
        broadcastToPopup({ action: 'ALL_COMPLETED' });
        sendWebhookStatusNotification({
          event: 'ALL_COMPLETED',
          status: 'COMPLETED',
          details: 'Semua item dalam antrian sudah selesai diproses.'
        }).catch(() => {});
        syncWithWhatsAppRemote({ force: true }).catch(() => {});
        sendResponse({ success: false, allCompleted: true, message: 'Semua item dalam antrian sudah selesai diproses.' });
        return;
      }

      await chrome.storage.local.set({ runnerState, runnerOptions: runnerState.options });
      if (hasStuckReset) broadcastToPopup({ action: 'QUEUE_UPDATED', queue });
      processQueueItem(queue, startIndex);
      sendResponse({ success: true, startIndex });
    })();
    return true;
  }

  if (request.action === 'RETRY_FAILED_QUEUE') {
    (async () => {
      const res = await retryFailedQueueItems(request.options);
      sendResponse(res);
    })();
    return true;
  }

  if (request.action === 'PAUSE_QUEUE') {
    (async () => {
      await pauseQueueExecution('Dijeda oleh pengguna dari pop-up');
      syncWithWhatsAppRemote({ force: true }).catch(() => {});
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === 'RESUME_QUEUE') {
    (async () => {
      const queue = await loadStateFromStorage();
      runnerState.consecutiveFailures = 0;
      runnerState.status = 'RUNNING';
      if (request.options) {
        runnerState.options = { ...runnerState.options, ...request.options };
      }
      await chrome.storage.local.set({ runnerState, runnerOptions: runnerState.options });

      // Jika loop antrian masih aktif dan tab saat ini masih dalam proses/dijeda, lanjutkan tab tersebut
      const curItem = queue[runnerState.currentIndex];
      const isCurrentTabStillInProgress = curItem && (curItem.status === 'PAUSED' || curItem.status === 'PROCESSING' || curItem.status === 'OPENING_TAB');
      if (isQueueRunning && runnerState.activeTabId && isCurrentTabStillInProgress) {
        try {
          const tab = await chrome.tabs.get(runnerState.activeTabId);
          if (tab && !tab.discarded) {
            // Kembalikan item PAUSED lainnya ke PENDING, dan item aktif ke PROCESSING
            for (let i = 0; i < queue.length; i++) {
              if (queue[i] && queue[i].status === 'PAUSED') {
                queue[i].status = (i === runnerState.currentIndex) ? 'PROCESSING' : 'PENDING';
              }
            }
            await chrome.storage.local.set({ fasihQueue: queue });
            broadcastToPopup({ action: 'QUEUE_UPDATED', index: runnerState.currentIndex, queue });
            chrome.tabs.sendMessage(runnerState.activeTabId, { action: 'RESUME_WORKFLOW' }).catch(() => {});
            sendResponse({ success: true, resumedTab: runnerState.activeTabId });
            return;
          }
        } catch (e) {}
      }

      // Jika loop sudah berhenti atau item pada tab aktif sudah selesai (mis. SKIPPED/SUCCESS),
      // kembalikan semua item yang menggantung (PAUSED/PROCESSING/OPENING_TAB) ke PENDING
      let hasReset = false;
      for (let i = 0; i < queue.length; i++) {
        if (queue[i] && (queue[i].status === 'PAUSED' || queue[i].status === 'PROCESSING' || queue[i].status === 'OPENING_TAB')) {
          queue[i].status = 'PENDING';
          hasReset = true;
        }
      }
      if (hasReset) {
        await chrome.storage.local.set({ fasihQueue: queue });
        broadcastToPopup({ action: 'QUEUE_UPDATED', queue });
      }

      // Lanjutkan antrian ke item PENDING mulai dari currentIndex
      let nextIndex = findNextPendingIndex(queue, runnerState.currentIndex);
      if (nextIndex === -1) {
        nextIndex = findNextPendingIndex(queue, 0);
      }

      if (nextIndex === -1) {
        if (runnerState.activeTabId && runnerState.options.closeTabOnComplete !== false) {
          await safeCloseTab(runnerState.activeTabId);
        }
        stopKeepAlive();
        runnerState.status = 'IDLE';
        runnerState.activeTabId = null;
        await chrome.storage.local.set({ runnerState });
        broadcastToPopup({ action: 'ALL_COMPLETED' });
        sendResponse({ success: false, allCompleted: true, message: 'Semua item dalam antrian sudah selesai diproses.' });
        return;
      }

      processQueueItem(queue, nextIndex);
      sendResponse({ success: true, nextIndex });
    })();
    return true;
  }

  if (request.action === 'STOP_QUEUE') {
    (async () => {
      await stopQueueExecution('Diberhentikan oleh pengguna dari pop-up');
      syncWithWhatsAppRemote({ force: true }).catch(() => {});
      sendResponse({ success: true });
    })();
    return true;
  }

    // ---------- Backup & restore menu API ----------
  if (request.action === 'API_BACKUP_SAVE') {
    (async () => {
      const b = request.backup;
      if (b && b.assignmentId) {
        const store = await chrome.storage.local.get(['apiBackups']);
        const backups = store.apiBackups || {};
        if (!backups[b.assignmentId]) { backups[b.assignmentId] = b; await chrome.storage.local.set({ apiBackups: backups }); }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (request.action === 'API_BACKUP_INFO') {
    chrome.storage.local.get(['apiBackups']).then((d) => {
      const b = d.apiBackups || {};
      sendResponse({ count: Object.keys(b).length, backups: b });
    });
    return true;
  }
  if (request.action === 'API_RESTORE_BACKUPS') {
    (async () => {
      try {
        const results = await restoreApiBackups(request.ids || [], request.dryRun !== false);
        if (request.dryRun === false) {
          const okIds = results.filter((r) => r.ok).map((r) => r.id);
          const d = await chrome.storage.local.get(['apiBackups']);
          const b = d.apiBackups || {};
          okIds.forEach((id) => { delete b[id]; });
          await chrome.storage.local.set({ apiBackups: b });
        }
        sendResponse({ ok: true, results });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }
  if (request.action === 'API_CLEAR_BACKUPS') {
    chrome.storage.local.set({ apiBackups: {} }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (request.action === 'GET_RUNNER_STATE') {
    (async () => {
      const data = await chrome.storage.local.get(['runnerState', 'fasihQueue', 'runnerOptions']);
      const storedState = data.runnerState || runnerState;
      const queue = data.fasihQueue || [];
      const options = data.runnerOptions || runnerState.options;

      // Auto-recovery: jika status di storage masih RUNNING tapi loop tidak berjalan (mis. SW baru aktif kembali atau sempat nyangkut)
      if (storedState && storedState.status === 'RUNNING' && !isQueueRunning && !isActiveTabTesting) {
        runnerState = { ...runnerState, ...storedState, options: { ...runnerState.options, ...options } };
        let hasReset = false;
        for (let i = 0; i < queue.length; i++) {
          if (queue[i] && (queue[i].status === 'OPENING_TAB' || queue[i].status === 'PROCESSING' || queue[i].status === 'PAUSED')) {
            queue[i].status = 'PENDING';
            hasReset = true;
          }
        }
        if (hasReset) {
          await chrome.storage.local.set({ fasihQueue: queue });
        }
        let nextIdx = findNextPendingIndex(queue, runnerState.currentIndex || 0);
        if (nextIdx === -1) nextIdx = findNextPendingIndex(queue, 0);
        if (nextIdx !== -1) {
          runnerState.currentIndex = nextIdx;
          await chrome.storage.local.set({ runnerState });
          startQueueRunner(nextIdx, { forceRestart: true });
        } else {
          if (runnerState.activeTabId && runnerState.options.closeTabOnComplete !== false) {
            await safeCloseTab(runnerState.activeTabId);
          }
          runnerState.status = 'IDLE';
          runnerState.activeTabId = null;
          await chrome.storage.local.set({ runnerState });
        }
      }

      sendResponse({
        runnerState: runnerState.status ? runnerState : storedState,
        queue,
        options
      });
    })();
    return true;
  }

  if (request.action === 'TEST_WEBHOOK') {
    (async () => {
      const customUrl = (request.webhookUrl || DEFAULT_WEBHOOK_URL).trim();
      if (request.options) {
        runnerState.options = { ...runnerState.options, ...request.options };
      }
      const res = await sendWebhookErrorNotification({
        event: 'TEST_WEBHOOK',
        index: 0,
        item: {
          excelRowNum: 1,
          mode: runnerState.options.mode || 'DC0',
          nama_usaha: 'CONTOH USAHA TES WEBHOOK',
          link_fasih_sm: 'https://fasih-sm.bps.go.id/app/assignment-detail/00000000-0000-0000-0000-000000000000'
        },
        totalQueue: 1,
        errorMsg: 'Ini adalah pesan uji coba (Test Webhook) dari ekstensi TUNTAS SE2026.',
        customUrl
      });
      sendResponse(res);
    })();
    return true;
  }

  if (request.action === 'RUN_ACTIVE_TAB_TEST') {
    (async () => {
      isActiveTabTesting = true;
      try {
        const tabId = request.tabId;
        const opts = request.options || {};
        runnerState.options = { ...runnerState.options, ...opts };
        runnerState.status = 'RUNNING';
        runnerState.activeTabId = tabId;
        await chrome.storage.local.set({ runnerState });

        let initialUrl = '';
        try {
          const t0 = await chrome.tabs.get(tabId);
          initialUrl = (t0 && t0.url) || '';
        } catch (e) {}

        const isInitialLoginUrl = isSsoOrLoginUrl(initialUrl);
        let targetEditUrl = (!isInitialLoginUrl && initialUrl && /\/assignment/i.test(initialUrl))
          ? formatEditUrl(initialUrl, opts.periodeId)
          : '';

        // Jika dijalankan dari halaman Login/Beranda namun antrian Excel sudah ter-upload,
        // gunakan link edit dari item antrian aktif/PENDING pertama agar setelah login langsung membuka /edit
        if (!targetEditUrl) {
          if (runnerState.activeTargetUrl && /\/assignment/i.test(runnerState.activeTargetUrl)) {
            targetEditUrl = runnerState.activeTargetUrl;
          } else {
            try {
              const qData = await chrome.storage.local.get(['fasihQueue']);
              const qList = qData.fasihQueue || [];
              const pendingIdx = findNextPendingIndex(qList, runnerState.currentIndex || 0);
              const fallbackItem = pendingIdx !== -1 ? qList[pendingIdx] : qList[0];
              const rawLink = fallbackItem && (fallbackItem.link_fasih_sm || fallbackItem.link);
              if (rawLink && rawLink.startsWith('http')) {
                targetEditUrl = formatEditUrl(rawLink, opts.periodeId || (runnerState.options && runnerState.options.periodeId));
              }
            } catch (e) {}
          }
        }

        let preStepUrl = initialUrl;

        let response = await sendTabMessageWithRetry(tabId, {
          action: 'EXECUTE_FASIH_WORKFLOW',
          options: { ...opts, targetUrl: targetEditUrl }
        });

        for (let redirectCount = 0; redirectCount < 8; redirectCount++) {
          if (runnerState.status !== 'RUNNING') break;
          const needRedirect = response && response.status === 'DONE' && response.result && response.result.needRedirectEdit;
          const ssoStage = response && response.status === 'DONE' && response.result && response.result.ssoStage;
          const isDisconnected = response && response.status === 'DISCONNECTED';

          if (isDisconnected && (isRevokeStep(runnerState.lastWorkflowStep) || runnerState.tabRevokedRecently)) {
            console.log('[FASIH BG Active] Halaman reload terdeteksi setelah Revoke di tab aktif.');
            runnerState.tabRevokedRecently = false;
            runnerState.lastWorkflowStep = '';
            await sleep(1500);
            await waitForTabComplete(tabId, 35000);
            await randomSleep(2000, 3000);

            let curTabUrl = '';
            try {
              const tNow = await chrome.tabs.get(tabId);
              curTabUrl = (tNow && tNow.url) || '';
            } catch (_) {}

            if (targetEditUrl && !checkIsEditUrl(curTabUrl)) {
              await chrome.tabs.update(tabId, { url: targetEditUrl });
              await waitForTabComplete(tabId, 35000);
              await randomSleep(1800, 2600);
            }

            response = await sendTabMessageWithRetry(tabId, {
              action: 'EXECUTE_FASIH_WORKFLOW',
              options: { ...opts, isPostRevoke: true, targetUrl: targetEditUrl }
            });
            continue;
          }

          if (!needRedirect && !isDisconnected) break;

          const wasOnExternalSso = isExternalSsoIdpUrl(preStepUrl) || ssoStage === 'SUBMITTED_CREDENTIALS';
          if (wasOnExternalSso) {
            await waitForPostSsoLanding(tabId, 18000);
            await sleep(1200);
          } else {
            await sleep(1200);
            await waitForTabComplete(tabId, 35000);
            await randomSleep(1400, 2200);
          }

          let curUrl = '';
          try {
            const curTab = await chrome.tabs.get(tabId);
            curUrl = (curTab && curTab.url) || '';
          } catch (e) {}
          const isStillSsoPage = isSsoOrLoginUrl(curUrl);

          // Jika awalnya dijalankan dari halaman Login tanpa antrian Excel dan sudah masuk ke halaman utama FASIH
          if (!isStillSsoPage && isInitialLoginUrl && !targetEditUrl && !curUrl.includes('/assignment')) {
            response = { status: 'DONE', result: { success: true, ssoCompleted: true } };
            break;
          }

          const candidateEditUrl = (needRedirect && response.result && response.result.editUrl && /\/assignment\//i.test(response.result.editUrl))
            ? response.result.editUrl
            : '';
          let nextUrl = candidateEditUrl || targetEditUrl;
          if (isStillSsoPage || ssoStage === 'CLICKED_SSO_EKSTERNAL' || nextUrl === curUrl || (nextUrl && isSsoOrLoginUrl(nextUrl))) {
            nextUrl = '';
          }

          if (nextUrl) {
            await chrome.tabs.update(tabId, { url: nextUrl });
            await waitForTabComplete(tabId, 35000);
            await randomSleep(1800, 2600);
          }

          if (runnerState.status !== 'RUNNING') break;

          try {
            const tBeforeNext = await chrome.tabs.get(tabId);
            preStepUrl = (tBeforeNext && tBeforeNext.url) || '';
          } catch (e) {
            preStepUrl = '';
          }

          response = await sendTabMessageWithRetry(tabId, {
            action: 'EXECUTE_FASIH_WORKFLOW',
            options: { ...opts, targetUrl: targetEditUrl }
          });
        }

        // Jika berhasil submit pada Test Tab Aktif dan autoApprove aktif, jalankan langkah Approve
        if (
          response &&
          response.status === 'DONE' &&
          response.result &&
          response.result.success &&
          !response.result.skipped &&
          opts.autoApprove !== false &&
          (response.result.submitted || response.result.alreadySubmitted) &&
          response.result.reviewUrl
        ) {
          try {
            await chrome.tabs.update(tabId, { url: response.result.reviewUrl });
            await waitForTabComplete(
              tabId,
              35000,
              (u) => !/\/edit(\b|\/|$)/i.test(String(u || '').split('?')[0].split('#')[0])
            );
            await randomSleep(1800, 2600);
            await sendTabMessageWithRetry(tabId, {
              action: 'APPROVE_ASSIGNMENT',
              options: opts
            }, 5);
          } catch (e) {}
        }

        // Kirim notifikasi ke Webhook jika terjadi error saat Test Tab Aktif
        if (response) {
          const r = response.result || {};
          let activeErr = '';
          if (response.status === 'ERROR' || response.status === 'DISCONNECTED') {
            activeErr = response.error || 'Terputus / gagal mengeksekusi tab aktif';
          } else if (response.status === 'DONE' && (r.success === false || r.hasGalat)) {
            activeErr = r.error || 'Gagal validasi / pemberian remark pada tab aktif';
          } else if (response.status === 'DONE' && r.skipped && !r.alreadyHasRemark && /formulir.*tidak terbuka/i.test(String(r.reason || ''))) {
            activeErr = r.reason;
          }
          if (activeErr && shouldSendWebhookNotification('ERROR_NOTIFICATION', activeErr)) {
            sendWebhookErrorNotification({
              event: 'ERROR_NOTIFICATION',
              index: null,
              item: {
                excelRowNum: 'Tab Aktif',
                mode: opts.mode || runnerState.options.mode,
                nama_usaha: opts.targetUsaha || 'Tab Aktif',
                link_fasih_sm: targetEditUrl || initialUrl
              },
              totalQueue: 0,
              errorMsg: activeErr
            });
          }
        }

        runnerState.status = 'IDLE';
        runnerState.activeTabId = null;
        await chrome.storage.local.set({ runnerState });
        sendResponse(response);
      } finally {
        isActiveTabTesting = false;
      }
    })();
    return true;
  }

  // Meneruskan update step dari content script ke popup
  if (request.action === 'KEEPALIVE_CONFIG') {
    setupKeepAlive().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (request.action === 'KEEPALIVE_NOW') {
    keepAliveTick().finally(() => sendResponse({ ok: true }));
    return true;
  }

  if (request.action === 'REVOKE_TRIGGERED') {
      runnerState.tabRevokedRecently = true;
    }
    if (request.action === 'UPDATE_STEP') {
    if (request.step) {
      runnerState.lastWorkflowStep = request.step;
    }
    if (request.step === 'SSO_LOGIN' || request.step === 'STEP_SSO' || request.step === 'STEP_SSO_REDIRECT') {
      runnerState.ssoStepOnActiveTab = true;
    }
    broadcastToPopup(request);
    return false;
  }
});

// Pastikan saat ekstensi baru dimuat ulang / browser baru dibuka, status tidak nyangkut di RUNNING
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['runnerState']);
  if (data.runnerState && data.runnerState.status === 'RUNNING') {
    runnerState.status = 'IDLE';
    runnerState.activeTabId = null;
    await chrome.storage.local.set({ runnerState: { ...data.runnerState, status: 'IDLE', activeTabId: null } });
  }
});


// ===================== Penjaga sesi FASIH (Keep-Alive) =====================
// Setiap 4 menit menyapa server FASIH lewat tab FASIH yang terbuka (permintaan ringan bertanda login),
// sehingga sesi tidak habis karena lama diam. Tab FASIH juga diproteksi agar tidak ditidurkan oleh Chrome Memory Saver.
// Sesuai permintaan: alur login otomatis diserahkan sepenuhnya ke fitur login SSO Eksternal yang sudah ada.
const KEEPALIVE_ALARM = 'tuntasKeepAlive';
const KEEPALIVE_DEFAULT_SP = 'fd68e454-ba45-4b85-8205-f3bf777ded24';

async function setupKeepAlive() {
  const { tuntasKeepAliveOn } = await chrome.storage.local.get(['tuntasKeepAliveOn']);
  if (tuntasKeepAliveOn === false) {
    if (chrome.alarms) await chrome.alarms.clear(KEEPALIVE_ALARM);
    chrome.action.setBadgeText({ text: '' }).catch(() => {});
    return;
  }
  if (chrome.alarms) {
    chrome.alarms.create(KEEPALIVE_ALARM, { delayInMinutes: 1, periodInMinutes: 4 });
  }
}

async function keepAliveTick() {
  const { tuntasKeepAliveOn, runnerOptions } = await chrome.storage.local.get(['tuntasKeepAliveOn', 'runnerOptions']);
  if (tuntasKeepAliveOn === false) return;
  const periodeId = (runnerOptions && runnerOptions.periodeId) || KEEPALIVE_DEFAULT_SP;
  const tabs = await chrome.tabs.query({ url: ['https://fasih-sm.bps.go.id/*', '*://fasih-sm.bps.go.id/*'] });
  let res = null;
  for (const t of tabs) {
    chrome.tabs.update(t.id, { autoDiscardable: false }).catch(() => {});
    if (res || t.discarded || t.status !== 'complete') continue;
    try {
      res = await chrome.tabs.sendMessage(t.id, { action: 'KEEPALIVE_PING', periodeId });
    } catch (e) {}
  }
  if (!res) {
    // Tidak ada tab FASIH yang siap: coba sapa dari latar
    try {
      const r = await fetch(`https://fasih-sm.bps.go.id/app/api/survey/api/v1/users/myinfo?surveyPeriodId=${encodeURIComponent(periodeId)}`, { credentials: 'include', cache: 'no-store' });
      const ct = r.headers.get('content-type') || '';
      if (r.ok && ct.includes('json')) {
        const j = await r.json().catch(() => null);
        const u = j && ((j.data && j.data.username) || j.username);
        res = { ok: true, user: u || '' };
      } else {
        res = { ok: false, msg: tabs.length ? 'tab FASIH belum siap' : 'buka satu tab FASIH agar sesi bisa dijaga' };
      }
    } catch (e) {
      res = { ok: false, msg: 'buka satu tab FASIH agar sesi bisa dijaga' };
    }
  }
  await chrome.storage.local.set({ tuntasKeepAlive: { ...res, at: Date.now() } });
  chrome.action.setBadgeBackgroundColor({ color: '#E53935' }).catch(() => {});
  chrome.action.setBadgeText({ text: res.expired ? '!' : '' }).catch(() => {});
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === KEEPALIVE_ALARM) keepAliveTick().catch(() => {});
  if (a.name === WHATSAPP_SYNC_ALARM) syncWithWhatsAppRemote().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  setupKeepAlive().catch(() => {});
  setupWhatsAppSyncAlarm().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  setupKeepAlive().catch(() => {});
  setupWhatsAppSyncAlarm().catch(() => {});
  startWhatsAppSyncLoop();
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.runnerOptions && changes.runnerOptions.newValue) {
    runnerState.options = { ...runnerState.options, ...changes.runnerOptions.newValue };
  }
});
chrome.storage.local.get(['runnerOptions'], (data) => {
  if (data && data.runnerOptions) {
    runnerState.options = { ...runnerState.options, ...data.runnerOptions };
  }
});
setupKeepAlive().catch(() => {});
setupWhatsAppSyncAlarm().catch(() => {});
startWhatsAppSyncLoop();

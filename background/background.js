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

let runnerState = {
  status: 'IDLE', // 'IDLE', 'RUNNING', 'PAUSED', 'STOPPED'
  currentIndex: 0,
  activeTabId: null,
  consecutiveFailures: 0, // Pelacak kegagalan beruntun untuk Circuit Breaker
  options: {
    mode: 'DC0',
    commentText: '#DC_00',
    dc0Target: 'nilai',
    catatanKbliDiganti: '#DC_01',
    periodeId: 'fd68e454-ba45-4b85-8205-f3bf777ded24',
    stepDelay: 1500,
    requireManualConfirm: false,
    autoSubmitSurvey: true,
    closeTabOnComplete: true,
    autoApprove: true,
    autoSsoLogin: true,
    ssoEmail: 'Haerulhaeruddin003@gmail.com',
    ssoPassword: 'Mitra123',
    pcName: 'PC 1',
    enableWebhook: true,
    webhookUrl: DEFAULT_WEBHOOK_URL
  }
};

// Klasifikasi kategori error untuk laporan Webhook
function classifyErrorCategory(errorMsg = '') {
  const upper = String(errorMsg || '').toUpperCase();
  if (upper.includes('CIRCUIT BREAKER')) return 'CIRCUIT_BREAKER';
  if (
    upper.includes('TIMEOUT') ||
    upper.includes('SERVER_DOWN') ||
    upper.includes('BAD GATEWAY') ||
    upper.includes('SERVICE UNAVAILABLE') ||
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
    upper.includes('FORMULIR KUISIONER TIDAK TERBUKA') ||
    upper.includes('FORMULIR TIDAK TERBUKA')
  ) {
    return 'GAGAL_REMARK';
  }
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
    const webhookUrl = String(customUrl || opts.webhookUrl || DEFAULT_WEBHOOK_URL).trim();
    if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
      return { ok: false, error: 'URL Webhook tidak valid' };
    }

    const pcName = String(opts.pcName || 'PC 1').trim() || 'PC 1';
    const kategori = event === 'TEST_WEBHOOK' ? 'TEST_WEBHOOK' : classifyErrorCategory(errorMsg);
    const modeCode = (item && item.mode === 'DC1') || opts.mode === 'DC1' ? '#DC_01' : '#DC_00';
    const rowNum = item ? (item.excelRowNum || (index !== null ? index + 1 : '-')) : (index !== null ? index + 1 : '-');
    const namaUsaha = (item && item.nama_usaha) || '-';
    const linkFasih = (item && (item.link_fasih_sm || item.link)) || (runnerState && runnerState.activeTargetUrl) || '-';
    const urlEdit = (linkFasih && linkFasih !== '-') ? formatEditUrl(linkFasih, opts.periodeId) : '-';
    const orig = (item && item.originalRow) || {};
    const idAssignment = orig.id_assignment || orig.assignment_id || orig.ID_ASSIGNMENT || '';
    const kbliAwal = item && item.kbliTask ? item.kbliTask.kbliAwal : '';
    const kbliTujuan = item && item.kbliTask ? item.kbliTask.kbliTujuan : '';
    const now = new Date();
    const waktuLokal = now.toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });

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
    runnerState.status = 'PAUSED';
    chrome.storage.local.set({ runnerState });
    const cbMessage = '⚠️ Circuit Breaker: Terdeteksi 3 kegagalan berturut-turut (server FASIH down / koneksi timeout). Otomasi dijeda otomatis agar sisa antrian aman.';
    broadcastToPopup({
      action: 'CIRCUIT_BREAKER_TRIGGERED',
      consecutiveFailures: runnerState.consecutiveFailures,
      message: cbMessage
    });
    sendWebhookErrorNotification({
      event: 'CIRCUIT_BREAKER_TRIGGERED',
      index: runnerState.currentIndex,
      errorMsg: cbMessage
    });
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

    // Kirim notifikasi ke Webhook setiap kali terjadi kegagalan (FAILED) atau gagal membuka form kuisioner
    const isFormOpenFailure = itemStatus === 'SKIPPED' && /formulir.*tidak terbuka/i.test(String(errorMsg || ''));
    if (itemStatus === 'FAILED' || isFormOpenFailure) {
      sendWebhookErrorNotification({
        event: 'ERROR_NOTIFICATION',
        index,
        item: queue[index],
        totalQueue: queue.length,
        errorMsg: errorMsg || 'Terjadi kegagalan saat memproses baris antrian.'
      });
    }
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

  const rawUrl = item.link_fasih_sm || item.link;
  if (!rawUrl || !rawUrl.startsWith('http')) {
    await updateItemStatus(index, 'FAILED', 'Link URL tidak valid.');
    return { tabIdToClose: prevTabIdToClose };
  }

  // Tambahkan /edit langsung di belakang link_fasih_sm untuk antrian
  const targetUrl = formatEditUrl(rawUrl, runnerState.options && runnerState.options.periodeId);

  await updateItemStatus(index, 'OPENING_TAB');

  let tab = null;
  let shouldCloseCurrentTab = false;
  try {
    // Buat tab baru langsung dengan URL /edit
    tab = await chrome.tabs.create({ url: targetUrl, active: true });

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
    let response = await sendTabMessageWithRetry(tab.id, {
      action: 'EXECUTE_FASIH_WORKFLOW',
      options: {
        ...runnerState.options,
        targetUrl: targetUrl,
        isActiveTabTest: false,
        mode: (queue[index] && queue[index].mode) || runnerState.options.mode,
        kbliTask: (queue[index] && queue[index].kbliTask) || null,
        targetUsaha: (queue[index] && queue[index].targetUsaha) || ''
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
        break;
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
          targetUsaha: (queue[index] && queue[index].targetUsaha) || ''
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
      const res = response.result || {};
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
          : (res.submitted ? 'Sukses terkirim' : 'Catatan tersimpan (tanpa kirim)');
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
      const res = await processQueueItemSingle(queue, nextIdx, prevTabIdToClose);
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
      const data = await chrome.storage.local.get(['fasihQueue']);
      const queue = data.fasihQueue || [];
      let resetCount = 0;
      let firstResetIndex = -1;
      queue.forEach((item, idx) => {
        if (item.status === 'FAILED') {
          item.status = 'PENDING';
          item.error = null;
          if (firstResetIndex === -1) firstResetIndex = idx;
          resetCount++;
        }
      });

      if (resetCount === 0) {
        sendResponse({ success: false, message: 'Tidak ada item yang berstatus gagal.' });
        return;
      }

      runnerState.consecutiveFailures = 0;
      runnerState.status = 'RUNNING';
      runnerState.currentIndex = firstResetIndex !== -1 ? firstResetIndex : 0;
      if (request.options) {
        runnerState.options = { ...runnerState.options, ...request.options };
      }
      await chrome.storage.local.set({ fasihQueue: queue, runnerState });
      broadcastToPopup({ action: 'QUEUE_UPDATED', queue });

      processQueueItem(queue, runnerState.currentIndex);
      sendResponse({ success: true, resetCount, startIndex: runnerState.currentIndex });
    })();
    return true;
  }

  if (request.action === 'PAUSE_QUEUE') {
    runnerState.status = 'PAUSED';
    chrome.storage.local.set({ runnerState });
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
    updateItemStatus(runnerState.currentIndex, 'PAUSED', 'Dijeda');
    broadcastToPopup({ action: 'QUEUE_PAUSED' });
    sendResponse({ success: true });
    return false;
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
    stopKeepAlive();
    queueRunToken++;
    isQueueRunning = false;
    runnerState.status = 'STOPPED';
    const activeTabToClose = runnerState.activeTabId;
    runnerState.activeTabId = null;
    chrome.storage.local.set({ runnerState });
    if (activeTabToClose) {
      chrome.tabs.sendMessage(activeTabToClose, { action: 'STOP_WORKFLOW' }).catch(() => {});
    }
    chrome.tabs.query({ url: ['*://fasih-sm.bps.go.id/*', '*://*.bps.go.id/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        for (const t of tabs) {
          chrome.tabs.sendMessage(t.id, { action: 'STOP_WORKFLOW' }).catch(() => {});
        }
      }
    });
    chrome.storage.local.get(['fasihQueue'], (data) => {
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
        chrome.storage.local.set({ fasihQueue: q });
        broadcastToPopup({ action: 'QUEUE_UPDATED', queue: q });
      }
    });
    broadcastToPopup({ action: 'QUEUE_STOPPED' });
    sendResponse({ success: true });
    return false;
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
          if (activeErr) {
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

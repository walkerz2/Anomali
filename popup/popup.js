/**
 * TUNTAS SE2026 — Popup
 * Dua menu:
 *   #DC_0  Tanpa Perubahan : catatan konfirmasi (alur v8) di nilai produksi atau 13.g Kode KBLI
 *   #DC_1  Ganti KBLI       : ganti radio 13.g ke kbli_tujuan lalu catatan #DC_1
 * Antrian, progres, kontrol, dan export dipakai bersama.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  // ---------- Elemen ----------
  const excelInput = $('excelInput');
  const dropArea = $('dropArea');
  const uploadDesc = $('uploadDesc');
  const fileInfo = $('fileInfo');
  const fileMode = $('fileMode');
  const fileName = $('fileName');
  const fileRowCount = $('fileRowCount');
  const btnClearFile = $('btnClearFile');
  const btnDownloadTemplate = $('btnDownloadTemplate');
  const templateLabel = $('templateLabel');
  const modeDesc = $('modeDesc');
  const modeTabs = Array.from(document.querySelectorAll('.mode-tab'));
  const modePanels = Array.from(document.querySelectorAll('.mode-panel'));

  const commentInput = $('commentInput');
  const dc0TargetSelect = $('dc0TargetSelect');
  const catatanDigantiInput = $('catatanDigantiInput');
  const delayInput = $('delayInput');
  const periodeInput = $('periodeInput');
  const rowStartInput = $('rowStartInput');
  const rowEndInput = $('rowEndInput');
  const ssoEmailInput = $('ssoEmailInput');
  const ssoPasswordInput = $('ssoPasswordInput');
  const pcNameInput = $('pcNameInput');
  const webhookUrlInput = $('webhookUrlInput');
  const btnTestWebhook = $('btnTestWebhook');
  const checkEnableWebhook = $('checkEnableWebhook');
  const checkAutoSsoLogin = $('checkAutoSsoLogin');
  const checkRequireConfirm = $('checkRequireConfirm');
  const checkAutoApprove = $('checkAutoApprove');
  const checkCloseTab = $('checkCloseTab');
  const DEFAULT_WEBHOOK_URL = 'https://n8n7309.online/webhook/notif-anomali';

  const btnStart = $('btnStart');
  const btnPause = $('btnPause');
  const btnResume = $('btnResume');
  const btnStop = $('btnStop');
  const btnTestActiveTab = $('btnTestActiveTab');
  const btnDiagnose = $('btnDiagnose');
  const btnExportExcel = $('btnExportExcel');
  const btnRetryFailed = $('btnRetryFailed');
  const failedCountBadge = $('failedCountBadge');

  const statusBadge = $('statusBadge');
  const progressBar = $('progressBar');
  const progressStats = $('progressStats');
  const liveStatusText = $('liveStatusText');
  const queueSummary = $('queueSummary');
  const queueTableBody = $('queueTableBody');

  const diagCard = $('diagCard');
  const diagSummary = $('diagSummary');
  const diagOutput = $('diagOutput');

  const MODE_INFO = {
    DC0: {
      desc: 'Konfirmasi anomali <b>tanpa mengubah isian</b>: bot memberi catatan, menyalakan konfirmasi anomali, lalu Kirim (& Approve). Cocok untuk anomali apa pun.',
      upload: 'Kolom wajib: <code>link_fasih_sm</code>',
      template: 'Template_TUNTAS_DC0.xlsx',
      templateLabel: 'Unduh Template #DC_00'
    },
    DC1: {
      desc: 'Perbaikan <b>KBLI</b>: bot mencari unit usaha dengan <code>kbli_awal</code>, memilih <code>kbli_tujuan</code> di 13.g, memberi catatan #DC_01, lalu Kirim (& Approve).',
      upload: 'Kolom wajib: <code>link_fasih_sm</code>, <code>kbli_awal</code>, <code>kbli_tujuan</code>',
      template: 'Template_TUNTAS_DC1_KBLI.xlsx',
      templateLabel: 'Unduh Template #DC_01 (KBLI)'
    }
  };

  let activeMode = 'DC0';   // menu yang sedang dipilih
  let queueMode = null;     // mode file yang sedang dimuat
  let allRows = [];         // seluruh baris dari file Excel (sebelum dipotong rentang baris)
  let queue = [];
  let runnerStatus = 'IDLE';

  // ---------- Menu ----------
  function setActiveMode(mode, { silent = false } = {}) {
    activeMode = mode;
    modeTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    modePanels.forEach(p => p.classList.toggle('hidden', p.dataset.panel !== mode));
    modeDesc.innerHTML = MODE_INFO[mode].desc;
    uploadDesc.innerHTML = MODE_INFO[mode].upload;
    templateLabel.textContent = MODE_INFO[mode].templateLabel;
    if (!silent) saveSettings();
  }

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      if (mode === activeMode) return;
      if (runnerStatus === 'RUNNING' || runnerStatus === 'PAUSED') {
        alert('Hentikan (Stop) proses yang berjalan sebelum pindah menu.');
        return;
      }
      if (queue.length && queueMode && queueMode !== mode) {
        if (!confirm(`File ${queueMode === 'DC0' ? '#DC_00' : '#DC_01'} yang sedang dimuat akan dihapus dari antrian. Lanjut pindah menu?`)) return;
        clearQueue();
      }
      setActiveMode(mode);
    });
  });

  // ---------- Template ----------
  btnDownloadTemplate.addEventListener('click', (e) => {
    e.preventDefault();
    const file = MODE_INFO[activeMode].template;
    const a = document.createElement('a');
    a.href = chrome.runtime.getURL(`template/${file}`);
    a.download = file;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 500);
  });

  // ---------- Upload ----------
  dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('dragover'); });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleExcelFile(e.dataTransfer.files[0]);
  });
  excelInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) handleExcelFile(e.target.files[0]);
  });
  btnClearFile.addEventListener('click', () => clearQueue());

  async function clearQueue() {
    allRows = [];
    queue = [];
    queueMode = null;
    excelInput.value = '';
    await chrome.storage.local.remove(['fasihAllRows', 'fasihQueue', 'excelFileName', 'queueMode']);
    await chrome.storage.local.set({
      runnerState: { status: 'IDLE', currentIndex: 0, activeTabId: null, consecutiveFailures: 0, options: getOptions() }
    });
    setRunnerStatus('IDLE');
    fileInfo.classList.add('hidden');
    dropArea.classList.remove('hidden');
    renderQueueTable();
    updateProgressUI();
    btnStart.disabled = true;
    btnExportExcel.disabled = true;
    liveStatusText.textContent = 'Menunggu file Excel...';
  }

  const normKey = (k) => String(k).trim().toLowerCase().replace(/\s+/g, '_');
  const padKbli = (v) => (/^\d{1,5}$/.test(v) ? v.padStart(5, '0') : v);

  function parseRows(rows, mode) {
    const keys = Object.keys(rows[0] || {});
    const find = (...names) => keys.find(k => names.includes(normKey(k)));
    const linkKey = keys.find(k => normKey(k) === 'link_fasih_sm') || keys.find(k => normKey(k).includes('link_fasih'));
    if (!linkKey) throw new Error('Kolom "link_fasih_sm" tidak ditemukan. Gunakan template dari tombol "Unduh Template".');

    const K = {
      nama: find('nama_usaha'),
      id: find('id_assignment', 'assignment_id'),
      kbliAwal: find('kbli_awal'),
      kbliTujuan: find('kbli_tujuan')
    };
    if (mode === 'DC1' && (!K.kbliAwal || !K.kbliTujuan)) {
      throw new Error('Menu #DC_01 membutuhkan kolom "kbli_awal" dan "kbli_tujuan". Unduh template #DC_01 (KBLI).');
    }
    const val = (row, key) => (key && row[key] !== undefined && row[key] !== null) ? String(row[key]).trim() : '';

    return rows
      .filter(row => Object.values(row).some(v => String(v).trim() !== ''))
      .map((row, idx) => {
        const link = val(row, linkKey);
        let error = /^https?:\/\//i.test(link) ? null : 'link_fasih_sm kosong / tidak valid';
        let kbliTask = null;

        if (mode === 'DC1') {
          const kbliAwal = padKbli(val(row, K.kbliAwal));
          const kbliTujuan = padKbli(val(row, K.kbliTujuan));
          if (!error && !/^\d{5}$/.test(kbliAwal)) error = 'kbli_awal kosong / bukan 5 digit';
          if (!error && !/^\d{5}$/.test(kbliTujuan)) error = 'kbli_tujuan kosong / bukan 5 digit';
          if (!error && kbliAwal === kbliTujuan) error = 'kbli_awal = kbli_tujuan (tidak ada perubahan). Gunakan menu #DC_00.';
          kbliTask = { kbliAwal, kbliTujuan, gantiKbli: true };
        }

        const idAssignment = val(row, K.id);
        return {
          index: idx,
          excelRowNum: idx + 1,
          mode,
          link_fasih_sm: link,
          nama_usaha: val(row, K.nama) || idAssignment || `Baris #${idx + 1}`,
          targetUsaha: val(row, K.nama),
          status: error ? 'INVALID' : 'PENDING',
          error,
          kbliTask,
          originalRow: row
        };
      });
  }

  function getRowRangeBounds(totalCount) {
    const rawStart = parseInt(rowStartInput && rowStartInput.value, 10);
    const rawEnd = parseInt(rowEndInput && rowEndInput.value, 10);
    const startRow = (!isNaN(rawStart) && rawStart >= 1) ? rawStart : 1;
    const endRow = (!isNaN(rawEnd) && rawEnd >= startRow) ? Math.min(rawEnd, totalCount || rawEnd) : (totalCount || rawEnd || 0);
    const isFiltered = (!isNaN(rawStart) && rawStart > 1) || (!isNaN(rawEnd) && totalCount > 0 && rawEnd < totalCount);
    return { startRow, endRow, isFiltered };
  }

  function filterRowsByRange(sourceRows) {
    if (!sourceRows || !sourceRows.length) return [];
    const { startRow, endRow } = getRowRangeBounds(sourceRows.length);
    return sourceRows
      .filter((r, i) => {
        const rn = r.excelRowNum || (i + 1);
        return rn >= startRow && rn <= endRow;
      })
      .map((r, i) => ({
        ...r,
        index: i,
        excelRowNum: r.excelRowNum || (i + 1)
      }));
  }

  async function applyRowRangeToLoadedFile() {
    if (!allRows.length) return;
    if (runnerStatus === 'RUNNING' || runnerStatus === 'PAUSED') {
      alert('Hentikan (Stop) proses yang sedang berjalan sebelum mengubah rentang baris.');
      return;
    }
    queue = filterRowsByRange(allRows);
    await chrome.storage.local.set({
      fasihQueue: queue,
      runnerState: { status: 'IDLE', currentIndex: 0, activeTabId: null, consecutiveFailures: 0, options: getOptions() }
    });
    showFileInfo(fileName.textContent || 'File Excel');
    setRunnerStatus('IDLE');
    renderQueueTable();
    updateProgressUI();
    const invalid = queue.filter(q => q.status === 'INVALID').length;
    const { startRow, endRow, isFiltered } = getRowRangeBounds(allRows.length);
    const rangeLabel = isFiltered ? ` (Baris ${startRow}–${endRow} dari ${allRows.length})` : '';
    liveStatusText.textContent = `File siap${rangeLabel}: ${queue.length - invalid} baris siap` + (invalid ? `, ${invalid} tidak valid.` : '.');
  }

  async function handleExcelFile(file) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      alert('Mohon pilih file Excel (.xlsx atau .xls)');
      return;
    }
    liveStatusText.textContent = `Membaca file ${file.name}...`;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames.find(n => n.trim().toUpperCase() === 'DATA') || wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false });
      if (!rows.length) {
        alert('Sheet data kosong.');
        return;
      }
      const parsed = parseRows(rows, activeMode);
      if (!parsed.length) {
        alert('Tidak ada baris data.');
        return;
      }

      allRows = parsed;
      queue = filterRowsByRange(allRows);
      queueMode = activeMode;
      await chrome.storage.local.set({
        fasihAllRows: allRows,
        fasihQueue: queue,
        excelFileName: file.name,
        queueMode,
        runnerState: { status: 'IDLE', currentIndex: 0, activeTabId: null, consecutiveFailures: 0, options: getOptions() }
      });
      showFileInfo(file.name);
      setRunnerStatus('IDLE');
      renderQueueTable();
      updateProgressUI();
      const invalid = queue.filter(q => q.status === 'INVALID').length;
      const { startRow, endRow, isFiltered } = getRowRangeBounds(allRows.length);
      const rangeLabel = isFiltered ? ` (Baris ${startRow}–${endRow} dari ${allRows.length})` : '';
      liveStatusText.textContent = `File siap${rangeLabel}: ${queue.length - invalid} baris siap` + (invalid ? `, ${invalid} tidak valid (tidak akan diproses).` : '.');
    } catch (err) {
      console.error(err);
      alert('Gagal memproses file Excel: ' + err.message);
      liveStatusText.textContent = 'Gagal membaca file.';
    }
  }

  function showFileInfo(name) {
    fileName.textContent = name;
    const totalAll = allRows.length || queue.length;
    const { startRow, endRow, isFiltered } = getRowRangeBounds(totalAll);
    fileRowCount.textContent = isFiltered ? `${queue.length}/${totalAll} (Brs ${startRow}-${endRow})` : `${queue.length} baris`;
    fileMode.textContent = queueMode === 'DC1' ? '#DC_01' : '#DC_00';
    fileMode.className = `file-mode ${queueMode === 'DC1' ? 'tag-dc1' : 'tag-dc0'}`;
    fileInfo.classList.remove('hidden');
    dropArea.classList.add('hidden');
    btnStart.disabled = queue.length === 0;
    btnExportExcel.disabled = queue.length === 0;
  }

  // ---------- Opsi ----------
  function getOptions() {
    return {
      mode: queueMode || activeMode,
      commentText: commentInput.value.trim() || '#DC_00',
      dc0Target: dc0TargetSelect.value || 'nilai',
      catatanKbliDiganti: catatanDigantiInput.value.trim() || '#DC_01',
      periodeId: periodeInput.value.trim(),
      stepDelay: (parseFloat(delayInput.value) || 1.5) * 1000,
      rowStart: rowStartInput && rowStartInput.value ? parseInt(rowStartInput.value, 10) : '',
      rowEnd: rowEndInput && rowEndInput.value ? parseInt(rowEndInput.value, 10) : '',
      pcName: (pcNameInput && pcNameInput.value.trim()) || 'PC 1',
      enableWebhook: checkEnableWebhook ? checkEnableWebhook.checked : true,
      webhookUrl: (webhookUrlInput && webhookUrlInput.value.trim()) || DEFAULT_WEBHOOK_URL,
      autoSsoLogin: checkAutoSsoLogin ? checkAutoSsoLogin.checked : true,
      ssoEmail: (ssoEmailInput && ssoEmailInput.value.trim()) || 'Haerulhaeruddin003@gmail.com',
      ssoPassword: (ssoPasswordInput && ssoPasswordInput.value) || 'Mitra123',
      requireManualConfirm: checkRequireConfirm.checked,
      autoSubmitSurvey: true,
      autoApprove: checkAutoApprove.checked,
      closeTabOnComplete: checkCloseTab.checked
    };
  }

  function saveSettings() {
    chrome.storage.local.set({ runnerOptions: getOptions(), activeMode }).catch(() => {});
  }
  [commentInput, dc0TargetSelect, catatanDigantiInput, delayInput, periodeInput,
    ssoEmailInput, ssoPasswordInput, pcNameInput, webhookUrlInput, checkEnableWebhook, checkAutoSsoLogin,
    checkRequireConfirm, checkAutoApprove, checkCloseTab]
    .filter(Boolean)
    .forEach(el => el.addEventListener('change', saveSettings));

  if (btnTestWebhook) {
    btnTestWebhook.addEventListener('click', () => {
      const url = (webhookUrlInput && webhookUrlInput.value.trim()) || DEFAULT_WEBHOOK_URL;
      saveSettings();
      btnTestWebhook.disabled = true;
      btnTestWebhook.textContent = '...';
      liveStatusText.textContent = `Mengirim pesan uji coba ke Webhook...`;
      chrome.runtime.sendMessage({
        action: 'TEST_WEBHOOK',
        webhookUrl: url,
        options: getOptions()
      }, (res) => {
        btnTestWebhook.disabled = false;
        btnTestWebhook.textContent = 'Tes';
        if (chrome.runtime.lastError || !res || !res.ok) {
          const err = (res && res.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Gagal menghubungi URL Webhook';
          liveStatusText.textContent = `Gagal tes Webhook: ${err}`;
        } else {
          liveStatusText.textContent = `Webhook berhasil terkirim (HTTP ${res.status || 200})!`;
        }
      });
    });
  }

  [rowStartInput, rowEndInput].filter(Boolean).forEach(el => {
    el.addEventListener('change', () => {
      saveSettings();
      applyRowRangeToLoadedFile();
    });
  });

  // ---------- Kontrol ----------
  function showRunningButtons() {
    btnStart.classList.add('hidden');
    btnResume.classList.add('hidden');
    btnPause.classList.remove('hidden');
    btnStop.classList.remove('hidden');
  }
  function showIdleButtons() {
    btnPause.classList.add('hidden');
    btnResume.classList.add('hidden');
    btnStop.classList.add('hidden');
    btnStart.classList.remove('hidden');
    btnStart.disabled = queue.length === 0;
  }

  btnStart.addEventListener('click', () => {
    if (!queue.length) return;
    if (queueMode !== activeMode) setActiveMode(queueMode);
    if (checkAutoApprove.checked &&
        !confirm(`Mulai ${queueMode === 'DC1' ? '#DC_01 (Ganti KBLI)' : '#DC_00 (Tanpa Perubahan)'} untuk ${queue.filter(q => q.status === 'PENDING').length} dokumen?\nDokumen akan DIKIRIM dan DI-APPROVE otomatis.`)) {
      return;
    }
    saveSettings();
    showRunningButtons();
    setRunnerStatus('RUNNING');
    chrome.runtime.sendMessage({ action: 'START_QUEUE', options: getOptions() }, (res) => {
      if (res && res.allCompleted) {
        liveStatusText.textContent = 'Semua antrian sudah diproses.';
        setRunnerStatus('COMPLETED');
        showIdleButtons();
      }
    });
  });

  btnRetryFailed.addEventListener('click', () => {
    btnRetryFailed.classList.add('hidden');
    showRunningButtons();
    setRunnerStatus('RUNNING');
    liveStatusText.textContent = 'Mengulang baris yang gagal...';
    chrome.runtime.sendMessage({ action: 'RETRY_FAILED_QUEUE', options: getOptions() }, (res) => {
      if (chrome.runtime.lastError || !res || !res.success) {
        liveStatusText.textContent = res?.message || 'Gagal memulai ulang.';
        setRunnerStatus('IDLE');
        showIdleButtons();
      }
    });
  });

  async function sendToActiveFasihTab(message) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
    } catch (e) {}
  }

  btnPause.addEventListener('click', () => {
    btnPause.classList.add('hidden');
    btnResume.classList.remove('hidden');
    setRunnerStatus('PAUSED');
    liveStatusText.textContent = 'Dijeda.';
    chrome.runtime.sendMessage({ action: 'PAUSE_QUEUE' });
    sendToActiveFasihTab({ action: 'PAUSE_WORKFLOW' });
  });

  btnResume.addEventListener('click', () => {
    btnResume.classList.add('hidden');
    btnPause.classList.remove('hidden');
    setRunnerStatus('RUNNING');
    liveStatusText.textContent = 'Melanjutkan...';
    chrome.runtime.sendMessage({ action: 'RESUME_QUEUE', options: getOptions() });
    sendToActiveFasihTab({ action: 'RESUME_WORKFLOW' });
  });

  btnStop.addEventListener('click', async () => {
    showIdleButtons();
    setRunnerStatus('STOPPED');
    liveStatusText.textContent = 'Dihentikan (Stop).';
    chrome.runtime.sendMessage({ action: 'STOP_QUEUE' });
    try {
      const tabs = await chrome.tabs.query({ url: '*://fasih-sm.bps.go.id/*' });
      for (const t of tabs) chrome.tabs.sendMessage(t.id, { action: 'STOP_WORKFLOW' }).catch(() => {});
    } catch (e) {}
  });

  async function getActiveFasihTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.url || (!tab.url.includes('fasih-sm.bps.go.id') && !tab.url.includes('bps.go.id'))) {
      alert('Tab aktif bukan halaman FASIH-SM / BPS. Buka dokumen FASIH terlebih dahulu.');
      return null;
    }
    return tab;
  }

  // Test di tab aktif: dijalankan via background agar tetap jalan lintas redirect SSO Eksternal
  btnTestActiveTab.addEventListener('click', async () => {
    const tab = await getActiveFasihTab();
    if (!tab) return;
    const lowerUrl = (tab.url || '').toLowerCase();
    const isLoginTab = lowerUrl.includes('/login') || lowerUrl.includes('/auth') || lowerUrl.includes('/oauth') || lowerUrl.includes('sso.bps.go.id');

    let kbliTask = null;
    let targetUsaha = '';
    if (!isLoginTab) {
      targetUsaha = (prompt('Nama unit usaha di BLOK II yang diproses (kosongkan = semua unit usaha):') || '').trim();
      if (activeMode === 'DC1') {
        const awal = padKbli((prompt('Test #DC_01 — KBLI awal (5 digit):') || '').trim());
        const tujuan = padKbli((prompt('KBLI tujuan (5 digit):') || '').trim());
        if (!/^\d{5}$/.test(awal) || !/^\d{5}$/.test(tujuan) || awal === tujuan) {
          alert('KBLI awal/tujuan tidak valid.');
          return;
        }
        kbliTask = { kbliAwal: awal, kbliTujuan: tujuan, gantiKbli: true };
      }
    }

    showRunningButtons();
    setRunnerStatus('RUNNING');
    liveStatusText.textContent = isLoginTab ? 'Memproses login SSO Eksternal di tab aktif...' : 'Menjalankan di tab aktif...';

    chrome.runtime.sendMessage({
      action: 'RUN_ACTIVE_TAB_TEST',
      tabId: tab.id,
      options: { ...getOptions(), mode: activeMode, kbliTask, targetUsaha, isActiveTabTest: true }
    }, (res) => {
      showIdleButtons();
      setRunnerStatus('IDLE');
      if (chrome.runtime.lastError) {
        liveStatusText.textContent = 'Proses berlanjut di latar belakang.';
        return;
      }
      const r = res && res.result;
      if (res && res.status === 'ABORTED') liveStatusText.textContent = 'Test dihentikan.';
      else if (r && r.ssoCompleted) liveStatusText.textContent = 'Login SSO Eksternal berhasil!';
      else if (r && r.needRedirectEdit) {
        liveStatusText.textContent = `Membuka mode edit: ${r.editUrl}`;
      } else if (r && r.skipped) liveStatusText.textContent = `Dilewati: ${r.reason || ''}`;
      else if (r && r.success === false) liveStatusText.textContent = `Gagal: ${r.error || ''}`;
      else if (res && res.status === 'ERROR') liveStatusText.textContent = `Error: ${res.error}`;
      else if (r && (r.submitted || r.alreadySubmitted) && r.reviewUrl && checkAutoApprove.checked) {
        approveInTab(tab.id, r.reviewUrl, r.alreadySubmitted ? 'Tombol Kirim tidak ada (sudah terkirim).' : 'Terkirim.');
      } else liveStatusText.textContent = 'Test di tab aktif selesai.';
    });
  });

  // Approve untuk Test Tab Aktif: buka halaman review, tunggu selesai dimuat, lalu klik Approve
  function waitTabLoaded(tabId, timeoutMs = 35000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(fn); resolve(false); }, timeoutMs);
      function fn(id, info) {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(fn);
          resolve(true);
        }
      }
      chrome.tabs.onUpdated.addListener(fn);
    });
  }

  async function approveInTab(tabId, reviewUrl, prefix) {
    liveStatusText.textContent = `${prefix} Membuka halaman review untuk Approve...`;
    setRunnerStatus('RUNNING');
    await chrome.tabs.update(tabId, { url: reviewUrl });
    await waitTabLoaded(tabId);
    let ready = false;
    for (let i = 0; i < 8 && !ready; i++) {
      await new Promise(r => setTimeout(r, 1500));
      try { ready = (await chrome.tabs.sendMessage(tabId, { action: 'PING' }))?.status === 'PONG'; } catch (e) {}
    }
    if (!ready) {
      setRunnerStatus('IDLE');
      liveStatusText.textContent = `${prefix} Halaman review tidak merespons — Approve manual.`;
      return;
    }
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'APPROVE_ASSIGNMENT', options: getOptions() });
      const ok = res && res.result && res.result.success;
      const noBtn = res && res.result && res.result.noApproveButton;
      if (ok) {
        liveStatusText.textContent = `${prefix} Approve berhasil.`;
      } else if (noBtn) {
        liveStatusText.textContent = `${prefix} Tombol Approve tidak muncul — menutup tab.`;
        chrome.tabs.remove(tabId).catch(() => {});
      } else {
        liveStatusText.textContent = `${prefix} Approve gagal: ${(res && (res.result?.error || res.error)) || 'tidak diketahui'}`;
      }
    } catch (e) {
      liveStatusText.textContent = `${prefix} Halaman dimuat ulang setelah Approve — cek status di FASIH.`;
    }
    setRunnerStatus('IDLE');
  }

  // ---------- Diagnosa ----------
  btnDiagnose.addEventListener('click', async () => {
    const tab = await getActiveFasihTab();
    if (!tab) return;
    liveStatusText.textContent = 'Mendiagnosa halaman...';
    chrome.tabs.sendMessage(tab.id, { action: 'DIAGNOSE_PAGE' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        alert('Halaman belum siap. Refresh halaman FASIH lalu coba lagi.');
        return;
      }
      const d = res.report || {};
      const ok = (v) => v ? '✅' : '❌';
      diagSummary.innerHTML = `<div style="color:#5B6B85">Versi bot: <b>${escapeHtml(d.versi || 'LAMA (belum diperbarui!)')}</b></div>
        <div>${ok(d.formOpen)} Form terbuka ${d.isEditUrl ? '(mode edit)' : ''}</div>
        <div>${ok(d.blokII)} Menu BLOK II · ${d.unitUsaha ? d.unitUsaha.length : 0} unit usaha</div>
        <div>${ok(d.q13g && d.q13g.found)} 13.g Kode KBLI · ${d.q13g && d.q13g.options ? d.q13g.options.length : 0} pilihan · terpilih: <b>${escapeHtml((d.q13g && d.q13g.selected) || '-')}</b></div>
        <div>${ok(d.q13g && d.q13g.masterKbliValue)} Master KBLI terbaca: <b>${escapeHtml((d.q13g && d.q13g.masterKbliValue) || '-')}</b> ${d.masterKbliVia ? '(' + escapeHtml(d.masterKbliVia) + ')' : ''}</div>
        <div>${ok(d.q13g && d.q13g.commentButton)} Tombol Catatan 13.g</div>
        <div>${ok(d.target && d.target.found)} Target nilai produksi: ${escapeHtml((d.target && d.target.code) || '-')}</div>
        <div>${ok(!d.sso || !d.sso.isLoginPage)} SSO / Sesi: <b>${escapeHtml((d.sso && d.sso.isLoginPage) ? 'Perlu Login SSO' : 'Aktif (Tidak Diminta Login)')}</b></div>
        <div>${ok(d.kirimButton)} Tombol Kirim · ${ok(d.approveButton)} Tombol Approve · ${ok(d.reviewButton)} Tombol Review</div>`;
      diagOutput.textContent = JSON.stringify(d, null, 2);
      diagCard.classList.remove('hidden');
      liveStatusText.textContent = 'Diagnosa selesai. Salin hasilnya bila perlu dikirim ke tim.';
    });
  });
  $('btnCopyDiag').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(diagOutput.textContent);
      liveStatusText.textContent = 'Hasil diagnosa disalin.';
    } catch (e) {
      alert('Gagal menyalin. Blok teks lalu salin manual.');
    }
  });
  $('btnCloseDiag').addEventListener('click', () => diagCard.classList.add('hidden'));

  // ---------- Export ----------
  function statusText(item) {
    if (item.status === 'SUCCESS') return 'SUKSES';
    if (item.status === 'INVALID') return 'TIDAK_VALID';
    if (item.status === 'SKIPPED') return 'DILEWATI';
    if (item.status === 'PROCESSING' || item.status === 'OPENING_TAB') return 'MEMPROSES';
    if (item.status === 'PAUSED') return 'DIJEDA';
    if (item.status === 'FAILED') {
      const e = String(item.error || '').toUpperCase();
      if (e.includes('TIMEOUT')) return 'TIMEOUT_LOADING';
      if (e.includes('SERVER_DOWN') || e.includes('BAD GATEWAY') || e.includes('SERVICE UNAVAILABLE')) return 'SERVER_DOWN';
      if (e.includes('APPROVE GAGAL')) return 'TERKIRIM_BELUM_APPROVE';
      if (e.includes('TERPUTUS')) return 'TERPUTUS_CEK_MANUAL';
      if (/GALAT|WAJIB|BELUM DIISI|VALIDASI|ANOMALI/.test(e)) return 'GAGAL_GALAT';
      return 'GAGAL';
    }
    return 'PENDING';
  }

  btnExportExcel.addEventListener('click', () => {
    if (!queue.length) return;
    try {
      const pcVal = (pcNameInput && pcNameInput.value.trim()) || 'PC 1';
      const rowsOut = queue.map((item, idx) => {
        const rowNum = item.excelRowNum || (idx + 1);
        const base = item.originalRow ? { No_Baris_Excel: rowNum, PC: pcVal, ...item.originalRow } : { No_Baris_Excel: rowNum, PC: pcVal, link_fasih_sm: item.link_fasih_sm };
        base.menu = item.mode === 'DC1' ? '#DC_01' : '#DC_00';
        base.status = statusText(item);
        base.keterangan = item.error || (item.status === 'SUCCESS' ? 'Sukses' : '');
        return base;
      });
      const ws = XLSX.utils.json_to_sheet(rowsOut);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Hasil Otomasi');
      const base = (fileName.textContent && fileName.textContent !== '-') ? fileName.textContent.replace(/\.[^/.]+$/, '') : 'tuntas_se2026';
      const totalAll = allRows.length || queue.length;
      const { startRow, endRow, isFiltered } = getRowRangeBounds(totalAll);
      const pcSlug = pcVal.replace(/[^A-Za-z0-9_-]+/g, '_');
      const rangeSuffix = isFiltered ? `_Baris_${startRow}-${endRow}` : '';
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      XLSX.writeFile(wb, `HASIL_${pcSlug}_${base}${rangeSuffix}_${stamp}.xlsx`);
      liveStatusText.textContent = 'Log berhasil diexport.';
    } catch (err) {
      alert('Gagal export: ' + err.message);
    }
  });

  // ---------- UI ----------
  function setRunnerStatus(status) {
    runnerStatus = status;
    statusBadge.className = 'badge';
    const map = {
      RUNNING: ['badge-running', 'Berjalan'],
      PAUSED: ['badge-paused', 'Jeda'],
      COMPLETED: ['badge-idle', 'Selesai']
    };
    const [cls, label] = map[status] || ['badge-idle', 'Siap'];
    statusBadge.classList.add(cls);
    statusBadge.textContent = label;
    updateProgressUI();
  }

  function badgeFor(item) {
    if (item.status === 'SUCCESS') return ['status-success', 'Selesai'];
    if (item.status === 'INVALID') return ['status-invalid', 'Tidak valid'];
    if (item.status === 'SKIPPED') return ['status-skipped', 'Dilewati'];
    if (item.status === 'PROCESSING' || item.status === 'OPENING_TAB') return ['status-running', 'Memproses'];
    if (item.status === 'FAILED') {
      const e = String(item.error || '').toUpperCase();
      if (e.includes('APPROVE GAGAL')) return ['status-galat', 'Belum Approve'];
      if (e.includes('TERPUTUS')) return ['status-skipped', 'Cek manual'];
      if (/GALAT|WAJIB|BELUM DIISI|VALIDASI|ANOMALI/.test(e)) return ['status-galat', 'Galat'];
      return ['status-failed', 'Gagal'];
    }
    return ['status-pending', 'Pending'];
  }

  function renderQueueTable() {
    const totalAll = allRows.length || queue.length;
    const { startRow, endRow, isFiltered } = getRowRangeBounds(totalAll);
    const rangeInfo = (queue.length && isFiltered) ? ` (Baris ${startRow}–${endRow})` : '';
    queueSummary.textContent = queue.length ? `${queue.length} item${rangeInfo} · ${queueMode === 'DC1' ? '#DC_01' : '#DC_00'}` : '0 item';
    if (!queue.length) {
      queueTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">Belum ada file Excel diimpor</td></tr>';
      return;
    }
    queueTableBody.innerHTML = queue.map((item, idx) => {
      const [cls, label] = badgeFor(item);
      const rowNum = item.excelRowNum || (idx + 1);
      const sub = item.kbliTask
        ? `<div class="kbli-line">KBLI ${escapeHtml(item.kbliTask.kbliAwal)} → ${escapeHtml(item.kbliTask.kbliTujuan)}</div>`
        : '';
      const note = item.error ? `<div class="row-note">${escapeHtml(item.error)}</div>` : '';
      return `<tr>
          <td>${rowNum}</td>
          <td title="${escapeHtml(item.link_fasih_sm)}"><strong>${escapeHtml(item.nama_usaha)}</strong>${sub}${note}</td>
          <td><span class="status-badge-table ${cls}">${label}</span></td>
        </tr>`;
    }).join('');
  }

  function updateProgressUI() {
    const total = queue.length;
    const done = queue.filter(i => ['SUCCESS', 'SKIPPED', 'FAILED', 'INVALID'].includes(i.status)).length;
    const failed = queue.filter(i => i.status === 'FAILED').length;
    progressStats.textContent = `${done} / ${total}`;
    progressBar.style.width = `${total ? Math.round(done / total * 100) : 0}%`;
    failedCountBadge.textContent = failed;
    btnRetryFailed.classList.toggle('hidden', !(failed > 0 && runnerStatus !== 'RUNNING'));
  }

  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text ?? '').replace(/[&<>"']/g, m => map[m]);
  }

  // ---------- Muat state ----------
  async function loadSavedState() {
    const data = await chrome.storage.local.get(['fasihAllRows', 'fasihQueue', 'runnerState', 'excelFileName', 'runnerOptions', 'queueMode', 'activeMode']);
    const o = data.runnerOptions || {};
    // Nilai tersimpan versi sebelumnya (#DC_0 / #DC_1) tidak dipulihkan; default resmi #DC_00 / #DC_01
    if (o.commentText && o.commentText !== '#DC_0') commentInput.value = o.commentText;
    if (o.dc0Target) dc0TargetSelect.value = o.dc0Target;
    if (o.catatanKbliDiganti && o.catatanKbliDiganti !== '#DC_1') catatanDigantiInput.value = o.catatanKbliDiganti;
    if (o.periodeId) periodeInput.value = o.periodeId;
    if (o.stepDelay) delayInput.value = o.stepDelay / 1000;
    if (o.rowStart !== undefined && rowStartInput) rowStartInput.value = o.rowStart || '';
    if (o.rowEnd !== undefined && rowEndInput) rowEndInput.value = o.rowEnd || '';
    if (o.ssoEmail && ssoEmailInput) ssoEmailInput.value = o.ssoEmail;
    if (o.ssoPassword && ssoPasswordInput) ssoPasswordInput.value = o.ssoPassword;
    if (o.pcName && pcNameInput) pcNameInput.value = o.pcName;
    if (webhookUrlInput) webhookUrlInput.value = o.webhookUrl || DEFAULT_WEBHOOK_URL;
    if (o.enableWebhook !== undefined && checkEnableWebhook) checkEnableWebhook.checked = o.enableWebhook;
    if (o.autoSsoLogin !== undefined && checkAutoSsoLogin) checkAutoSsoLogin.checked = o.autoSsoLogin;
    if (o.requireManualConfirm !== undefined) checkRequireConfirm.checked = o.requireManualConfirm;
    if (o.autoApprove !== undefined) checkAutoApprove.checked = o.autoApprove;
    if (o.closeTabOnComplete !== undefined) checkCloseTab.checked = o.closeTabOnComplete;

    if (data.fasihAllRows && data.fasihAllRows.length) {
      allRows = data.fasihAllRows;
    }

    if (data.fasihQueue && data.fasihQueue.length) {
      queue = data.fasihQueue;
      if (!allRows.length) allRows = queue;
      // Koreksi baris versi sebelumnya: status FASIH "COMPLETED/APPROVED BY ..." berarti Approve berhasil
      let fixed = 0;
      queue.forEach(it => {
        const m = it.status === 'FAILED' && String(it.error || '').match(/APPROVE GAGAL: status setelah Approve: ((?:COMPLETED|APPROVED)[^|]*)/i);
        if (m) {
          it.status = 'SUCCESS';
          it.error = `Sukses terkirim + Approve (${m[1].trim()})`;
          fixed++;
        }
      });
      if (fixed) await chrome.storage.local.set({ fasihQueue: queue });
      queueMode = data.queueMode || (queue.some(q => q.kbliTask) ? 'DC1' : 'DC0');
      showFileInfo(data.excelFileName || 'File Excel');
    }
    setActiveMode(queueMode || data.activeMode || 'DC0', { silent: true });
    renderQueueTable();

    const st = data.runnerState && data.runnerState.status;
    setRunnerStatus(st || 'IDLE');
    if (st === 'RUNNING') showRunningButtons();
    else if (st === 'PAUSED') {
      showRunningButtons();
      btnPause.classList.add('hidden');
      btnResume.classList.remove('hidden');
    } else showIdleButtons();
  }

  await loadSavedState();

  // ---------- Pesan dari background ----------
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'QUEUE_UPDATED') {
      queue = request.queue;
      btnExportExcel.disabled = !queue.length;
      renderQueueTable();
      updateProgressUI();
    }
    if (request.action === 'UPDATE_STEP') {
      liveStatusText.textContent = `${request.step}: ${request.details}`;
    }
    if (request.action === 'QUEUE_PAUSED') {
      setRunnerStatus('PAUSED');
      showRunningButtons();
      btnPause.classList.add('hidden');
      btnResume.classList.remove('hidden');
    }
    if (request.action === 'QUEUE_STOPPED') {
      setRunnerStatus('STOPPED');
      showIdleButtons();
    }
    if (request.action === 'CIRCUIT_BREAKER_TRIGGERED') {
      setRunnerStatus('PAUSED');
      liveStatusText.textContent = request.message;
      showRunningButtons();
      btnPause.classList.add('hidden');
      btnResume.classList.remove('hidden');
      alert(request.message);
    }
    if (request.action === 'ALL_COMPLETED') {
      setRunnerStatus('COMPLETED');
      liveStatusText.textContent = 'Semua antrian selesai diproses!';
      showIdleButtons();
      updateProgressUI();
    }
  });
});

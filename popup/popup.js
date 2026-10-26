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
  const dc1TargetSelect = $('dc1TargetSelect');
  const catatanDigantiInput = $('catatanDigantiInput');
  const delayInput = $('delayInput');
  const periodeInput = $('periodeInput');
  const rowStartInput = $('rowStartInput');
  const rowEndInput = $('rowEndInput');
  const ssoEmailInput = $('ssoEmailInput');
  const ssoPasswordInput = $('ssoPasswordInput');
  const pcNameInput = $('pcNameInput');
  const webhookUrlInput = $('webhookUrlInput');
  const whatsappSyncUrlInput = $('whatsappSyncUrlInput');
  const btnTestWhatsAppSync = $('btnTestWhatsAppSync');
  const checkEnableWhatsAppRemote = $('checkEnableWhatsAppRemote');
  const waSyncBanner = $('waSyncBanner');
  const waSyncDot = $('waSyncDot');
  const waSyncText = $('waSyncText');
  const waSyncPcLabel = $('waSyncPcLabel');
  const waSyncBadge = $('waSyncBadge');
  const DEFAULT_WHATSAPP_SYNC_URL = 'https://n8n7309.online/webhook/tuntas-bot-sync';
  const btnTestWebhook = $('btnTestWebhook');
    const checkNotifyOnComplete = $('checkNotifyOnComplete');
    const checkNotifyOnPauseStop = $('checkNotifyOnPauseStop');
  const checkAutoSsoLogin = $('checkAutoSsoLogin');
  const checkKeepAlive = $('checkKeepAlive');
  const keepAliveStatus = $('keepAliveStatus');
  const checkAutoRevoke = $('checkAutoRevoke');
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

  const checkApiDryRun = $('checkApiDryRun');
  const btnApiPickVars = $('btnApiPickVars');
  const apiPicker = $('apiPicker');
  const apiPickerInfo = $('apiPickerInfo');
  const apiPickerSearch = $('apiPickerSearch');
  const apiPickerList = $('apiPickerList');
  const apiPickCount = $('apiPickCount');
  const btnApiPickClear = $('btnApiPickClear');
  const btnApiPickDownload = $('btnApiPickDownload');
  const btnApiBackup = $('btnApiBackup');
  const apiBackupCount = $('apiBackupCount');
  const btnApiRestore = $('btnApiRestore');
  const btnApiFindKey = $('btnApiFindKey');

  // Elemen NTB
  const btnDownloadNtbExcel = $('btnDownloadNtbExcel');
  const ntbStatTotal = $('ntbStatTotal');
  const ntbStatValid = $('ntbStatValid');
  const ntbStatAnomali = $('ntbStatAnomali');
  const btnNtbLoadAll = $('btnNtbLoadAll');
  const btnNtbLoadOnly1 = $('btnNtbLoadOnly1');
  const btnNtbLoadOnly0 = $('btnNtbLoadOnly0');
  const ntbCountAll = $('ntbCountAll');
  const ntbCount1 = $('ntbCount1');
  const ntbCount0 = $('ntbCount0');
  const checkUseCustomSheet3 = $('checkUseCustomSheet3');
  const customSheet3Badge = $('customSheet3Badge');
  const btnUploadCustomSheet3 = $('btnUploadCustomSheet3');
  const customSheet3Input = $('customSheet3Input');
  const btnResetCustomSheet3 = $('btnResetCustomSheet3');

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
    },
    API: {
      desc: 'Ganti isian <b>variabel lain (selain KBLI)</b>: ① pilih variabel → ② unduh template → isi nilai baru → upload. Setiap variabel yang berubah diberi catatan <b>#DC_01</b>, lalu Kirim (dibatalkan bila ada GALAT) & Approve. Selalu <b>uji coba</b> dulu.',
      upload: 'Kolom wajib: <code>link_fasih_sm</code> + kolom variabel dari template ②',
      template: 'Template_TUNTAS_API_Variabel.xlsx',
      templateLabel: 'Unduh Template Kosong'
    },
    NTB: {
      desc: 'Validasi & Imputasi <b>Rasio NTB (Flag 3)</b>: Upload file mentah dari PANTAU BPS. Sistem otomatis menghitung NTB & rasio riil, memetakan kategori KBLI (A–V), menentukan status <b>#0 (Wajar)</b> vs <b>#1 (Anomali)</b>, serta memberikan rekomendasi variabel & nominal imputasi presisi.',
      upload: 'File ekspor PANTAU BPS: <code>Nama Usaha</code>, <code>Pengeluaran</code>, <code>Pendapatan B&J</code>, <code>Id Assignment</code>',
      template: 'Template_TUNTAS_NTB_Pantau.xlsx',
      templateLabel: 'Unduh Format Kolom NTB'
    }
  };
  const MODE_LABEL = { DC0: '#DC_00', DC1: '#DC_01', API: 'API', NTB: 'NTB' };
  const MODE_TAG = { DC0: 'tag-dc0', DC1: 'tag-dc1', API: 'tag-api', NTB: 'tag-ntb' };

  let activeMode = 'DC0';   // menu yang sedang dipilih
  let queueMode = null;     // mode file yang sedang dimuat
  let allRows = [];         // seluruh baris dari file Excel (sebelum dipotong rentang baris)
  let queue = [];
  let runnerStatus = 'IDLE';
  let ntbValidationResult = null; // Hasil validasi dataset NTB ({ items, summary })
  let ntbFilterMode = 'ALL';      // 'ALL' | 'ONLY_1' | 'ONLY_0'
  let ntbCustomSheet3Rows = null; // Baris Sheet 3 Kustom jika disiapkan sendiri oleh pengguna

  function updateCustomSheet3UI() {
    if (!customSheet3Badge || !checkUseCustomSheet3) return;
    if (ntbCustomSheet3Rows && ntbCustomSheet3Rows.length > 0) {
      customSheet3Badge.textContent = `✓ ${ntbCustomSheet3Rows.length} Baris Kustom`;
      customSheet3Badge.classList.remove('hidden');
      if (btnResetCustomSheet3) btnResetCustomSheet3.classList.remove('hidden');
    } else {
      customSheet3Badge.classList.add('hidden');
      if (btnResetCustomSheet3) btnResetCustomSheet3.classList.add('hidden');
    }
  }

  function updateNtbSummaryUI() {
    if (!ntbValidationResult || !ntbValidationResult.summary) {
      if (ntbStatTotal) ntbStatTotal.textContent = '0';
      if (ntbStatValid) ntbStatValid.textContent = '0';
      if (ntbStatAnomali) ntbStatAnomali.textContent = '0';
      if (ntbCountAll) ntbCountAll.textContent = '0';
      if (ntbCount1) ntbCount1.textContent = '0';
      if (ntbCount0) ntbCount0.textContent = '0';
      if (btnDownloadNtbExcel) btnDownloadNtbExcel.disabled = true;
      if (btnNtbLoadAll) btnNtbLoadAll.disabled = true;
      if (btnNtbLoadOnly1) btnNtbLoadOnly1.disabled = true;
      if (btnNtbLoadOnly0) btnNtbLoadOnly0.disabled = true;
      return;
    }
    const s = ntbValidationResult.summary;
    if (ntbStatTotal) ntbStatTotal.textContent = String(s.total);
    if (ntbStatValid) ntbStatValid.textContent = `${s.status0} (${s.pctValid}%)`;
    if (ntbStatAnomali) ntbStatAnomali.textContent = `${s.status1} (${s.pctAnomali}%)`;
    if (ntbCountAll) ntbCountAll.textContent = String(s.total);
    if (ntbCount1) ntbCount1.textContent = String(s.status1);
    if (ntbCount0) ntbCount0.textContent = String(s.status0);
    if (btnDownloadNtbExcel) btnDownloadNtbExcel.disabled = (s.total === 0);
    if (btnNtbLoadAll) btnNtbLoadAll.disabled = (s.total === 0);
    if (btnNtbLoadOnly1) btnNtbLoadOnly1.disabled = (s.status1 === 0);
    if (btnNtbLoadOnly0) btnNtbLoadOnly0.disabled = (s.status0 === 0);

    [btnNtbLoadAll, btnNtbLoadOnly1, btnNtbLoadOnly0].forEach(b => b && b.classList.remove('active'));
    if (ntbFilterMode === 'ONLY_1' && btnNtbLoadOnly1) btnNtbLoadOnly1.classList.add('active');
    else if (ntbFilterMode === 'ONLY_0' && btnNtbLoadOnly0) btnNtbLoadOnly0.classList.add('active');
    else if (btnNtbLoadAll) btnNtbLoadAll.classList.add('active');
  }

  function applyNtbFilter(filter) {
    if (!ntbValidationResult || !ntbValidationResult.items || !ntbValidationResult.items.length) return;
    ntbFilterMode = filter;
    updateNtbSummaryUI();
    const useCustomSheet3 = Boolean(checkUseCustomSheet3 && checkUseCustomSheet3.checked && ntbCustomSheet3Rows && ntbCustomSheet3Rows.length);
    const converted = NTB_VALIDATOR.convertNtbToQueue(ntbValidationResult.items, filter, useCustomSheet3 ? ntbCustomSheet3Rows : null);
    allRows = converted;
    queue = filterRowsByRange(allRows);
    queueMode = 'NTB';
    chrome.storage.local.set({
      fasihAllRows: allRows,
      fasihQueue: queue,
      queueMode,
      ntbValidationResult,
      ntbFilterMode
    });
    setRunnerStatus('IDLE');
    renderQueueTable();
    updateProgressUI();
    const invalid = queue.filter(q => q.status === 'INVALID').length;
    const { startRow, endRow, isFiltered } = getRowRangeBounds(allRows.length);
    const rangeLabel = isFiltered ? ` (Baris ${startRow}–${endRow} dari ${allRows.length})` : '';
    const labelFilter = filter === 'ONLY_1' ? 'Hanya Status #1 (Imputasi)' : (filter === 'ONLY_0' ? 'Hanya Status #0 (Wajar)' : 'Semua Status (#0 & #1)');
    liveStatusText.textContent = `Antrian NTB [${labelFilter}]${rangeLabel}: ${queue.length - invalid} baris siap diproses.` + (invalid ? ` (${invalid} link tidak valid)` : '');
  }

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
    ntbValidationResult = null;
    ntbFilterMode = 'ALL';
    updateNtbSummaryUI();
    await chrome.storage.local.remove(['fasihAllRows', 'fasihQueue', 'excelFileName', 'queueMode', 'ntbValidationResult', 'ntbFilterMode']);
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

  // Kolom yang bukan variabel FASIH pada menu Ubah Variabel
  const API_RESERVED = new Set(['no', 'nomor', 'link_fasih_sm', 'link', 'assignment_id', 'id_assignment', 'nama_usaha', 'kode_catatan', 'keterangan', 'kode_identitas', 'status']);

  // Kode catatan perubahan data (menu API)
  const KODE_CATATAN = {
    '#1': 'Data mengalami perubahan. Perbaikan dilakukan karena kesalahan pemahaman petugas terhadap konsep atau kesalahan entri kuesioner.',
    '#2': 'Data mengalami perubahan. Hasil konfirmasi/revisit kepada responden.',
    '#3': 'Data mengalami perubahan. Informasi yang bersumber dari survei rutin/data administrasi.',
    '#4': 'Data mengalami perubahan. Metode atau informasi lain selain kriteria kode.'
  };
  const normKodeCatatan = (v) => { const m = String(v || '').trim().match(/^#?\s*([1-4])$/); return m ? '#' + m[1] : null; };

  function parseApiRows(rows) {
    const keys = Object.keys(rows[0] || {});
    const linkKey = keys.find(k => normKey(k) === 'link_fasih_sm') || keys.find(k => normKey(k).includes('link_fasih'));
    const idKey = keys.find(k => ['assignment_id', 'id_assignment'].includes(normKey(k)));
    const namaKey = keys.find(k => normKey(k) === 'nama_usaha');
    const kodeKey = keys.find(k => normKey(k) === 'kode_catatan');
    if (!linkKey && !idKey) throw new Error('Menu Ubah Variabel membutuhkan kolom "link_fasih_sm" atau "assignment_id".');
    const remarkCols = keys.filter(k => /^\s*(catatan|remark)\s*:/i.test(k)).map(k => ({ col: k, dataKey: k.replace(/^\s*(catatan|remark)\s*:\s*/i, '').trim() }));
    const valueCols = keys.filter(k => !API_RESERVED.has(normKey(k)) && !remarkCols.some(r => r.col === k) && !/^__EMPTY/.test(k));
    if (!valueCols.length && !remarkCols.length) throw new Error('Tidak ada kolom variabel. Tambahkan kolom dengan nama dataKey FASIH (mis. r27a#1) atau catatan:dataKey.');
    const val = (row, key) => (key && row[key] !== undefined && row[key] !== null) ? String(row[key]).trim() : '';
    const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    return rows
      .filter(row => Object.values(row).some(v => String(v).trim() !== ''))
      .map((row, idx) => {
        const id = val(row, idKey);
        let link = val(row, linkKey);
        if (!/^https?:\/\//i.test(link) && UUID.test(id)) link = `https://fasih-sm.bps.go.id/app/assignment-detail/${id.match(UUID)[0]}`;
        link = String(link || '').trim().replace(/[\r\n\t]/g, '');
        const apiValues = {};
        valueCols.forEach(c => { const v = val(row, c); if (v !== '') apiValues[c.trim()] = v; });
        const apiRemarks = {};
        remarkCols.forEach(r => { const v = val(row, r.col); if (v !== '' && r.dataKey) apiRemarks[r.dataKey] = v; });
        const kodeIsi = val(row, kodeKey);
        const apiNoteCode = kodeIsi === '' ? '#1' : normKodeCatatan(kodeIsi);
        let error = null;
        if (!/^https?:\/\//i.test(link)) error = 'link_fasih_sm / assignment_id kosong atau tidak valid';
        else if (!apiNoteCode) error = `kode_catatan "${kodeIsi}" tidak dikenal — isi #1, #2, #3 atau #4`;
        else if (!Object.keys(apiValues).length && !Object.keys(apiRemarks).length) error = 'tidak ada nilai variabel / catatan yang diisi';
        return {
          index: idx,
          excelRowNum: idx + 1,
          mode: 'API',
          link_fasih_sm: link,
          assignmentId: UUID.test(id) ? id.match(UUID)[0] : '',
          nama_usaha: val(row, namaKey) || id || `Baris #${idx + 1}`,
          targetUsaha: val(row, namaKey),
          namaUsahaExcel: val(row, namaKey),
          apiNoteCode,
          apiValues,
          apiRemarks,
          status: error ? 'INVALID' : 'PENDING',
          error,
          originalRow: row
        };
      });
  }

  function parseRows(rows, mode) {
    if (mode === 'API') return parseApiRows(rows);
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
        let link = val(row, linkKey);
        const idAssignment = val(row, K.id);
        const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        if (!/^https?:\/\//i.test(link) && UUID.test(idAssignment)) {
          const sp = (periodeInput && periodeInput.value.trim()) || 'fd68e454-ba45-4b85-8205-f3bf777ded24';
          link = `https://fasih-sm.bps.go.id/app/assignment/${sp}/${idAssignment.match(UUID)[0]}/edit`;
        }
        link = String(link || '').trim().replace(/[\r\n\t]/g, '');
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

      if (activeMode === 'NTB') {
        const defaultPeriodeId = (periodeInput && periodeInput.value.trim()) || 'fd68e454-ba45-4b85-8205-f3bf777ded24';
        ntbValidationResult = NTB_VALIDATOR.validateNtbDataset(rows, defaultPeriodeId);
        if (!ntbValidationResult.items || !ntbValidationResult.items.length) {
          alert('Tidak ada baris data valid yang terbaca dari file PANTAU.');
          return;
        }

        // Cek apakah file yang diupload memiliki Sheet 3 ("Template API Siap Pakai")
        let apiSheetName = wb.SheetNames.find(n => /Template API|Siap Pakai|Sheet\s*3|^API/i.test(n.trim())) || (wb.SheetNames.length >= 3 ? wb.SheetNames[2] : null);
        if (!apiSheetName && wb.SheetNames.length > 1) {
          apiSheetName = wb.SheetNames.slice(1).find(sn => {
            try {
              const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, range: 0 });
              const headers = (rows && rows[0]) || [];
              return headers.some(h => /link_fasih|assignment_id/i.test(String(h).trim()));
            } catch (e) { return false; }
          });
        }
        if (apiSheetName) {
          try {
            const sheet3Raw = XLSX.utils.sheet_to_json(wb.Sheets[apiSheetName], { defval: '', raw: false });
            if (sheet3Raw && sheet3Raw.length > 0) {
              const parsedSheet3 = parseApiRows(sheet3Raw);
              if (parsedSheet3 && parsedSheet3.length > 0) {
                ntbCustomSheet3Rows = parsedSheet3;
                if (checkUseCustomSheet3) checkUseCustomSheet3.checked = true;
                console.log(`[TUNTAS NTB] Terdeteksi Sheet 3 ("${apiSheetName}") dengan ${parsedSheet3.length} baris perbaikan kustom.`);
              }
            }
          } catch (eSheet3) {
            console.warn('Gagal membaca Sheet 3 dari file Excel:', eSheet3);
          }
        }
        updateCustomSheet3UI();

        ntbFilterMode = 'ALL';
        updateNtbSummaryUI();
        queueMode = 'NTB';
        const useCustomSheet3 = Boolean(checkUseCustomSheet3 && checkUseCustomSheet3.checked && ntbCustomSheet3Rows && ntbCustomSheet3Rows.length);
        const converted = NTB_VALIDATOR.convertNtbToQueue(ntbValidationResult.items, ntbFilterMode, useCustomSheet3 ? ntbCustomSheet3Rows : null);
        allRows = converted;
        queue = filterRowsByRange(allRows);
        await chrome.storage.local.set({
          fasihAllRows: allRows,
          fasihQueue: queue,
          excelFileName: file.name,
          queueMode,
          ntbValidationResult,
          ntbFilterMode,
          runnerState: { status: 'IDLE', currentIndex: 0, activeTabId: null, consecutiveFailures: 0, options: getOptions() }
        });
        showFileInfo(file.name);
        setRunnerStatus('IDLE');
        renderQueueTable();
        updateProgressUI();
        const invalid = queue.filter(q => q.status === 'INVALID').length;
        const { startRow, endRow, isFiltered } = getRowRangeBounds(allRows.length);
        const rangeLabel = isFiltered ? ` (Baris ${startRow}–${endRow} dari ${allRows.length})` : '';
        const s = ntbValidationResult.summary;
        liveStatusText.textContent = `Validasi NTB selesai${rangeLabel}: ${s.total} usaha (${s.status0} wajar #0, ${s.status1} imputasi #1).` + (invalid ? ` ${invalid} link tidak valid.` : '');
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
    fileMode.textContent = MODE_LABEL[queueMode] || '#DC_00';
    fileMode.className = `file-mode ${MODE_TAG[queueMode] || 'tag-dc0'}`;
    fileInfo.classList.remove('hidden');
    dropArea.classList.add('hidden');
    btnStart.disabled = queue.length === 0;
    btnExportExcel.disabled = queue.length === 0;
  }



  // ---------- WhatsApp Two-Way Remote UI ----------
  function updateWhatsAppSyncUI(syncState) {
    if (!waSyncBanner || !waSyncBadge) return;
    const isEnabled = checkEnableWhatsAppRemote ? checkEnableWhatsAppRemote.checked : true;
    const pc = (pcNameInput && pcNameInput.value.trim()) || (syncState && syncState.pc) || 'PC 1';
    if (waSyncPcLabel) waSyncPcLabel.textContent = pc;

    if (!isEnabled) {
      if (waSyncDot) waSyncDot.className = 'wa-dot disconnected';
      if (waSyncBadge) {
        waSyncBadge.textContent = 'Nonaktif';
        waSyncBadge.className = 'wa-badge wa-badge-disconnected';
      }
      if (waSyncText) waSyncText.innerHTML = `WA Remote: <b>Nonaktif (${pc})</b>`;
      return;
    }

    if (!syncState || syncState.ok === undefined || syncState.ok === true) {
      if (waSyncDot) waSyncDot.className = 'wa-dot';
      if (waSyncBadge) {
        waSyncBadge.textContent = 'Aktif & Terhubung';
        waSyncBadge.className = 'wa-badge wa-badge-connected';
      }
      if (waSyncText) waSyncText.innerHTML = `WA Remote: <b>Terhubung (${pc})</b>`;
    } else {
      if (waSyncDot) waSyncDot.className = 'wa-dot error';
      if (waSyncBadge) {
        waSyncBadge.textContent = 'Terputus';
        waSyncBadge.className = 'wa-badge wa-badge-error';
      }
      if (waSyncText) waSyncText.innerHTML = `WA Remote: <b style="color:#b91c1c;">${syncState.text || 'Gagal'}</b>`;
    }
  }

  if (checkEnableWhatsAppRemote) {
    checkEnableWhatsAppRemote.addEventListener('change', () => {
      updateWhatsAppSyncUI();
      saveSettings();
    });
  }

  if (pcNameInput) {
    pcNameInput.addEventListener('input', () => {
      if (waSyncPcLabel) waSyncPcLabel.textContent = pcNameInput.value.trim() || 'PC 1';
    });
  }

  if (btnTestWhatsAppSync) {
    btnTestWhatsAppSync.addEventListener('click', async () => {
      btnTestWhatsAppSync.disabled = true;
      btnTestWhatsAppSync.textContent = 'Mengirim...';
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'TEST_WHATSAPP_SYNC',
          whatsappSyncUrl: whatsappSyncUrlInput ? whatsappSyncUrlInput.value.trim() : ''
        });
        if (res && res.ok) {
          updateWhatsAppSyncUI({ ok: true, pc: pcNameInput.value.trim() || 'PC 1' });
          alert('✅ Sukses terhubung ke Webhook WhatsApp Sync!\nData status bot berhasil diterima oleh n8n.');
        } else {
          updateWhatsAppSyncUI({ ok: false, text: res && res.error });
          alert(`⚠️ Gagal terhubung ke URL Sync: ${(res && res.error) || 'Tidak ada respons'}`);
        }
      } catch (e) {
        alert(`❌ Error: ${e.message || String(e)}`);
      } finally {
        btnTestWhatsAppSync.disabled = false;
        btnTestWhatsAppSync.textContent = 'Tes Sync';
      }
    });
  }

  // ---------- Adaptive Throttling UI ----------
  function updateThrottleUI(state) {
    if (!state || !throttleBadge) return;
    const isEnabled = state.enabled !== false;
    const baseSec = ((parseFloat(delayInput.value) || ((state.baseStepDelay || 1500) / 1000) || 1.5)).toFixed(1);

    if (!isEnabled) {
      throttleBadge.textContent = '⚪ Nonaktif';
      throttleBadge.className = 'throttle-badge throttle-disabled';
      if (throttleSpeedInfo) throttleSpeedInfo.innerHTML = `Jeda langkah: <b>${baseSec}s (Tetap)</b>`;
      if (throttleLatencyInfo) throttleLatencyInfo.innerHTML = 'Respon server: <b>Tidak dipantau</b>';
      if (throttleQueueDelayInfo) throttleQueueDelayInfo.classList.add('hidden');
      return;
    }

    const mult = typeof state.multiplier === 'number' ? state.multiplier : 1.0;
    const effSec = (parseFloat(baseSec) * mult).toFixed(1);
    const lvl = state.level || 'NORMAL';

    if (lvl === 'HEAVY') {
      throttleBadge.textContent = `🔴 ${mult.toFixed(1)}x Sangat Lambat`;
      throttleBadge.className = 'throttle-badge throttle-heavy';
    } else if (lvl === 'MODERATE') {
      throttleBadge.textContent = `🟠 ${mult.toFixed(1)}x Beban Tinggi`;
      throttleBadge.className = 'throttle-badge throttle-moderate';
    } else if (lvl === 'MILD') {
      throttleBadge.textContent = `🟡 ${mult.toFixed(1)}x Melambat`;
      throttleBadge.className = 'throttle-badge throttle-mild';
    } else {
      throttleBadge.textContent = `🟢 ${mult.toFixed(1)}x Normal`;
      throttleBadge.className = 'throttle-badge throttle-normal';
    }

    if (throttleSpeedInfo) {
      throttleSpeedInfo.innerHTML = `Jeda langkah: <b>${effSec}s</b> (${mult.toFixed(1)}x)`;
    }

    if (throttleLatencyInfo) {
      const latMs = state.avgLatencyMs || state.lastLatencyMs || 0;
      let latText = 'Normal (<1.5s)';
      if (latMs >= 8000) latText = `Kritis (~${(latMs / 1000).toFixed(1)}s)`;
      else if (latMs >= 4000) latText = `Tinggi (~${(latMs / 1000).toFixed(1)}s)`;
      else if (latMs >= 1800) latText = `Melambat (~${(latMs / 1000).toFixed(1)}s)`;
      else if (latMs > 0) latText = `Cepat (~${(latMs / 1000).toFixed(1)}s)`;
      throttleLatencyInfo.innerHTML = `Respon server: <b>${latText}</b>`;
    }

    if (throttleQueueDelayInfo) {
      if (state.interItemDelay > 0) {
        throttleQueueDelayInfo.classList.remove('hidden');
        throttleQueueDelayInfo.innerHTML = `• Jeda antrian: <b>+${(state.interItemDelay / 1000).toFixed(1)}s</b>`;
      } else {
        throttleQueueDelayInfo.classList.add('hidden');
      }
    }
  }

  if (checkAdaptiveThrottling) {
    checkAdaptiveThrottling.addEventListener('change', () => {
      chrome.runtime.sendMessage({
        action: 'SET_ADAPTIVE_THROTTLE',
        enabled: checkAdaptiveThrottling.checked
      }, (res) => {
        if (!chrome.runtime.lastError && res && res.throttleState) {
          updateThrottleUI(res.throttleState);
        }
      });
      saveSettings();
    });
  }

  if (delayInput) {
    delayInput.addEventListener('input', () => {
      chrome.runtime.sendMessage({ action: 'GET_THROTTLE_STATE' }, (res) => {
        if (!chrome.runtime.lastError && res) updateThrottleUI(res);
      });
    });
  }

  // ---------- Opsi ----------
  function getOptions() {
    return {
      mode: queueMode || activeMode,
      commentText: commentInput.value.trim() || '#DC_00',
      dc0Target: (dc0TargetSelect && dc0TargetSelect.value === '27a' ? 'nilai' : ((dc0TargetSelect && dc0TargetSelect.value) || 'nilai')),
      dc1Target: (dc1TargetSelect && dc1TargetSelect.value) || 'kbli',
      catatanKbliDiganti: catatanDigantiInput.value.trim() || '#DC_01',
      periodeId: periodeInput.value.trim(),
      stepDelay: (parseFloat(delayInput.value) || 1.5) * 1000,
      enableAdaptiveThrottling: checkAdaptiveThrottling ? checkAdaptiveThrottling.checked : true,
      rowStart: rowStartInput && rowStartInput.value ? parseInt(rowStartInput.value, 10) : '',
      rowEnd: rowEndInput && rowEndInput.value ? parseInt(rowEndInput.value, 10) : '',
      pcName: (pcNameInput && pcNameInput.value.trim()) || 'PC 1',
      enableWhatsAppRemote: checkEnableWhatsAppRemote ? checkEnableWhatsAppRemote.checked : true,
      whatsappSyncUrl: (whatsappSyncUrlInput && whatsappSyncUrlInput.value.trim()) || DEFAULT_WHATSAPP_SYNC_URL,
      enableWebhook: Boolean((checkNotifyOnComplete && checkNotifyOnComplete.checked) || (checkNotifyOnPauseStop && checkNotifyOnPauseStop.checked)),
      notifyOnComplete: checkNotifyOnComplete ? checkNotifyOnComplete.checked : true,
      notifyOnPauseStop: checkNotifyOnPauseStop ? checkNotifyOnPauseStop.checked : true,
      webhookUrl: (webhookUrlInput && webhookUrlInput.value.trim()) || DEFAULT_WEBHOOK_URL,
      autoSsoLogin: checkAutoSsoLogin ? checkAutoSsoLogin.checked : true,
      autoRevoke: checkAutoRevoke ? checkAutoRevoke.checked : true,
      ssoEmail: (ssoEmailInput && ssoEmailInput.value.trim()) || 'Haerulhaeruddin003@gmail.com',
      ssoPassword: (ssoPasswordInput && ssoPasswordInput.value) || 'Mitra123',
      requireManualConfirm: checkRequireConfirm.checked,
      autoSubmitSurvey: true,
      autoApprove: checkAutoApprove.checked,
      closeTabOnComplete: checkCloseTab.checked,
      apiDryRun: checkApiDryRun ? checkApiDryRun.checked : true
    };
  }

  function saveSettings() {
    const opts = getOptions();
    chrome.storage.local.set({ runnerOptions: opts, activeMode }).catch(() => {});
    chrome.runtime.sendMessage({ action: 'UPDATE_OPTIONS', options: opts }).catch(() => {});
  }
  [commentInput, dc0TargetSelect, dc1TargetSelect, catatanDigantiInput, delayInput, periodeInput,
    ssoEmailInput, ssoPasswordInput, pcNameInput, webhookUrlInput, whatsappSyncUrlInput,
    checkEnableWhatsAppRemote, checkNotifyOnComplete, checkNotifyOnPauseStop, checkAutoSsoLogin,
    checkAutoRevoke, checkRequireConfirm, checkAutoApprove, checkCloseTab, checkApiDryRun]
    .filter(Boolean)
    .forEach(el => el.addEventListener('change', saveSettings));

  [whatsappSyncUrlInput, webhookUrlInput, pcNameInput].filter(Boolean).forEach(el => {
    el.addEventListener('input', saveSettings);
  });


  // ---------- Menu Ubah Variabel: backup, restore, cari dataKey ----------
  async function refreshBackupCount() {
    try {
      const info = await chrome.runtime.sendMessage({ action: 'API_BACKUP_INFO' });
      if (apiBackupCount) apiBackupCount.textContent = (info && info.count) || 0;
      return info || { count: 0, backups: {} };
    } catch (e) { return { count: 0, backups: {} }; }
  }

  if (btnApiBackup) {
    btnApiBackup.addEventListener('click', async () => {
      const info = await refreshBackupCount();
      if (!info.count) { alert('Belum ada backup. Backup dibuat otomatis sebelum perubahan API disimpan (bukan saat uji coba).'); return; }
      const blob = new Blob([JSON.stringify(info.backups, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      const now = new Date(), pad = (n) => String(n).padStart(2, '0');
      a.href = URL.createObjectURL(blob);
      a.download = `TUNTAS_backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      liveStatusText.textContent = `${info.count} backup diunduh.`;
    });
  }

  if (btnApiRestore) {
    btnApiRestore.addEventListener('click', async () => {
      const info = await refreshBackupCount();
      if (!info.count) { alert('Tidak ada backup untuk di-restore.'); return; }
      if (runnerStatus === 'RUNNING') { alert('Hentikan antrian terlebih dahulu.'); return; }
      const codes = Object.values(info.backups).map(b => b.code || b.assignmentId).slice(0, 10).join('\n');
      if (!confirm(`Kembalikan ${info.count} dokumen ke isi SEBELUM diubah lewat API?\n\n${codes}${info.count > 10 ? '\n…' : ''}\n\nCatatan: status dokumen tidak ikut kembali; buka & Kirim ulang bila perlu.`)) return;
      liveStatusText.textContent = 'Restore berjalan...';
      const res = await chrome.runtime.sendMessage({ action: 'API_RESTORE_BACKUPS', dryRun: false });
      if (!res || !res.ok) { alert('Restore gagal: ' + ((res && res.error) || 'tidak ada respons')); return; }
      const ok = res.results.filter(r => r.ok).length;
      const bad = res.results.filter(r => !r.ok);
      liveStatusText.textContent = `Restore selesai: ${ok} berhasil${bad.length ? `, ${bad.length} gagal` : ''}.`;
      if (bad.length) alert('Gagal restore:\n' + bad.map(b => `${b.code || b.id}: ${b.error}`).join('\n'));
      refreshBackupCount();
    });
  }

  // ---------- Pilih Variabel → Template (menu API) ----------
  let apiVars = [];
  let apiPicked = new Map();

  chrome.storage.local.get(['apiPicked'], (r) => {
    try { (r.apiPicked || []).forEach(v => apiPicked.set(v.dataKey, v)); } catch (e) {}
    updatePickCount();
  });
  function savePicked() { chrome.storage.local.set({ apiPicked: [...apiPicked.values()] }); }
  function updatePickCount() {
    if (apiPickCount) apiPickCount.textContent = `${apiPicked.size} dipilih`;
    if (btnApiPickDownload) {
      btnApiPickDownload.disabled = apiPicked.size === 0;
      btnApiPickDownload.textContent = `② Unduh Template (${apiPicked.size})`;
    }
  }
  function renderPicker() {
    if (!apiPickerList || !apiPickerSearch) return;
    const q = apiPickerSearch.value.trim().toLowerCase();
    const cocok = apiVars.filter(v => !q || v.label.toLowerCase().includes(q) || v.dataKey.toLowerCase().includes(q) || v.bagian.toLowerCase().includes(q));
    apiPickerList.innerHTML = '';
    if (!cocok.length) { apiPickerList.innerHTML = '<div class="api-picker-item">Tidak ada variabel yang cocok.</div>'; return; }
    let sec = null;
    cocok.slice(0, 400).forEach(v => {
      if (v.bagian !== sec) {
        sec = v.bagian;
        const h = document.createElement('div'); h.className = 'api-picker-sec'; h.textContent = sec || 'Lainnya';
        apiPickerList.appendChild(h);
      }
      const row = document.createElement('label');
      row.className = 'api-picker-item' + (apiPicked.has(v.dataKey) ? ' picked' : '');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = apiPicked.has(v.dataKey);
      cb.addEventListener('change', () => {
        if (cb.checked) apiPicked.set(v.dataKey, v); else apiPicked.delete(v.dataKey);
        row.classList.toggle('picked', cb.checked); savePicked(); updatePickCount();
      });
      const txt = document.createElement('div');
      const cara = v.pilihan.length ? `pilihan ${v.pilihan.length} kode` : v.angka ? 'angka' : v.jenis;
      txt.innerHTML = `${escapeHtml(v.label || v.dataKey)}<small>${escapeHtml(v.dataKey)} · ${escapeHtml(cara)}</small>`;
      row.append(cb, txt);
      apiPickerList.appendChild(row);
    });
  }
  if (apiPickerSearch) apiPickerSearch.addEventListener('input', renderPicker);
  if (btnApiPickClear) $('btnApiPickClear').addEventListener('click', () => { apiPicked.clear(); savePicked(); updatePickCount(); renderPicker(); });

  if (btnApiPickVars) {
    btnApiPickVars.addEventListener('click', async () => {
      const tab = await getActiveFasihTab();
      if (!tab) return;
      const ids = String(tab.url).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
      if (!ids.length) { alert('Buka salah satu dokumen (assignment) FASIH di tab aktif terlebih dahulu, lalu klik lagi.'); return; }
      if (apiPicker) apiPicker.classList.remove('hidden');
      if (apiPickerInfo) apiPickerInfo.textContent = 'Memuat daftar variabel dari form FASIH...';
      if (apiPickerList) apiPickerList.innerHTML = '';
      chrome.tabs.sendMessage(tab.id, { action: 'API_LIST_VARS', assignmentId: ids[ids.length - 1] }, (res) => {
        if (chrome.runtime.lastError || !res) { if (apiPickerInfo) apiPickerInfo.textContent = 'Halaman FASIH belum siap. Refresh halaman lalu klik lagi.'; return; }
        if (res.status !== 'DONE') { if (apiPickerInfo) apiPickerInfo.textContent = 'Gagal: ' + res.error; return; }
        apiVars = (res.result.vars || []).filter(v => !API_RESERVED.has(normKey(v.dataKey)));
        if (apiPickerInfo) apiPickerInfo.innerHTML = `<b>${apiVars.length}</b> variabel dari form <b>${escapeHtml(res.result.template || '')}</b>. Centang yang ingin diganti isiannya (KBLI tidak tampil — pakai menu #DC_01).`;
        renderPicker();
        if (apiPickerSearch) apiPickerSearch.focus();
      });
    });
  }

  if (btnApiPickDownload) {
    btnApiPickDownload.addEventListener('click', () => {
      const vars = [...apiPicked.values()];
      if (!vars.length) return;
      const data = XLSX.utils.aoa_to_sheet([['link_fasih_sm', 'nama_usaha', 'kode_catatan', ...vars.map(v => v.dataKey)]]);
      data['!cols'] = [{ wch: 60 }, { wch: 30 }, { wch: 13 }, ...vars.map(v => ({ wch: Math.max(14, v.dataKey.length + 2) }))];
      const cara = (v) => v.pilihan.length ? 'Isi KODE: ' + v.pilihan.join(' | ') : v.angka ? 'Isi angka' : 'Isi teks';
      const petunjuk = XLSX.utils.aoa_to_sheet([
        ['Template Menu API · Ganti Isian Variabel — TUNTAS SE2026'],
        ['Isi sheet DATA: satu baris per dokumen. link_fasih_sm wajib. Sel kosong = tidak diubah, #KOSONG = kosongkan isian.'],
        ['kode_catatan: kode catatan yang ditulis pada setiap variabel yang berubah (kosong = #1). Variabel KBLI tidak diubah di sini (pakai menu #DC_01).'],
        ...Object.entries(KODE_CATATAN).map(([k, t]) => ['', k, t]),
        ['nama_usaha dipakai untuk memilih usaha yang tepat bila satu dokumen berisi lebih dari satu usaha.'],
        ['Selalu jalankan Uji coba (dry run) dulu dan periksa keterangan "dari → ke".'],
        [],
        ['Kolom', 'Pertanyaan', 'Bagian', 'Cara isi'],
        ...vars.map(v => [v.dataKey, v.label, v.bagian, cara(v)])
      ]);
      petunjuk['!cols'] = [{ wch: 22 }, { wch: 55 }, { wch: 25 }, { wch: 70 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, data, 'DATA');
      XLSX.utils.book_append_sheet(wb, petunjuk, 'PETUNJUK');
      XLSX.writeFile(wb, `Template_TUNTAS_API_${vars.length}variabel.xlsx`);
      liveStatusText.textContent = `Template dengan ${vars.length} variabel diunduh. Isi nilai baru lalu upload di sini.`;
    });
  }

  if (btnApiFindKey) {
    btnApiFindKey.addEventListener('click', async () => {
      const tab = await getActiveFasihTab();
      if (!tab) return;
      const ids = String(tab.url).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
      if (!ids.length) { alert('Buka halaman dokumen (assignment) di tab aktif terlebih dahulu.'); return; }
      const q = (prompt('Cari variabel berdasarkan label / dataKey (mis. "kbli", "nama usaha", "jumlah pekerja"):') || '').trim();
      if (!q) return;
      liveStatusText.textContent = 'Mencari dataKey...';
      chrome.tabs.sendMessage(tab.id, { action: 'API_FIND_KEYS', assignmentId: ids[ids.length - 1], query: q }, (res) => {
        if (chrome.runtime.lastError || !res) { alert('Halaman belum siap. Refresh halaman FASIH lalu coba lagi.'); return; }
        if (res.status !== 'DONE') { alert('Gagal: ' + res.error); return; }
        const rows = res.result || [];
        const bisa = rows.filter(r => !r.kbli);
        diagSummary.innerHTML = `<div><b>${bisa.length}</b> isian cocok dengan "${escapeHtml(q)}"${rows.length > bisa.length ? ` (+${rows.length - bisa.length} isian KBLI → pakai menu #DC_01)` : ''}.<br>` +
          `Salin teks setelah <b>Judul kolom</b> (lengkap dengan #angka) ke baris pertama Excel, lalu isi nilai baru di bawahnya.</div>`;
        const isiSel = (r) => r.pilihan ? `isi sel dengan KODE: ${r.pilihan}` : r.angka ? 'isi sel dengan angka' : 'isi sel dengan teks';
        diagOutput.textContent = rows.map(r => r.kbli
          ? `⛔ ${r.label || r.dataKey}\n   variabel KBLI — tidak bisa di menu API, gunakan menu #DC_01`
          : `▶ ${r.label || r.dataKey}\n` + r.kolom.map(k => `   Judul kolom: ${k.kolom}    (isi sekarang: ${k.sekarang})`).join('\n') + `\n   ${isiSel(r)}`
        ).join('\n\n') || '(tidak ada isian yang cocok)';
        diagCard.classList.remove('hidden');
        liveStatusText.textContent = 'Hasil pencarian dataKey ditampilkan.';
      });
    });
  }

  // ---------- Event Listener Menu NTB ----------
  // Event Listener Opsi Custom Sheet 3 pada Tab NTB
  if (checkUseCustomSheet3) {
    checkUseCustomSheet3.addEventListener('change', () => {
      if (activeMode === 'NTB' && ntbValidationResult) {
        applyNtbFilter(ntbFilterMode);
        const isCustom = Boolean(checkUseCustomSheet3.checked && ntbCustomSheet3Rows && ntbCustomSheet3Rows.length);
        liveStatusText.textContent = isCustom
          ? `Antrian dimuat menggunakan Sheet 3 Kustom (${ntbCustomSheet3Rows.length} baris perbaikan racikan sendiri).`
          : 'Antrian dikembalikan menggunakan hitungan formula otomatis ekstensi.';
      }
    });
  }

  if (btnUploadCustomSheet3 && customSheet3Input) {
    btnUploadCustomSheet3.addEventListener('click', () => {
      customSheet3Input.value = '';
      customSheet3Input.click();
    });
    customSheet3Input.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        const wbCustom = XLSX.read(buf, { type: 'array' });
        let sName = wbCustom.SheetNames.find(n => /Template API|Siap Pakai|Sheet\s*3|^API/i.test(n.trim()));
        if (!sName) {
          sName = wbCustom.SheetNames.find(sn => {
            try {
              const rows = XLSX.utils.sheet_to_json(wbCustom.Sheets[sn], { header: 1, range: 0 });
              const headers = (rows && rows[0]) || [];
              return headers.some(h => /link_fasih|assignment_id/i.test(String(h).trim()));
            } catch (e) { return false; }
          }) || wbCustom.SheetNames[0];
        }
        const rawData = XLSX.utils.sheet_to_json(wbCustom.Sheets[sName], { defval: '', raw: false });
        const parsed = parseApiRows(rawData);
        if (!parsed.length) {
          alert('File Sheet 3 tidak memiliki baris data yang valid.');
          return;
        }
        ntbCustomSheet3Rows = parsed;
        if (checkUseCustomSheet3) checkUseCustomSheet3.checked = true;
        updateCustomSheet3UI();
        if (ntbValidationResult) {
          applyNtbFilter(ntbFilterMode);
        }
        alert(`Sheet 3 Kustom berhasil dimuat: ${parsed.length} baris perbaikan racikan sendiri!\nNilai perbaikan Status #1 kini menggunakan data dari file ini.`);
      } catch (err) {
        alert('Gagal membaca file Sheet 3: ' + err.message);
      }
    });
  }

  if (btnResetCustomSheet3) {
    btnResetCustomSheet3.addEventListener('click', () => {
      ntbCustomSheet3Rows = null;
      if (checkUseCustomSheet3) checkUseCustomSheet3.checked = false;
      updateCustomSheet3UI();
      if (ntbValidationResult) {
        applyNtbFilter(ntbFilterMode);
      }
    });
  }

  if (btnDownloadNtbExcel) {
    btnDownloadNtbExcel.addEventListener('click', () => {
      if (!ntbValidationResult || !ntbValidationResult.items || !ntbValidationResult.items.length) {
        alert('Belum ada data validasi NTB.');
        return;
      }
      try {
        const wbOut = NTB_VALIDATOR.generateNtbWorkbook(ntbValidationResult.items, XLSX);
        const base = (fileName.textContent && fileName.textContent !== '-') ? fileName.textContent.replace(/\.[^/.]+$/, '') : 'Validasi_NTB_Flag3';
        const now = new Date(), pad = (n) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
        XLSX.writeFile(wbOut, `Hasil_Validasi_NTB_${base}_${stamp}.xlsx`);
        liveStatusText.textContent = 'File Excel Hasil Validasi NTB (3-Sheet) berhasil diunduh.';
      } catch (err) {
        alert('Gagal membuat Excel: ' + err.message);
      }
    });
  }

  if (btnNtbLoadAll) btnNtbLoadAll.addEventListener('click', () => applyNtbFilter('ALL'));
  if (btnNtbLoadOnly1) btnNtbLoadOnly1.addEventListener('click', () => applyNtbFilter('ONLY_1'));
  if (btnNtbLoadOnly0) btnNtbLoadOnly0.addEventListener('click', () => applyNtbFilter('ONLY_0'));

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
    const nJalan = queue.filter(q => q.status === 'PENDING' || q.status === 'DRYRUN').length;
    if (queueMode === 'API') {
      if (checkApiDryRun && checkApiDryRun.checked) {
        liveStatusText.textContent = 'Uji coba: membaca dokumen & menghitung perubahan (tidak menyimpan)...';
      } else if (!confirm(`SIMPAN perubahan lewat API untuk ${nJalan} dokumen?\n\n• Backup otomatis dibuat sebelum menyimpan.\n• ${checkAutoApprove.checked ? 'Setelah itu form dibuka & dikirim (dibatalkan bila ada GALAT), lalu di-Approve.' : 'Setelah itu form dibuka & dikirim (dibatalkan bila ada GALAT).'}\n\nPastikan hasil uji coba sudah diperiksa.`)) {
        return;
      }
    } else if (queueMode === 'NTB') {
      const n1 = queue.filter(q => (q.status === 'PENDING' || q.status === 'DRYRUN') && q.mode === 'API').length;
      const n0 = queue.filter(q => (q.status === 'PENDING' || q.status === 'DRYRUN') && q.mode === 'DC0').length;
      if (!confirm(`Mulai eksekusi Validasi NTB untuk ${nJalan} dokumen?\n\n• ${n1} usaha Status #1 (Anomali) → Ubah variabel & beri catatan #1 via API, Kirim & Approve\n• ${n0} usaha Status #0 (Wajar) → Beri catatan #0 pada nilai produksi, Kirim & Approve`)) {
        return;
      }
    } else if (checkAutoApprove.checked &&
        !confirm(`Mulai ${queueMode === 'DC1' ? '#DC_01 (Ganti KBLI)' : '#DC_00 (Tanpa Perubahan)'} untuk ${nJalan} dokumen?\nDokumen akan DIKIRIM dan DI-APPROVE otomatis.`)) {
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
    if (activeMode === 'API' || activeMode === 'NTB') {
      alert('Menu Ubah Variabel diuji lewat antrian: upload Excel 1 baris, biarkan "Uji coba (dry run)" tercentang, lalu Mulai.');
      return;
    }
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
        base.menu = item.mode === 'DC1' ? '#DC_01' : (item.mode === 'API' ? (item.ntbInfo ? 'NTB_API' : 'API') : (item.ntbInfo ? 'NTB_DC0' : '#DC_00'));
        if (item.ntbInfo) {
          base.Status_NTB = item.ntbInfo.status;
          base.Kategori_KBLI = item.ntbInfo.kategori;
          base.Rasio_NTB_Riil = item.ntbInfo.rasio || item.ntbInfo.rasioLama;
          if (item.ntbInfo.varUbah) {
            base.Variabel_Imputasi = item.ntbInfo.varUbah;
            base.Nominal_Baru = item.ntbInfo.valBaru;
            base.Estimasi_Rasio_Baru = item.ntbInfo.rasioBaru;
          }
        }
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
    if (item.status === 'DRYRUN') return ['status-dryrun', 'Uji OK'];
    if (item.status === 'SKIPPED') return ['status-skipped', 'Dilewati'];
    if (item.status === 'PROCESSING' || item.status === 'OPENING_TAB') return ['status-running', 'Memproses'];
    if (item.status === 'FAILED') {
      const e = String(item.error || '').toUpperCase();
      if (e.includes('APPROVE GAGAL')) return ['status-galat', 'Belum Approve'];
      if (e.includes('TERPUTUS')) return ['status-skipped', 'Cek manual'];
      if (/GALAT|WAJIB|BELUM DIISI|VALIDASI|ANOMALI/.test(e)) return ['status-galat', 'Galat'];
      return ['status-failed', 'Gagal'];
    }
    if (item.status === 'PENDING' && item.ntbInfo) {
      if (item.ntbInfo.status === '#1') return ['status-ntb-1', 'Pending #1'];
      return ['status-ntb-0', 'Pending #0'];
    }
    return ['status-pending', 'Pending'];
  }

  let lastActiveQueueIndex = 0;

  function renderQueueTable() {
    const totalAll = allRows.length || queue.length;
    const { startRow, endRow, isFiltered } = getRowRangeBounds(totalAll);
    const rangeInfo = (queue.length && isFiltered) ? ` (Baris ${startRow}–${endRow})` : '';
    queueSummary.textContent = queue.length ? `${queue.length} item${rangeInfo} · ${MODE_LABEL[queueMode] || '#DC_00'}` : '0 item';
    if (!queue.length) {
      queueTableBody.innerHTML = '<tr><td colspan="3" class="empty-state">Belum ada file Excel diimpor</td></tr>';
      return;
    }

    // Virtual windowing untuk performa tinggi saat antrian memiliki ribuan baris (mis. 6000 - 7000 baris)
    const MAX_RENDER = 100;
    let renderItems = queue;
    let offsetIdx = 0;
    let isWindowed = false;

    if (queue.length > MAX_RENDER) {
      isWindowed = true;
      const cur = lastActiveQueueIndex || 0;
      offsetIdx = Math.max(0, Math.min(cur - 20, queue.length - MAX_RENDER));
      renderItems = queue.slice(offsetIdx, offsetIdx + MAX_RENDER);
    }

    const rowsHtml = renderItems.map((item, localIdx) => {
      const idx = offsetIdx + localIdx;
      const [cls, label] = badgeFor(item);
      const rowNum = item.excelRowNum || (idx + 1);
      const apiKeys = item.apiValues ? Object.keys(item.apiValues) : [];
      const apiRem = item.apiRemarks ? Object.keys(item.apiRemarks) : [];
      const sub = item.kbliTask
        ? `<div class="kbli-line">KBLI ${escapeHtml(item.kbliTask.kbliAwal)} → ${escapeHtml(item.kbliTask.kbliTujuan)}</div>`
        : (item.mode === 'API'
          ? `<div class="kbli-line">${escapeHtml(apiKeys.slice(0, 4).map(k => `${k}=${item.apiValues[k]}`).join(', '))}${apiKeys.length > 4 ? ` +${apiKeys.length - 4}` : ''}${apiRem.length ? ` · ${apiRem.length} catatan` : ''}</div>`
          : '');
      const customSheetPill = (item.ntbInfo && item.ntbInfo.isCustomSheet3) ? '<span class="badge-custom-pill">Sheet 3 Kustom</span> ' : '';
      const ntbLine = item.ntbInfo
        ? (item.ntbInfo.status === '#1'
            ? `<div class="ntb-line ntb-line-anomali">⚠️ <b>#1 Imputasi:</b> ${customSheetPill}Ubah <code>${escapeHtml(item.ntbInfo.varUbah || '')}</code> jadi <b>${typeof item.ntbInfo.valBaru === 'number' ? NTB_VALIDATOR.formatRp(item.ntbInfo.valBaru) : escapeHtml(item.ntbInfo.valBaru || '')}</b> (Rasio: ${item.ntbInfo.rasioLama}% → ${item.ntbInfo.rasioBaru}%)</div>`
            : `<div class="ntb-line ntb-line-valid">✅ <b>#0 Wajar:</b> Kategori ${escapeHtml(item.ntbInfo.kategori || '')} · Rasio Riil: <b>${item.ntbInfo.rasio}%</b></div>`
          )
        : '';
      const note = item.error ? `<div class="row-note">${escapeHtml(item.error)}</div>` : '';
      return `<tr>
          <td>${rowNum}</td>
          <td title="${escapeHtml(item.link_fasih_sm)}"><strong>${escapeHtml(item.nama_usaha)}</strong>${sub}${ntbLine}${note}</td>
          <td><span class="status-badge-table ${cls}">${label}</span></td>
        </tr>`;
    }).join('');

    if (isWindowed) {
      const headerNote = offsetIdx > 0 ? `<tr><td colspan="3" class="empty-state" style="padding:6px; font-size:11px; background:rgba(0,0,0,0.02);">▲ ... ${offsetIdx} baris sebelumnya disembunyikan ...</td></tr>` : '';
      const remaining = queue.length - (offsetIdx + renderItems.length);
      const footerNote = remaining > 0 ? `<tr><td colspan="3" class="empty-state" style="padding:6px; font-size:11px; background:rgba(0,0,0,0.02);">▼ ... ${remaining} baris berikutnya disembunyikan ...</td></tr>` : '';
      queueTableBody.innerHTML = headerNote + rowsHtml + footerNote;
    } else {
      queueTableBody.innerHTML = rowsHtml;
    }
  }

  function updateProgressUI() {
    const total = queue.length;
    const done = queue.filter(i => ['SUCCESS', 'SKIPPED', 'FAILED', 'INVALID', 'DRYRUN'].includes(i.status)).length;
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
    const data = await chrome.storage.local.get(['fasihAllRows', 'fasihQueue', 'runnerState', 'excelFileName', 'runnerOptions', 'queueMode', 'activeMode', 'ntbValidationResult', 'ntbFilterMode']);
    const o = data.runnerOptions || {};
    // Nilai tersimpan versi sebelumnya (#DC_0 / #DC_1) tidak dipulihkan; default resmi #DC_00 / #DC_01
    if (o.commentText && o.commentText !== '#DC_0') commentInput.value = o.commentText;
    if (o.dc0Target && dc0TargetSelect) dc0TargetSelect.value = (o.dc0Target === '27a' ? 'nilai' : o.dc0Target);
    if (o.dc1Target && dc1TargetSelect) dc1TargetSelect.value = (o.dc1Target === '27a' ? 'nilai' : o.dc1Target);
    if (o.catatanKbliDiganti && o.catatanKbliDiganti !== '#DC_1') catatanDigantiInput.value = o.catatanKbliDiganti;
    if (o.periodeId) periodeInput.value = o.periodeId;
    if (o.stepDelay) delayInput.value = o.stepDelay / 1000;
    if (o.rowStart !== undefined && rowStartInput) rowStartInput.value = o.rowStart || '';
    if (o.rowEnd !== undefined && rowEndInput) rowEndInput.value = o.rowEnd || '';
    if (o.ssoEmail && ssoEmailInput) ssoEmailInput.value = o.ssoEmail;
    if (o.ssoPassword && ssoPasswordInput) ssoPasswordInput.value = o.ssoPassword;
    if (o.pcName && pcNameInput) pcNameInput.value = o.pcName;
    if (waSyncPcLabel) waSyncPcLabel.textContent = o.pcName || 'PC 1';
    if (webhookUrlInput) webhookUrlInput.value = o.webhookUrl || DEFAULT_WEBHOOK_URL;
    if (o.whatsappSyncUrl && whatsappSyncUrlInput) whatsappSyncUrlInput.value = o.whatsappSyncUrl;
    if (o.enableWhatsAppRemote !== undefined && checkEnableWhatsAppRemote) checkEnableWhatsAppRemote.checked = o.enableWhatsAppRemote;
    if (o.enableAdaptiveThrottling !== undefined && checkAdaptiveThrottling) checkAdaptiveThrottling.checked = o.enableAdaptiveThrottling;
      if (o.notifyOnComplete !== undefined && checkNotifyOnComplete) checkNotifyOnComplete.checked = o.notifyOnComplete;
      if (o.notifyOnPauseStop !== undefined && checkNotifyOnPauseStop) checkNotifyOnPauseStop.checked = o.notifyOnPauseStop;
    if (o.autoSsoLogin !== undefined && checkAutoSsoLogin) checkAutoSsoLogin.checked = o.autoSsoLogin;
    if (o.autoRevoke !== undefined && checkAutoRevoke) checkAutoRevoke.checked = o.autoRevoke;
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
      if (data.ntbValidationResult) {
        ntbValidationResult = data.ntbValidationResult;
        ntbFilterMode = data.ntbFilterMode || 'ALL';
        updateNtbSummaryUI();
      }
      queueMode = data.queueMode || (queue.some(q => q.ntbInfo) ? 'NTB' : (queue.some(q => q.mode === 'API') ? 'API' : (queue.some(q => q.kbliTask) ? 'DC1' : 'DC0')));
      if (o.apiDryRun !== undefined && checkApiDryRun) checkApiDryRun.checked = o.apiDryRun;
      refreshBackupCount();
      showFileInfo(data.excelFileName || 'File Excel');
    }
    setActiveMode(queueMode || data.activeMode || 'DC0', { silent: true });
    renderQueueTable();

    const st = data.runnerState && data.runnerState.status;
    setRunnerStatus(st || 'IDLE');
    if (st === 'RUNNING') {
      showRunningButtons();
      let activeIdx = (data.runnerState && data.runnerState.currentIndex) || 0;
      let currentItem = queue[activeIdx];
      if (currentItem && (currentItem.status === 'SKIPPED' || currentItem.status === 'SUCCESS' || currentItem.status === 'FAILED')) {
        const nextActiveIdx = queue.findIndex((it, idx) => idx > activeIdx && (it.status === 'PROCESSING' || it.status === 'OPENING_TAB' || it.status === 'PENDING'));
        if (nextActiveIdx !== -1) {
          activeIdx = nextActiveIdx;
          currentItem = queue[activeIdx];
        }
      }
      const usahaName = currentItem ? (currentItem.nama_usaha || `Baris #${activeIdx + 1}`) : '';
      liveStatusText.textContent = usahaName ? `Sedang memproses: ${usahaName}` : 'Sedang memproses antrian...';
      // Sinkronkan & bangunkan runner background jika sempat tertahan di antara baris
      chrome.runtime.sendMessage({ action: 'GET_RUNNER_STATE' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        if (res.queue && res.queue.length) {
          queue = res.queue;
          renderQueueTable();
          updateProgressUI();
        }
        if (res.runnerState && res.runnerState.status !== 'RUNNING') {
          setRunnerStatus(res.runnerState.status || 'IDLE');
          if (res.runnerState.status === 'IDLE') showIdleButtons();
        }
      });
    } else if (st === 'PAUSED') {
      showRunningButtons();
      btnPause.classList.add('hidden');
      btnResume.classList.remove('hidden');
      liveStatusText.textContent = 'Dijeda.';
    } else {
      showIdleButtons();
    }
  }

  await loadSavedState();

    // ---------- Jaga sesi FASIH tetap aktif ----------
  function renderKeepAlive(k) {
    if (!keepAliveStatus) return;
    if (!k || !k.at) {
      keepAliveStatus.className = 'keepalive-status';
      keepAliveStatus.textContent = 'Status sesi: belum diperiksa';
      return;
    }
    const jam = new Date(k.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    keepAliveStatus.className = 'keepalive-status ' + (k.ok ? 'ok' : (k.expired ? 'err' : ''));
    keepAliveStatus.textContent = k.ok
      ? `Sesi FASIH aktif — terakhir diperpanjang ${jam}${k.user ? ` (${k.user})` : ''}`
      : k.expired
      ? `Sesi FASIH habis (${jam}) — silakan login SSO Eksternal kembali.`
      : `Belum bisa diperiksa (${jam}): ${k.msg || ''}`;
  }

  if (checkKeepAlive) {
    chrome.storage.local.get(['tuntasKeepAlive', 'tuntasKeepAliveOn'], (r) => {
      checkKeepAlive.checked = r.tuntasKeepAliveOn !== false;
      renderKeepAlive(r.tuntasKeepAlive);
    });

    checkKeepAlive.addEventListener('change', async () => {
      await chrome.storage.local.set({ tuntasKeepAliveOn: checkKeepAlive.checked });
      chrome.runtime.sendMessage({ action: 'KEEPALIVE_CONFIG' }).catch(() => {});
      if (!checkKeepAlive.checked && keepAliveStatus) {
        keepAliveStatus.className = 'keepalive-status';
        keepAliveStatus.textContent = 'Penjaga sesi dimatikan.';
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.tuntasKeepAlive) renderKeepAlive(changes.tuntasKeepAlive.newValue);
    });

    chrome.runtime.sendMessage({ action: 'KEEPALIVE_NOW' }).catch(() => {});
  }

  // ---------- Pesan dari background ----------
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'QUEUE_UPDATED') {
      queue = request.queue;
      if (request.index !== undefined) {
        lastActiveQueueIndex = request.index;
      }
      btnExportExcel.disabled = !queue.length;
      renderQueueTable();
      updateProgressUI();
      if (runnerStatus === 'RUNNING' && request.index !== undefined && queue[request.index]) {
        const item = queue[request.index];
        if (item.status === 'SKIPPED') {
          liveStatusText.textContent = `Dilewati: ${item.nama_usaha || `Baris #${request.index + 1}`}`;
        } else if (item.status === 'SUCCESS') {
          liveStatusText.textContent = `Selesai: ${item.nama_usaha || `Baris #${request.index + 1}`}`;
        }
      }
    }
    if (request.action === 'THROTTLE_STATE_UPDATED') {
      updateThrottleUI(request.throttleState);
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

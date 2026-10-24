/* ============================================================================
 * TUNTAS SE2026 — Mesin API FASIH (menu "Ubah Variabel")
 * ----------------------------------------------------------------------------
 * Diadaptasi dari "Fasih Batch Extension" (lib/general_console.js)
 *   MIT License — Copyright (c) 2026 Nahar Ridlo Nasrullah
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software ... to deal in the Software without restriction ...
 *   (teks lisensi lengkap: lihat THIRD_PARTY_LICENSES.txt)
 *
 * PERINGATAN: server FASIH tidak memvalidasi isi dokumen. Perubahan lewat API
 * melewati aturan form (FormGear). Karena itu TUNTAS selalu:
 *   1) dry run lebih dulu, 2) menyimpan backup sebelum menulis,
 *   3) membuka form segar lalu menekan Kirim (validasi FASIH berjalan),
 *   4) membatalkan Kirim bila FASIH menampilkan GALAT.
 * ==========================================================================*/

(() => {
  if (self.TUNTAS_API) return;

  const API = `${location.origin}/app/api`;
  const enc = new TextEncoder();

  const xsrf = () => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
  const jh = () => ({ 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf() });

  // Helper fetch adaptif dengan retry & exponential backoff saat server lambat / error 429/502/503/504
  async function adaptiveFetch(url, options = {}, { maxRetries = 2, baseBackoffMs = 1500 } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const t0 = Date.now();
      try {
        const r = await fetch(url, options);
        const dur = Date.now() - t0;
        if (r.status === 429 || r.status === 502 || r.status === 503 || r.status === 504) {
          if (attempt < maxRetries) {
            const backoff = baseBackoffMs * Math.pow(2, attempt);
            console.warn(`[TUNTAS API] Server merespons HTTP ${r.status}. Jeda adaptif ${backoff}ms sebelum mencoba lagi...`);
            try {
              chrome.runtime.sendMessage({
                action: 'RECORD_SERVER_LATENCY',
                source: 'API_CALL',
                duration: dur + backoff,
                isError: true,
                errorMsg: `HTTP ${r.status}`
              });
            } catch (_) {}
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }
        }
        if (dur > 2000) {
          try {
            chrome.runtime.sendMessage({
              action: 'RECORD_SERVER_LATENCY',
              source: 'API_CALL',
              duration: dur
            });
          } catch (_) {}
        }
        return r;
      } catch (e) {
        lastErr = e;
        if (attempt < maxRetries) {
          const backoff = baseBackoffMs * Math.pow(2, attempt);
          console.warn(`[TUNTAS API] Fetch error: ${e.message}. Menunggu ${backoff}ms...`);
          try {
            chrome.runtime.sendMessage({
              action: 'RECORD_SERVER_LATENCY',
              source: 'API_CALL',
              duration: Date.now() - t0 + backoff,
              isError: true,
              errorMsg: e.message
            });
          } catch (_) {}
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
    }
    throw lastErr || new Error('Gagal menghubungi server API FASIH.');
  }

  async function getAssignment(id) {
    const r = await adaptiveFetch(`${API}/assignment-general/api/assignment/get-by-assignment-id?assignmentId=${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`Gagal membaca assignment (HTTP ${r.status}). Pastikan sudah login FASIH.`);
    const j = await r.json();
    return j.data || j;
  }

  /* ---------------- crc32 / md5 / zip ---------------- */
  const CRC_T = (() => { const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function md5hex(bytes) {
    const rl = (n, c) => (n << c) | (n >>> (32 - c)), add = (x, y) => (x + y) | 0;
    const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22, 5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
               4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23, 6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    const K = new Int32Array(64);
    for (let i = 0; i < 64; i++) K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) | 0;
    const len = bytes.length, padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
    padded.set(bytes); padded[len] = 0x80;
    const dv = new DataView(padded.buffer), bits = len * 8;
    dv.setUint32(padded.length - 8, bits >>> 0, true);
    dv.setUint32(padded.length - 4, Math.floor(bits / 4294967296), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Int32Array(16);
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) M[i] = dv.getInt32(off + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) { let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = add(add(add(F, A), K[i]), M[g]); A = D; D = C; C = B; B = add(B, rl(F, S[i])); }
      a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D); }
    const out = new Uint8Array(16), odv = new DataView(out.buffer);
    odv.setInt32(0, a0, true); odv.setInt32(4, b0, true); odv.setInt32(8, c0, true); odv.setInt32(12, d0, true);
    return [...out].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const deflateRaw = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());

  async function makeZip(files) {
    const now = new Date();
    const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    const locals = [], centrals = []; let offset = 0;
    for (const f of files) {
      const nameB = enc.encode(f.name), comp = await deflateRaw(f.bytes), crc = crc32(f.bytes);
      const lh = new Uint8Array(30 + nameB.length), ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true); ldv.setUint16(4, 20, true); ldv.setUint16(8, 8, true);
      ldv.setUint16(10, dt, true); ldv.setUint16(12, dd, true); ldv.setUint32(14, crc, true);
      ldv.setUint32(18, comp.length, true); ldv.setUint32(22, f.bytes.length, true);
      ldv.setUint16(26, nameB.length, true); lh.set(nameB, 30);
      const ch = new Uint8Array(46 + nameB.length), cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true);
      cdv.setUint16(10, 8, true); cdv.setUint16(12, dt, true); cdv.setUint16(14, dd, true);
      cdv.setUint32(16, crc, true); cdv.setUint32(20, comp.length, true);
      cdv.setUint32(24, f.bytes.length, true); cdv.setUint16(28, nameB.length, true);
      cdv.setUint32(42, offset, true); ch.set(nameB, 46);
      locals.push(lh, comp); centrals.push(ch); offset += lh.length + comp.length;
    }
    const cdSize = centrals.reduce((a, c) => a + c.length, 0);
    const eocd = new Uint8Array(22), edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true); edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true); edv.setUint32(12, cdSize, true); edv.setUint32(16, offset, true);
    const zip = new Uint8Array(offset + cdSize + 22); let p = 0;
    for (const c of [...locals, ...centrals, eocd]) { zip.set(c, p); p += c.length; }
    return zip;
  }

  /* ---------------- skema template (cache per template) ---------------- */
  const TYPE_NAME = { 1: 'section', 2: 'subsection', 3: 'group', 4: 'variable/hidden', 6: 'note', 16: 'toggle', 17: 'toggle',
    20: 'number', 21: 'select', 24: 'lookup', 25: 'text', 26: 'radio/select', 27: 'select', 28: 'number', 29: 'nested',
    30: 'textarea', 32: 'photo', 33: 'select', 34: 'signature', 35: 'datetime', 38: 'table' };
  const OPTION_TYPES = new Set([21, 26, 27, 33]);
  const BOOL_TYPES = new Set([16, 17]);
  const NUM_TYPES = new Set([20, 28]);
  const schemaCache = new Map();

  async function loadSchema(asg) {
    const doc = JSON.parse(asg.data);
    const mode = (Array.isArray(asg.mode) ? asg.mode[0] : asg.mode) || 'CAPI';
    const key = `${asg.survey_period_id}|${mode}|${doc.templateVersion}`;
    if (schemaCache.has(key)) return schemaCache.get(key);
    const p = (async () => {
      const per = await adaptiveFetch(`${API}/survey/api/v1/survey-periods/${asg.survey_period_id}`, { credentials: 'include' }).then((r) => r.json());
      const surveyId = (per.data || per).surveyId;
      const list = await adaptiveFetch(`${API}/survey/api/v1/survey-templates/search?surveyId=${surveyId}`, { credentials: 'include' }).then((r) => r.json());
      const tpls = list.data || list;
      const t = tpls.find((x) => x.mode === mode && x.templateVersion === doc.templateVersion) || tpls.find((x) => x.mode === mode) || tpls[0];
      if (!t) throw new Error('Template form tidak ditemukan');
      const T = await adaptiveFetch(`${API}/designer/api/template/file/${t.templateId}?templateVersion=${t.templateVersion}&validationVersion=${t.validationVersion}`,
        { credentials: 'include' }).then((r) => r.json());
      const S = new Map();
      (function walk(node, section) {
        if (Array.isArray(node)) return node.forEach((n) => walk(n, section));
        if (!node || typeof node !== 'object') return;
        const sec = node.type === 1 ? (node.label || section) : section;
        if (node.dataKey) S.set(node.dataKey, {
          dataKey: node.dataKey, type: node.type, kind: TYPE_NAME[node.type] || String(node.type), label: node.label, section: sec,
          options: (node.options || []).map((o) => ({ ...o })),
          lookup: Array.isArray(node.sourceSelect) && node.sourceSelect.length ? node.sourceSelect[0].tableName : null
        });
        if (Array.isArray(node.components)) walk(node.components, sec);
      })(T.components, null);
      return { map: S, name: t.surveyTemplateName, version: t.templateVersion };
    })();
    schemaCache.set(key, p);
    p.catch(() => schemaCache.delete(key));
    return p;
  }

  const baseKey = (k) => String(k).replace(/#\d+$/, '');
  // Variabel KBLI (13.g & turunannya) dikelola menu #1, bukan menu API
  const KBLI_KEYS = new Set(['kbli', 'kbli_genai', 'kbli_akhir', 'kategori']);
  const isKbliKey = (k) => { const b = baseKey(String(k).trim()).toLowerCase(); return KBLI_KEYS.has(b) || /^kbli/.test(b); };
  const RAW = Symbol('raw');
  const raw = (v) => ({ [RAW]: v });

  function coerce(S, dataKey, value, prevAnswer) {
    if (value && typeof value === 'object' && RAW in value) return value[RAW];
    const f = S.get(baseKey(dataKey));
    if (!f || value === null || value === undefined) return value;
    if (BOOL_TYPES.has(f.type)) return value === true || /^(true|1|ya|y)$/i.test(String(value).trim());
    if (NUM_TYPES.has(f.type)) {
      const n = Number(String(value).trim().replace(',', '.'));
      if (Number.isNaN(n)) throw new Error(`${dataKey}: "${value}" bukan angka`);
      return n;
    }
    if (OPTION_TYPES.has(f.type)) {
      if (!f.options.length) {
        throw new Error(`${dataKey}: pilihannya diambil dari tabel ${f.lookup || 'dinamis'} — isi dengan JSON lengkap ([{"label":…,"value":…}])`);
      }
      const prevObj = Array.isArray(prevAnswer) && prevAnswer[0] && typeof prevAnswer[0] === 'object' ? prevAnswer[0] : null;
      const OWN = new Set(['label', 'value', 'description', 'open']);
      const extra = prevObj ? Object.fromEntries(Object.entries(prevObj).filter(([k]) => !OWN.has(k))) : {};
      const resolve = (v) => {
        const want = String(v).trim().toLowerCase();
        const o = f.options.find((x) => String(x.value).toLowerCase() === want) || f.options.find((x) => String(x.label).trim().toLowerCase() === want);
        if (!o) throw new Error(`${dataKey}: nilai "${v}" tidak ada di pilihan. Valid: ${f.options.map((x) => `${x.value}=${x.label}`).join(' | ')}`);
        return { ...o };
      };
      const build = (code) => {
        const merged = { ...extra, ...resolve(code) };
        if (!prevObj) return merged;
        const out = {};
        for (const k of Object.keys(prevObj)) out[k] = (k in merged) ? merged[k] : prevObj[k];
        return out;
      };
      if (Array.isArray(value) && value.length && typeof value[0] === 'object' && 'label' in value[0]) return value;
      if (Array.isArray(value)) return value.map(build);
      return [build(value)];
    }
    return value;
  }

  // Pengaman bentuk: jangan pernah menulis teks polos ke field pilihan (membuat section gagal tampil)
  function setAnswer(S, doc, k, v) {
    const row = doc.answers.find((a) => a.dataKey === k);
    const val = coerce(S, k, v, row && row.answer);
    const f = S.get(baseKey(k));
    const wasArray = row && Array.isArray(row.answer);
    if (val !== null && val !== undefined && !Array.isArray(val) && (wasArray || (f && OPTION_TYPES.has(f.type)))) {
      throw new Error(`${k}: menolak menulis nilai non-pilihan ke variabel pilihan`);
    }
    if (!f && !row) throw new Error(`${k}: variabel tidak ditemukan di form maupun di dokumen — periksa ejaan dataKey`);
    if (row) row.answer = val; else doc.answers.push({ dataKey: k, answer: val });
    return val;
  }

  const flatten = (v) => v == null ? '(kosong)'
    : Array.isArray(v) ? v.map((x) => (x && x.label != null ? x.label : JSON.stringify(x))).join(' / ')
    : typeof v === 'object' ? JSON.stringify(v) : String(v);

  // Smart Alias Mapping untuk kuisioner Usaha Buka 2026 (> 2025) dan Kuisioner UB
  const SMART_NTB_ALIASES = {
    // Pendapatan Barang & Jasa (R27a / 31a / 23a)
    'r27a': [
      'r27a', 'b4_r27a', 'r27_a',
      'nilai_pendapatan_bln', 'r31a', 'r31_a', 'r31', 'pendapatan_bln',
      'r23a', 'r23_a', 'nilai_produksi_ub', 'nilai_produksi'
    ],
    'b4_r27a': [
      'b4_r27a', 'r27a', 'r27_a',
      'nilai_pendapatan_bln', 'r31a', 'r31_a', 'r31', 'pendapatan_bln',
      'r23a', 'r23_a', 'nilai_produksi_ub', 'nilai_produksi'
    ],

    // Pendapatan Lainnya (R27b / 31b / 23b)
    'r27b': [
      'r27b', 'b4_r27b', 'r27_b',
      'pendapatan_lain_bln', 'r31b', 'r31_b',
      'r23b', 'r23_b', 'pendapatan_lainnya_ub', 'pendapatan_lain_ub'
    ],
    'b4_r27b': [
      'b4_r27b', 'r27b', 'r27_b',
      'pendapatan_lain_bln', 'r31b', 'r31_b',
      'r23b', 'r23_b', 'pendapatan_lainnya_ub', 'pendapatan_lain_ub'
    ],

    // Biaya Pembelian Barang Dagangan (R26c / 30b / 22c)
    'r26c': [
      'r26c', 'b4_r26c', 'r26_c',
      'biaya_produksi_bln', 'biaya_operasional_bln', 'r30b', 'r30_b',
      'r22c', 'r22_c', 'r22b', 'r22d', 'biaya_operasional_ub'
    ],
    'b4_r26c': [
      'b4_r26c', 'r26c', 'r26_c',
      'biaya_produksi_bln', 'biaya_operasional_bln', 'r30b', 'r30_b',
      'r22c', 'r22_c', 'r22b', 'r22d', 'biaya_operasional_ub'
    ],

    // Biaya Bahan Baku / Produksi (R26b / 30b / 22b)
    'r26b': [
      'r26b', 'b4_r26b', 'r26_b',
      'biaya_produksi_bln', 'biaya_operasional_bln', 'r30b', 'r30_b',
      'r22b', 'r22_b', 'r22c', 'r22d', 'biaya_operasional_ub'
    ],
    'b4_r26b': [
      'b4_r26b', 'r26b', 'r26_b',
      'biaya_produksi_bln', 'biaya_operasional_bln', 'r30b', 'r30_b',
      'r22b', 'r22_b', 'r22c', 'r22d', 'biaya_operasional_ub'
    ],

    // Biaya Operasional Lainnya (R26d / 30b / 22d)
    'r26d': [
      'r26d', 'b4_r26d', 'r26_d',
      'biaya_produksi_bln', 'biaya_operasional_bln', 'r30b', 'r30_b',
      'r22d', 'r22_d', 'r22b', 'r22c', 'biaya_operasional_ub'
    ],
    'b4_r26d': [
      'b4_r26d', 'r26d', 'r26_d',
      'biaya_produksi_bln', 'biaya_operasional_bln', 'r30b', 'r30_b',
      'r22d', 'r22_d', 'r22b', 'r22c', 'biaya_operasional_ub'
    ]
  };

  /* ---------------- kolom tanpa #angka -> dataKey lengkap di dokumen ---------------- */
  const normTeks = (t) => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  function resolveKey(S, doc, k, namaUsaha) {
    if (/#\d+$/.test(k)) return k;                              // sudah lengkap (mis. r27a#2001)
    const ada = doc.answers.map((a) => a.dataKey);
    if (ada.includes(k)) return k;                              // variabel di luar roster

    // 1. Coba pencocokan langsung nama variabel k
    let calon = ada.filter((d) => baseKey(d).toLowerCase() === k.toLowerCase());
    let targetKey = k;

    // 2. Jika tidak ditemukan di dokumen, periksa apakah ada daftar Smart Alias (UB / Usaha Buka 2026)
    const lowerK = k.toLowerCase();
    if (!calon.length && SMART_NTB_ALIASES[lowerK]) {
      const aliasList = SMART_NTB_ALIASES[lowerK];
      for (const alias of aliasList) {
        if (ada.includes(alias)) {
          console.log(`[TUNTAS API] Smart Alias aktif: ${k} → ${alias}`);
          return alias;
        }
        const aliasCalon = ada.filter((d) => baseKey(d).toLowerCase() === alias.toLowerCase());
        if (aliasCalon.length > 0) {
          console.log(`[TUNTAS API] Smart Alias aktif (dengan roster): ${k} → ${alias} (${aliasCalon.length} unit usaha)`);
          calon = aliasCalon;
          targetKey = alias;
          break;
        }
      }
    }

    if (calon.length === 1) return calon[0];
    if (calon.length > 1) {
      // beberapa usaha/baris: pilih yang akhirannya sama dengan baris bernama nama_usaha
      const n = normTeks(namaUsaha);
      if (n) {
        const suf = calon.map((c) => (c.match(/#\d+$/) || [''])[0]).filter(Boolean);
        for (const cocok of [(v) => v === n, (v) => v && (v.includes(n) || n.includes(v))]) {
          const hit = new Set(doc.answers.filter((a) => typeof a.answer === 'string' && cocok(normTeks(a.answer)))
            .map((a) => (a.dataKey.match(/#\d+$/) || [''])[0]).filter((x) => suf.includes(x)));
          if (hit.size === 1) return targetKey + [...hit][0];
        }
      }
      return calon[0]; // fallback ke baris usaha pertama bila nama usaha tidak persis sama
    }

    // 3. Cek apakah ada di Schema FormGear
    if (S.has(k)) return k;
    if (SMART_NTB_ALIASES[lowerK]) {
      for (const alias of SMART_NTB_ALIASES[lowerK]) {
        if (S.has(alias)) {
          console.log(`[TUNTAS API] Smart Alias dari Schema: ${k} → ${alias}`);
          return alias;
        }
      }
    }

    throw new Error(`${k}: variabel tidak ditemukan di form maupun di dokumen — periksa ejaan dataKey`);
  }

  // Jenis isian yang bisa dipilih di "Pilih Variabel"
  const BISA_DIUBAH = new Set([16, 17, 20, 21, 25, 26, 27, 28, 30, 33, 35]);
  async function listVars(assignmentId) {
    const asg = await getAssignment(assignmentId);
    const sch = await loadSchema(asg);
    const doc = JSON.parse(asg.data);
    const ada = doc.answers.map((a) => a.dataKey);
    const bersih = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const out = [];
    for (const f of sch.map.values()) {
      if (!BISA_DIUBAH.has(f.type) || isKbliKey(f.dataKey)) continue;
      if (OPTION_TYPES.has(f.type) && !f.options.length) continue;     // pilihan dari tabel: tidak didukung
      out.push({ dataKey: f.dataKey, label: bersih(f.label).slice(0, 120), bagian: bersih(f.section).slice(0, 60), jenis: f.kind,
        angka: NUM_TYPES.has(f.type), pilihan: f.options.map((o) => `${o.value}=${bersih(o.label)}`),
        diDokumen: ada.filter((d) => baseKey(d) === f.dataKey).length });
    }
    return { template: sch.name || '', versi: sch.version || '', code: asg.code_identity, vars: out };
  }

  /* ---------------- nilai sel Excel -> nilai jawaban ---------------- */
  function parseCell(v) {
    if (v === null || v === undefined) return undefined;
    const s = String(v).trim();
    if (s === '') return undefined;                       // kosong = tidak diubah
    if (/^#(kosong|hapus|null)$/i.test(s)) return null;   // kosongkan jawaban
    if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
      try { return raw(JSON.parse(s)); } catch { throw new Error(`JSON tidak valid: ${s.slice(0, 40)}`); }
    }
    return s;
  }

  /* ---------------- inti: tulis dokumen ---------------- */
  async function writeDoc(asg, doc, commentJson, { dryRun, id }) {
    const sp = asg.survey_period_id;
    const zip = await makeZip([
      { name: 'data.json', bytes: enc.encode(JSON.stringify(doc)) },
      { name: 'comment.json', bytes: enc.encode(commentJson) },
      { name: 'media.json', bytes: enc.encode('{}') }
    ]);
    if (dryRun) return { zipBytes: zip.length };
    const filename = `${id}_${Date.now()}.zip`;
    const md5 = md5hex(zip);
    const pr = await adaptiveFetch(`${API}/assignment-submit/api/assignment/s3/edit/presign-url?surveyPeriodId=${sp}`, {
      method: 'POST', credentials: 'include', headers: jh(), body: JSON.stringify({ assignmentId: id, fileNames: [filename] }) });
    if (!pr.ok) throw new Error(`presign HTTP ${pr.status}: ${(await pr.text()).slice(0, 150)}`);
    const pj = await pr.json();
    const urls = []; (function w(v) { if (typeof v === 'string' && /^https?:/.test(v)) urls.push(v);
      else if (Array.isArray(v)) v.forEach(w); else if (v && typeof v === 'object') Object.values(v).forEach(w); })(pj);
    if (!urls.length) throw new Error('URL upload FASIH tidak ditemukan');
    const up = await fetch(urls[0], { method: 'PUT', credentials: 'omit',
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"` },
      body: new Blob([zip], { type: 'application/zip' }) });
    if (!up.ok) throw new Error(`upload HTTP ${up.status}`);
    const body = { filename, start: '0', end: String(zip.length - 1), length: String(zip.length), md5,
      surveyPeriodeId: sp, assignmentId: id, createStatus: 'false', draftStatus: 'false',
      regionId: asg.region && asg.region._id, sourceFrom: 'SCM-EDIT' };
    for (let i = 1; i <= 10; i++) { const v = asg['data' + i]; body['data' + i] = v == null ? '' : String(v); }
    const cm = await adaptiveFetch(`${API}/assignment-submit/api/assignment/s3/edit?surveyPeriodId=${sp}`, {
      method: 'POST', credentials: 'include', headers: jh(), body: JSON.stringify(body) });
    const cmTxt = await cm.text();
    if (!cm.ok) throw new Error(`simpan HTTP ${cm.status}: ${cmTxt.slice(0, 200)}`);
    const after = await getAssignment(id);
    return { zipBytes: zip.length, versionAfter: after.submit_version_code, statusAfter: after.assignment_status_alias };
  }

  let myInfoCache = null;
  async function myUsername(sp) {
    if (!myInfoCache) myInfoCache = adaptiveFetch(`${API}/survey/api/v1/users/myinfo?surveyPeriodId=${sp}`, { credentials: 'include' })
      .then((r) => r.json()).then((j) => (j.data || j).username).catch((e) => { myInfoCache = null; throw e; });
    return myInfoCache;
  }

  /**
   * Terapkan satu baris Excel.
   * row = { assignmentId, values: { dataKey: sel }, remarks: { dataKey: teks } }
   */
  async function applyRow(row, { dryRun = true, autoNote = '#1', onBackup = null } = {}) {
    const asg = await getAssignment(row.assignmentId);
    const S = (await loadSchema(asg)).map;
    const doc = JSON.parse(asg.data);
    const snapshot = new Map(doc.answers.map((a) => [a.dataKey, JSON.stringify(a.answer)]));

    // 1. Nilai variabel
    const values = {};
    for (const [k, v] of Object.entries(row.values || {})) {
      const pv = parseCell(v); if (pv === undefined) continue;
      const kk = k.trim();
      if (isKbliKey(kk)) throw new Error(`${kk}: variabel KBLI tidak diubah di menu API — gunakan menu #1 · Ganti KBLI`);
      values[resolveKey(S, doc, kk, row.namaUsaha)] = pv;
    }
    // 1b. Variabel KBLI tidak boleh diubah di menu ini — pakai menu #1 · Ganti KBLI
    for (const k of Object.keys(values)) {
      if (isKbliKey(k)) throw new Error(`${k}: variabel KBLI tidak diubah di menu API — gunakan menu #1 · Ganti KBLI`);
    }
    for (const [k, v] of Object.entries(values)) setAnswer(S, doc, k, v);

    const changes = [];
    for (const a of doc.answers) {
      const after = JSON.stringify(a.answer);
      if (!snapshot.has(a.dataKey)) changes.push({ dataKey: a.dataKey, dari: '(baru)', ke: flatten(a.answer) });
      else if (snapshot.get(a.dataKey) !== after) {
        let dari; try { dari = flatten(JSON.parse(snapshot.get(a.dataKey))); } catch { dari = snapshot.get(a.dataKey); }
        changes.push({ dataKey: a.dataKey, dari, ke: flatten(a.answer) });
      }
    }

    // 2. Catatan (comment.json) — tidak ditulis dua kali bila teks sama sudah ada
    const c = JSON.parse(asg.comment || '{"dataKey":"","notes":[]}');
    c.notes = c.notes || [];
    const remarks = Object.entries(row.remarks || {}).filter(([, t]) => String(t ?? '').trim() !== '');
    // Hasil akhir menu ini: setiap variabel yang berubah diberi catatan kode #1
    const kode = String(autoNote ?? '').trim();
    if (kode) {
      for (const ch of changes.slice()) {
        if (!remarks.some(([dk, t]) => dk === ch.dataKey && String(t).trim() === kode)) remarks.push([ch.dataKey, kode]);
      }
    }
    if (remarks.length) {
      const sender = await myUsername(asg.survey_period_id);
      for (const [dk, t] of remarks) {
        const text = String(t).trim();
        let note = c.notes.find((n) => n.dataKey === dk);
        if (!note) { note = { dataKey: dk, comments: [] }; c.notes.push(note); }
        note.comments = note.comments || [];
        if (note.comments.some((x) => String(x.comment).trim() === text)) continue;
        note.comments.push({ datetime: new Date().toISOString(), sender, comment: text });
        changes.push({ dataKey: `catatan:${dk}`, dari: '', ke: text });
      }
    }

    const plan = { assignmentId: row.assignmentId, code: asg.code_identity, status: asg.assignment_status_alias,
      version: asg.submit_version_code, nChanges: changes.length, changes };
    if (!changes.length) return { ...plan, ok: true, dryRun, noChange: true };
    if (changes.length) doc.updatedAt = new Date().toISOString();

    const backup = dryRun ? null : { assignmentId: row.assignmentId, code: asg.code_identity, version: asg.submit_version_code,
      data: asg.data, comment: asg.comment, savedAt: new Date().toISOString() };
    if (backup && onBackup) await onBackup(backup);   // backup aman di background walau halaman tertutup saat menyimpan
    const res = await writeDoc(asg, doc, JSON.stringify(c), { dryRun, id: row.assignmentId });
    return { ...plan, ...res, ok: true, dryRun, backup };
  }

  /** Kembalikan dokumen ke isi backup (data + catatan). */
  async function restore(backup, { dryRun = true } = {}) {
    const asg = await getAssignment(backup.assignmentId);
    const doc = JSON.parse(backup.data);
    doc.updatedAt = new Date().toISOString();
    const res = await writeDoc(asg, doc, backup.comment || '{"dataKey":"","notes":[]}', { dryRun, id: backup.assignmentId });
    return { ok: true, dryRun, assignmentId: backup.assignmentId, versionBefore: asg.submit_version_code, ...res };
  }

  /** Cari dataKey dari label (untuk membantu menyusun Excel). */
  async function findKeys(assignmentId, q) {
    const asg = await getAssignment(assignmentId);
    const S = (await loadSchema(asg)).map;
    const doc = JSON.parse(asg.data);
    const re = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const isi = new Map(doc.answers.map((a) => [a.dataKey, a.answer]));
    const LEWATI = new Set([1, 2, 3, 4, 6]);   // section/group/catatan tampilan/variabel tersembunyi: bukan isian
    const bersih = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const out = [];
    for (const f of S.values()) {
      if (LEWATI.has(f.type)) continue;
      const label = bersih(f.label);
      if (!re.test(f.dataKey) && !re.test(label)) continue;
      const kolom = [...isi.keys()].filter((k) => baseKey(k) === f.dataKey)
        .map((k) => ({ kolom: k, sekarang: flatten(isi.get(k)) }));
      if (!kolom.length) kolom.push({ kolom: f.dataKey, sekarang: '(belum ada di dokumen ini)' });
      out.push({ dataKey: f.dataKey, label: label.slice(0, 80), jenis: f.kind, kbli: isKbliKey(f.dataKey),
        kolom: kolom.slice(0, 8), pilihan: f.options.slice(0, 15).map((o) => `${o.value}=${bersih(o.label)}`).join(' | '),
        angka: NUM_TYPES.has(f.type) });
    }
    return out.slice(0, 60);
  }

  self.TUNTAS_API = { getAssignment, applyRow, restore, findKeys, listVars, parseCell, _internal: { coerce, setAnswer, flatten, raw, makeZip, md5hex } };
})();

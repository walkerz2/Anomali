# CONTEXT.MD — TUNTAS SE2026 (Tracking dan Tindak Lanjut Anomali Sensus)

> **Dokumen Konteks Proyek & Panduan Teknis Komprehensif**  
> Terakhir diperbarui: 26 Oktober 2026, 13:25 WITA (Asia/Makassar / UTC+8)  
> Zona Waktu Sistem: Waktu Indonesia Tengah (WITA / Asia/Makassar / UTC+8)

---

## 1. 📌 Ringkasan Proyek (Project Overview)

### 1.1 Identitas Proyek
- **Nama Aplikasi**: TUNTAS SE2026 (Tracking dan Tindak Lanjut Anomali Sensus)
- **Tipe Proyek**: Google Chrome Extension (Manifest V3)
- **Versi**: `1.0.0`
- **Lisensi**: Proprietary (dengan komponen pihak ketiga MIT License, lihat `THIRD_PARTY_LICENSES.txt`)
- **Target Platform**: Browser Google Chrome / Chromium-based (Edge, Brave) pada sistem operasi Windows/Linux/macOS

### 1.2 Konteks Bisnis & Masalah yang Diselesaikan
Dalam pelaksanaan **Sensus Ekonomi 2026 (SE2026)** oleh **Badan Pusat Statistik (BPS)**, ribuan dokumen survei yang dientri melalui platform web **FASIH-SM** (`https://fasih-sm.bps.go.id`) dan dimonitor melalui **PANTAU BPS** mengalami anomali atau flagging (misalnya anomali Rasio Nilai Tambah Bruto / NTB Flag 3, inkonsistensi KBLI, atau peringatan batas wajar).

Penyelesaian anomali secara manual membutuhkan waktu yang sangat masif:
1. Membuka assignment satu per satu, mengklik tombol edit, mencari rincian unit usaha.
2. Memberikan catatan konfirmasi lapangan (misalnya `#DC_00`), mengaktifkan toggle konfirmasi galat, menyimpan catatan.
3. Mengganti kode KBLI (catatan `#DC_01`) baik via daftar rekomendasi maupun Master KBLI.
4. Menghitung manual selisih pendapatan vs pengeluaran untuk menentukan rasio NTB wajar vs anomali.
5. Melakukan pengiriman kuesioner (*Submit*) dan proses persetujuan pengawas (*Approve* / *Revoke* jika sudah terlanjur approve).

**TUNTAS SE2026** diciptakan sebagai asisten otomasi cerdas end-to-end yang mengintegrasikan pengolahan data lokal, validasi bisnis statistik resmi BPS, manipulasi DOM kuesioner FASIH-SM, manipulasi variabel langsung melalui API FASIH internal, hingga kendali jarak jauh terdistribusi melalui WhatsApp & Webhook n8n.

---

## 2. 🏗️ Arsitektur Sistem & Tumpukan Teknologi (Tech Stack)

### 2.1 Arsitektur Ekstensi (Chrome Extension MV3)
Aplikasi dibangun di atas standar modern **Chrome Extension Manifest V3**, tanpa dependensi framework runtime eksternal (100% Vanilla JavaScript, CSS3, dan HTML5), sehingga ringan, cepat, dan sepenuhnya independen dari server backend khusus.

```mermaid
flowchart TB
    subgraph UI ["Popup UI (popup.js / popup.html)"]
        A[File Upload .xlsx/.xls] --> B[Mode Selector: #DC_00 / #DC_01 / API / NTB]
        B --> C[Queue Management & Progress Monitor]
        B --> D[Engine NTB Validator Client-Side]
    end

    subgraph SW ["Background Service Worker (background.js)"]
        E[Queue Runner & State Machine]
        F[Adaptive Throttling Engine]
        G[Keep-Alive & Session Guard (chrome.alarms 4m)]
        H[Circuit Breaker]
        I[Auto SSO Login Handler (Running-Guarded)]
        J[WhatsApp Two-Way Sync & Dynamic n8n Webhook]
    end

    subgraph CS ["Content Scripts (Injected into fasih-sm.bps.go.id)"]
        K[content.js - DOM Automation & UI Interaction]
        L[fasih_api.js - FormGear Direct REST API Client]
    end

    subgraph EXT ["External Services"]
        M[(FASIH-SM Server BPS)]
        N[(BPS SSO External)]
        O[(n8n Automation Engine / WhatsApp)]
    end

    UI <-->|chrome.runtime messaging & storage.local| SW
    SW <-->|chrome.tabs & scripting| CS
    CS <-->|DOM Manipulation & XHR/fetch| M
    SW <-->|Heartbeat & Tab Monitor| M
    SW <-->|Auto Fill & Submit| N
    SW <-->|HTTP POST Webhooks| O
```

### 2.2 Komponen Teknologi Utama
| Komponen | Pustaka / Teknologi | Peran & Tanggung Jawab |
|---|---|---|
| **Core Extension** | Manifest V3, Web Extensions API | Izin: `storage`, `unlimitedStorage`, `tabs`, `activeTab`, `scripting`, `alarms` |
| **Excel Parser & Generator** | SheetJS (`lib/xlsx.full.min.js`) | Membaca & menulis file Excel (`.xlsx`, `.xls`) 100% lokal di browser tanpa koneksi internet |
| **NTB Engine** | `lib/ntb_validator.js` | Klasifikasi 22 sektor KBLI, formula rasio NTB riil, auto-imputasi median, ekspor 3-sheet |
| **DOM Automation** | `content/content.js` | Navigasi SPA kuesioner, penanganan kuesioner UB vs Non-UB, input catatan, toggle konfirmasi, submit & approve |
| **FASIH API Client** | `content/fasih_api.js` | Manipulasi FormGear internal, enkripsi/kompresi ZIP-CRC32-MD5, backup/restore JSON variabel |
| **Queue & Resiliensi** | `background/background.js` | Service worker MV3 keep-alive, antrian kerja, pemantauan latensi, jeda dinamis, circuit breaker |
| **Telemetri & Remote** | n8n Webhook & WhatsApp Bot | Notifikasi real-time ke grup WA, sinkronisasi status dua arah, remote control (`#STATUS`, `#JEDA`, `#LANJUT`, `#STOP`, `#TAMBAH`) |
| **QA & Verification** | `scripts/verify-all.js` | Pengujian otomatis validitas sintaks AST, integritas manifest, dan aksi pesan kritis |

---

## 3. 📂 Struktur Direktori & Penjelasan Modul

```
Anomali/
├── manifest.json            # Manifest V3: Permissions, Host Permissions, Content Scripts, Worker
├── README.md                # Panduan operasional bagi pengguna dan dokumentasi fitur
├── context.md               # [File Ini] Dokumentasi konteks arsitektur & referensi teknis pengembang
├── AGENTS.md                # Aturan pengembangan agen: Git safe workflow, Zero Regression, Doc-Sync
├── THIRD_PARTY_LICENSES.txt # Lisensi dependensi pihak ketiga (SheetJS, Fasih Batch Extension MIT)
├── logo.jpeg                # Logo visual identitas ekstensi
├── icons/                   # Aset icon ekstensi (16, 32, 48, 128 px)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── lib/                     # Pustaka logika pendukung & utility
│   ├── xlsx.full.min.js     # SheetJS library (minified) untuk operasi spreadsheet
│   └── ntb_validator.js     # Engine komputasi & validasi NTB Flag 3 (Client-side)
├── popup/                   # Antarmuka pop-up kontrol ekstensi
│   ├── popup.html           # Struktur UI antarmuka (Tab menu, upload, tabel antrian, monitor)
│   ├── popup.css            # Styling visual modern, responsif, dark/light accents, badges
│   └── popup.js             # Controller UI: handling event, parsing file, sinkronisasi storage
├── background/              # Logika service worker latar belakang
│   └── background.js        # Controller utama: antrian, tab lifecycles, keep-alive, throttle, webhook
├── content/                 # Script injeksi ke halaman FASIH BPS
│   ├── content.js           # Robot DOM: alur klik form kuesioner, catatan, toggle, submit, approve
│   └── fasih_api.js         # API Engine: modifikasi data kuesioner langsung via endpoint FormGear
├── scripts/                 # Skrip verifikasi dan automasi pengujian
│   └── verify-all.js        # Pengujian mandiri AST syntax, manifest, dan message action integrity
├── .agents/skills/          # Modul skill kecerdasan agen proyek
│   ├── git-safe-workflow/   # Pedoman proteksi git tanpa push langsung ke main
│   ├── qa-regression-guard/ # Pedoman pengujian kualitas dan jaminan zero-regression
│   └── doc-sync/            # Pedoman sinkronisasi disiplin README.md & context.md
└── template/                # Format template Excel standar siap pakai
    ├── Template_TUNTAS_DC0.xlsx          # Template Mode #DC_00 (link_fasih_sm)
    ├── Template_TUNTAS_DC1_KBLI.xlsx     # Template Mode #DC_01 (link, kbli_awal, kbli_tujuan)
    ├── Template_TUNTAS_API_Variabel.xlsx # Template Mode API (link, nama_usaha, kode_catatan, vars)
    └── Template_TUNTAS_NTB_Pantau.xlsx   # Format kolom ekspor PANTAU BPS
```

---

## 4. ⚙️ Empat Mode Operasi Utama

Ekstensi menyediakan 4 mode kerja terintegrasi yang dapat dipilih dari tab atas pada popup:

### 4.1 Mode 1: `#DC_00` · Tanpa Perubahan (Konfirmasi Wajar)
- **Tujuan**: Memberikan catatan konfirmasi `#DC_00` pada unit usaha yang anomali/flagging-nya sudah sesuai kondisi lapangan yang wajar.
- **Input File**: File Excel berisi kolom wajib `link_fasih_sm` (atau hasil filter status `#0` dari menu NTB).
- **Logika Penargetan Pertanyaan Catatan**:
  1. **Kuesioner `SE2026 - UB` (Usaha Buka / Usaha Baru)**:
     - Membuka sidebar **BLOK I (IDENTITAS USAHA/PERUSAHAAN)**.
     - Pertanyaan target: **`23. Rincian Nilai produksi Tahun 2025 - a. Nilai produksi barang dan jasa*`** (atau variabel `r23a`).
  2. **Kuesioner Non-UB (seperti `SE2026 - L`)**:
     - Membuka sidebar **BLOK II (KETERANGAN USAHA/PERUSAHAAN)**.
     - Membuka dropdown unit usaha yang sesuai.
     - Memeriksa pertanyaan **`25. Tahun berapa usaha/perusahaan ini mulai beroperasi secara komersial?`**:
       - Jika tahun $\le 2025$: Catatan diberikan pada pertanyaan **`27. a. Nilai produksi/pendapatan/penjualan barang dan jasa`** (atau opsi alternatif `13.g` Kode KBLI jika dipilih di pengaturan).
       - Jika tahun $> 2025$: Catatan diberikan pada pertanyaan **`31. a. Nilai pendapatan barang dan jasa*`**.
- **Aksi Lanjutan**: Mengaktifkan toggle switch konfirmasi galat pada modal catatan $\rightarrow$ Simpan catatan $\rightarrow$ Buka menu CATATAN di sidebar $\rightarrow$ Aktifkan toggle "Tampilkan Anomali Usaha dan Keluarga" $\rightarrow$ Kirim survei $\rightarrow$ Auto Approve.

### 4.2 Mode 2: `#DC_01` · Ganti KBLI
- **Tujuan**: Memperbaiki kode KBLI unit usaha yang keliru secara otomatis.
- **Input File**: File Excel berisi kolom `link_fasih_sm`, `kbli_awal`, dan `kbli_tujuan` (opsional `nama_usaha`).
- **Alur Kerja**:
  1. Membuka kuesioner dan menuju BLOK II unit usaha target.
  2. Menemukan pertanyaan `13.g` (Kode KBLI) yang bernilai `kbli_awal`.
  3. Mencari `kbli_tujuan` pada radio button rekomendasi KBLI.
  4. **Fallback Master KBLI**: Jika tidak ada di rekomendasi radio, bot mengklik tombol reset/pilih dari Master KBLI (`div#kbli#...`), mengetik kode KBLI tujuan, memilih dari dropdown, dan memverifikasi keterpilihannya.
  5. Mengisi modal catatan pada `13.g` dengan teks `#DC_01`.
  6. Mengaktifkan toggle konfirmasi anomali, submit formulir, dan melakukan auto approve.

### 4.3 Mode 3: API · Ubah Variabel Massal
- **Tujuan**: Memodifikasi nilai rincian variabel kuesioner secara bebas langsung ke backend FASIH FormGear via REST API internal tanpa perlu mengklik field satu per satu di browser.
- **Fitur Utama**:
  1. **Visual Variable Picker**: Memilih variabel dari kuesioner aktif dan menghasilkan template Excel kustom otomatis.
  2. **Auto Backup JSON**: Menyimpan salinan variabel asli sebelum diubah untuk keamanan data sensus.
  3. **Visual Form Verification & Submit**: Membuka kembali formulir di browser untuk memvalidasi tidak ada status galat (Clean) sebelum submit dan approve.
  4. **Dry Run Mode**: Simulasi perubahan nilai tanpa menyimpan ke server.

### 4.4 Mode 4: NTB · Validasi & Imputasi (Flag 3)
- **Tujuan**: Menganalisis anomali Rasio Nilai Tambah Bruto (NTB Flag 3) dari file mentah PANTAU BPS 100% di browser (*client-side*).
- **Proses Inti**:
  1. **Kalkulasi Rasio Riil**:
     $$\text{Total Pendapatan} = \text{Pendapatan Barang \& Jasa} + \text{Pendapatan Lainnya}$$
     $$\text{NTB Riil} = \text{Total Pendapatan} - \text{Total Pengeluaran}$$
     $$\text{Rasio NTB (\%)} = \left(\frac{\text{NTB Riil}}{\text{Total Pendapatan}}\right) \times 100$$
  2. **Klasifikasi Batas Wajar (Sektor A–V)**:
     - **Status #0 (Wajar)**: Rasio riil berada dalam rentang toleransi sektor BPS $\rightarrow$ dieksekusi via catatan konfirmasi #0 pada 27.a.
     - **Status #1 (Anomali)**: Rasio riil di luar batas wajar $\rightarrow$ dihitung nilai imputasi target median dan dialirkan ke Mode API.
  3. **Ekspor Excel 3-Sheet**:
     - *Sheet 1*: Master Validasi NTB lengkap.
     - *Sheet 2*: Panduan verifikator lapangan.
     - *Sheet 3*: Template API siap pakai (mendukung pengeditan mandiri & multi-variabel kustom).

---

## 5. ⚡ Mesin Performa, Throttling & Penyesuaian Beban

### 5.1 Adaptive Throttling Engine (Dynamic Rate Limiter)
Server FASIH-SM BPS sering kali mengalami lonjakan beban respon (*traffic spikes*). TUNTAS mengimplementasikan mesin kendali kecepatan adaptif di `background.js`:
- Mengukur latensi aktual setiap pemanggilan API, pembukaan tab, dan render formulir kuesioner.
- Mempertahankan riwayat buffer 8 sampel latensi terakhir.
- **Tingkat Kecepatan**:
  - 🟢 **NORMAL (Latensi < 1.5s)**: Multiplier `1.0x` (jeda standar 1.5s), jeda antrian `+0s`.
  - 🟡 **MILD (Latensi 1.8s – 4.0s)**: Multiplier `1.5x` (jeda ~2.3s), jeda antrian `+1.5s`.
  - 🟠 **MODERATE (Latensi 4.0s – 8.0s)**: Multiplier `2.0x` (jeda ~3.0s), jeda antrian `+3.5s`.
  - 🔴 **HEAVY (Latensi > 8.0s / HTTP 429/502/503/504)**: Multiplier `3.0x` (jeda ~4.5s), jeda antrian `+7.0s`.
- **Pemulihan Otomatis (Cool-down)**: Kecepatan pulih bertahap ke tingkat normal setelah 2 kali berturut-turut respons berlatensi rendah (< 1.5s).

---

## 6. 🛡️ Resiliensi, Keamanan & Fitur Otomasi Khusus

### 6.1 Circuit Breaker Otomatis
- Jika terjadi kegagalan berturut-turut sebanyak **3 kali** akibat server FASIH down (500/502/503/504), network disconnect, atau timeout > 35 detik, sistem otomatis melakukan **PAUSE**.
- Mencegah akun pengguna diblokir atau ribuan antrian gagal serentak saat server BPS sedang tidak stabil.
- Mengirimkan peringatan darurat ke Webhook WhatsApp / n8n.

### 6.2 Session Guard & Keep-Alive FASIH (4 Menit)
- Menggunakan alarm berkala Chrome `tuntasKeepAlive` di `background.js` yang berjalan setiap **4 menit**.
- Menyapa server FASIH via endpoint resmi `/app/api/survey/api/v1/users/myinfo` melalui tab FASIH yang terbuka.
- Mencegah tab ditidurkan (*tab freezing/discarding*) oleh Memory Saver Chrome via properti `chrome.tabs.update(tabId, { autoDiscardable: false })`.
- Jika sesi terdeteksi habis, ekstensi memperbarui status di popup dan menampilkan indikator visual tanda seru merah pada ikon ekstensi.

### 6.3 Auto Login SSO Eksternal BPS (Guarded State)
- **Running-Only Guard**: Fitur auto-login **HANYA AKTIF** ketika runner otomasi berstatus `RUNNING` (tombol *Mulai Otomasi* atau *Test di Tab Aktif* ditekan). Saat pengguna membuka browser dalam kondisi idle atau berselancar biasa, kredensial dan tombol tidak disentuh secara otomatis.
- **Auto-Click Tombol SSO Eksternal**:
  - Mendeteksi tombol, link, atau card "Lanjutkan dengan SSO Eksternal" menggunakan variasi kata kunci luas (`eksternal`, `external`, `sobat`, `mitra`, `non-organik`).
  - Mendukung penanganan radio card ("SSO Pegawai" vs "SSO Eksternal") dan tombol aksi submit.
  - Menggunakan simulasi penekanan multi-event (`pointerdown`, `pointerup`, `mousedown`, `mouseup`, `click`) dan fallback navigasi `window.location.assign(href)`.
  - Polling rendering SPA Nuxt hingga 8 detik (interval 500ms).
- **Auto Fill Kredensial**: Mengisi kolom email & kata sandi dengan simulasi pengetikan input, lalu menekan tombol masuk secara otomatis.

### 6.4 Auto Revoke & Auto Approve
- Jika assignment berstatus `Approved` saat hendak diperbaiki (sehingga tombol Edit terkunci), bot otomatis mencari dan menekan tombol **Revoke** di pojok kanan bawah toolbar, mengonfirmasi modal revoke, memuat ulang form, melakukan perbaikan, submit ulang, dan melakukan **Approve** kembali.
- **Mode Ubah Variabel (API)**: Memeriksa status assignment secara proaktif (`asg.assignment_status_alias`). Jika assignment sudah berstatus `Approved`, bot membuka tab review/edit untuk mengeksekusi Auto Revoke terlebih dahulu sebelum menulis perubahan via REST API FASIH, lalu memverifikasi form, melakukan submit visual, dan auto-approve kembali.
- **Fallback Tanpa Tombol Revoke (Belum Approved)**: Jika tombol Revoke tidak ditemukan di toolbar (kuesioner ternyata belum di-Approve, misalnya berstatus draf atau menunggu approval), bot tidak menandai gagal melainkan secara cerdas langsung melanjutkan penyimpanan perubahan variabel via API dan pengiriman formulir.

### 6.5 Skalabilitas Dataset Masif (6.000–7.000+ Baris) & Virtual Windowing
- **Pembersihan & Sanitasi URL**: Seluruh link dan ID kuesioner dibersihkan dari whitespace, tab, dan newline (`\r\n\t`) yang sering muncul dari copy-paste Excel. Jika link kosong namun `assignment_id` valid, ekstensi otomatis menyusun link edit standar FASIH.
- **Deteksi Dini URL/Kuesioner Rusak**: Jika FASIH menampilkan notifikasi *"URL tidak dapat dibuka"*, *"Kuesioner tidak ditemukan"*, atau error 404, bot langsung mendeteksi dalam 1 detik dan menandai baris sebagai `SKIPPED: URL_ERROR`, mencegah tab menggantung selama 70 detik.
- **Pruning Memori Snapshot Backup**: `apiBackups` di `chrome.storage.local` dipangkas otomatis mempertahankan 50 snapshot terbaru, mencegah ledakan ukuran string JSON (>512 MB) yang dapat merusak V8 worker Chrome.
- **Virtual Windowing UI Popup**: Pada antrian >100 baris, tabel popup hanya merender jendela 100 baris di sekitar item aktif, sehingga popup tetap responsif (<10ms render) bahkan saat mengolah 7.000+ baris data.

### 6.6 Safe Tab Lifecycle & Bypass Beforeunload
- Di `content.js`, event listener `beforeunload` bawaan FASIH diblokir secara agresif (`e.stopImmediatePropagation()`). Hal ini mencegah dialog browser *"Leave site? Changes you made may not be saved"* yang kerap membekukan otomasi tab.
- Pengecekan jumlah tab: Jika tab FASIH yang diproses merupakan satu-satunya tab pada jendela browser, bot membuat tab baru kosong terlebih dahulu sebelum menutup tab lama, guna mencegah jendela Chrome tertutup tiba-tiba.

---

## 7. 📡 Integrasi Eksternal & Remote Control WhatsApp

Ekstensi dapat dihubungkan ke workflow automation n8n (`https://n8n7309.online` atau instance n8n kustom) untuk notifikasi dan kendali dua arah dari WhatsApp.

### 7.1 Webhook Notifikasi Dinamis
- Endpoint URL dapat disesuaikan langsung dari opsi pengaturan pada popup (`runnerOptions.webhookUrl`).
- Mengirimkan notifikasi selektif:
  - Saat antrian **Selesai Total (ALL COMPLETED)** (rekapitulasi sukses, gagal, dilewati).
  - Saat bot **Dijeda (PAUSE)** atau **Dihentikan (STOP)**.
  - Saat terjadi error kritis / kendala fatal server (bukan error wajar seperti data sudah diperbaiki).

### 7.2 Two-Way WhatsApp Remote Control & Dynamic Cloud Queue
- Endpoint sinkronisasi status & perintah dua arah dinamis (`runnerOptions.syncWebhookUrl`).
- Background service worker melakukan sinkronisasi berkala (tiap 10-15 detik) untuk membaca instruksi remote:

| Perintah WhatsApp | Fungsi & Perilaku Bot |
|---|---|
| `#STATUS` | Menampilkan progres seluruh PC (jumlah sukses/gagal, item aktif, latensi server) |
| `#STATUS PC 1` | Memeriksa detail spesifik komputer target |
| `#JEDA` / `#JEDA PC 1` | Menjeda antrian otomasi seketika |
| `#LANJUT` / `#LANJUT PC 1` | Melanjutkan kembali antrian dari titik jeda terakhir |
| `#STOP` / `#STOP PC 1` | Menghentikan total proses antrian |
| `#TAMBAH [URL FASIH]` | **Dynamic Cloud Queue**: Menyisipkan link kuesioner baru ke antrian aktif secara live tanpa perlu sentuh laptop atau upload ulang file Excel |
| `#HELP` / `#QUERY` | Menampilkan panduan sintaks perintah bot di WhatsApp |

### 7.3 Standarisasi Waktu (WITA / UTC+8)
Seluruh stempel waktu log, telemetri, payload JSON, dan pesan WhatsApp diformat paten menggunakan zona waktu Indonesia Tengah (`Asia/Makassar` / WITA, UTC+8) dengan format:
`DD/MM/YYYY, HH:mm:ss WITA`.

---

## 8. 💾 Format Data & Skema Penyimpanan

### 8.1 Skema Data Item Antrian (`queue`)
Disimpan di `chrome.storage.local` dengan struktur objek:
```javascript
{
  index: 0,
  url: "https://fasih-sm.bps.go.id/app/assignment-detail/UUID",
  formattedUrl: "https://fasih-sm.bps.go.id/app/assignment/PERIODE_ID/UUID/edit",
  status: "PENDING", // 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'
  details: "",       // Log langkah terkini atau pesan error
  namaUsaha: "WARUNG MAKAN SEDAP",
  kbliAwal: "56101", // Khusus Mode DC1
  kbliTujuan: "56102",// Khusus Mode DC1
  apiData: {         // Khusus Mode API / NTB Imputasi
    r26c: 15000000,
    r27a: 25000000
  },
  catatanFasih: "#DC_00",
  rawRow: { ... }    // Seluruh kolom asli dari file Excel asal
}
```

### 8.2 Konfigurasi Utama di `chrome.storage.local`
- `runnerOptions`: Pengaturan eksekusi (mode, periodeId, stepDelay, ssoCredentials, webhookUrl, syncWebhookUrl, dsb.).
- `runnerState`: State eksekusi aktif (`status`, `currentIndex`, `activeTabId`, `consecutiveFailures`, dsb.).
- `savedQueue`: State antrian terakhir (memungkinkan resume jika browser tertutup atau crash).
- `apiBackups`: Riwayat cadangan JSON kuesioner sebelum diubah via API (per assignment ID).
- `tuntasKeepAliveState`: Status pemantauan sesi login FASIH-SM.

---

## 9. 🚀 Pedoman Rekayasa & Standar Kualitas (QA, Git, Docs)

Setiap agen AI dan pengembang yang bekerja pada repositori ini terikat pada standar ketat di [**`AGENTS.md`**](file:///d:/capek/Anomali/AGENTS.md):

### 9.1 Git Safe Workflow & Auto-Cleanup (No Direct Push to Main)
- **Dilarang keras** melakukan *commit* atau *push* langsung ke `main` secara otomatis.
- Selalu buat branch fitur/fix baru (`feat/*`, `fix/*`), uji secara mandiri, dan push hanya ke branch kerja tersebut.
- Merge ke `main` hanya boleh dieksekusi setelah mendapatkan persetujuan eksplisit dari pengguna.
- **Auto-Cleanup**: Begitu diperintahkan push ke `main`, branch kerja wajib langsung dihapus seketika baik secara lokal maupun remote (`git branch -d` dan `git push origin --delete`).
- Dipandu oleh skill: [`.agents/skills/git-safe-workflow/SKILL.md`](file:///d:/capek/Anomali/.agents/skills/git-safe-workflow/SKILL.md).

### 9.2 QA & Zero-Regression Guard
- Fitur baru tidak boleh mematahkan kestabilan fitur lama (*Primum Non Nocere*).
- Setiap fitur baru harus diisolasi dengan `try...catch` dan memiliki safe fallback.
- Verifikasi wajib dijalankan sebelum setiap commit:
  ```powershell
  node scripts/verify-all.js
  ```
- Dipandu oleh skill: [`.agents/skills/qa-regression-guard/SKILL.md`](file:///d:/capek/Anomali/.agents/skills/qa-regression-guard/SKILL.md).

### 9.3 Dokumentasi Sinkron & Disiplin (Doc-Sync Rule)
- Setiap kali menambahkan fitur baru atau memperbaiki bug, `README.md` (panduan pengguna) dan `context.md` (arsitektur sistem) **wajib diperbarui dalam commit yang sama**.
- Tidak boleh ada deviasi (*drift*) antara implementasi kode aktual dengan dokumen panduan.
- Dipandu oleh skill: [`.agents/skills/doc-sync/SKILL.md`](file:///d:/capek/Anomali/.agents/skills/doc-sync/SKILL.md).

---
*Dokumen ini dirancang sebagai referensi tunggal kebenaran (Single Source of Truth) arsitektur sistem TUNTAS SE2026.*

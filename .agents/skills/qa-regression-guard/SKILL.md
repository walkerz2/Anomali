---
name: qa-regression-guard
description: >-
  Pedoman pengujian kualitas (QA), pencegahan regresi (zero-regression), dan backward compatibility. Wajib dijalankan setiap kali menambahkan fitur baru atau merevisi kode guna memastikan seluruh fitur sebelumnya tetap berfungsi optimal tanpa merusak atau mengganggu arsitektur kodingan yang ada.
---

# QA & Feature Regression Guard (Anti-Regresi & Kompatibilitas Fitur)

Skill ini menetapkan standar rekayasa perangkat lunak dan protokol pengujian kualitas (*Quality Assurance*) untuk menjamin bahwa **setiap penambahan fitur baru atau perbaikan bug tidak merusak (zero regression) fitur-fitur yang sudah ada sebelumnya**.

---

## 1. 🛡️ Prinsip Utama (Zero Regression Core Principles)

> [!IMPORTANT]
> **Primum Non Nocere (Pertama, Jangan Merusak)**: Fitur baru tidak boleh mematahkan kestabilan, performa, atau alur kerja fitur yang sudah ada. Jika ada keraguan antara menambahkan fitur baru atau menjaga kestabilan fitur lama, prioritaskan kestabilan sistem yang sudah berjalan.

1. **Pengembangan Aditif & Non-Destruktif**:
   - Selalu tambahkan fungsi baru secara modular/ekstensi tanpa mengubah (*rewrite*) logika inti (*core runner loop*) yang sudah terbukti stabil.
2. **Isolasi Fitur Baru (*Fault Isolation*)**:
   - Fitur baru wajib dibungkus dalam blok `try...catch` terisolasi agar kegagalan runtime pada fitur baru tidak menghentikan keseluruhan siklus otomatisasi.
3. **Kompatibilitas Mundur (*Backward Compatibility*)**:
   - Format penyimpanan `chrome.storage.local` (seperti `runnerState`, `runnerOptions`, `fasihQueue`), skema webhook n8n, dan protokol pesan antarkomponen (`chrome.runtime.onMessage`) tidak boleh diubah secara sepihak tanpa mempertahankan penanganan untuk format lama.
4. **Safe Defaults & Feature Flags**:
   - Fitur baru yang membawa perubahan alur kerja wajib memiliki opsi kendali (on/off) dengan nilai default yang aman (*safe fallback*).

---

## 2. 📋 Checklist Pra-Pengembangan (Pre-Implementation Impact Analysis)

Sebelum menulis baris kode baru, agen wajib melakukan analisis dampak:

| Komponen Terdampak | Fitur Kritis yang Harus Diproteksi | Risiko Potensial |
| :--- | :--- | :--- |
| **`background/background.js`** | Queue runner, keep-alive alarm (4 menit), sync webhook n8n, listener perintah WhatsApp (`#STATUS`, `#JEDA`, `#LANJUT`, `#STOP`, `#TAMBAH`). | Queue macet, Service Worker mati mendadak, alarm tidak terdaftar, request n8n hanging. |
| **`content/content.js`** | Injeksi alur kuesioner FASIH, auto-SSO eksternal, auto-save, penanganan modal sesi habis. | Tombol SSO terklik saat tidak running, modal gagal ditutup, DOM selector usang. |
| **`content/fasih_api.js`** | Komunikasi API langsung ke backend FASIH, header cookie/bearer, fallback request. | Header otorisasi hilang, CORS failure, rate limit backend. |
| **`popup/popup.js` / HTML** | Rendering tabel antrian, tombol aksi (Start/Pause/Stop/Reset), form opsi, status badge. | State tidak sinkron dengan storage, UI freeze, input form ter-reset. |
| **`lib/ntb_validator.js`** | Validasi NTB Flag 3, mapping KBLI, rekomendasi nilai wajar R26b/c/d & R27a. | Perhitungan anomali salah, salah menentukan status #0 atau #1. |

---

## 3. 🧩 Pola Koding Aman (Defensive Coding Standards)

### A. Akses Properti Bertingkat (Optional Chaining & Nullish Coalescing)
Hindari error `Cannot read properties of undefined`:
```javascript
// ✅ BENAR: Aman terhadap data kosong atau format lama
const autoSso = opts?.autoSsoLogin ?? true;
const pcName = runnerState?.options?.pcName || 'PC 1';

// ❌ SALAH: Rawan crash jika opts atau runnerState undefined
const autoSso = opts.autoSsoLogin;
```

### B. Isolasi Integrasi Eksternal (n8n Webhook, DOM Queries, Fetch)
```javascript
// ✅ BENAR: Fitur baru terlindungi, tidak mematikan alur utama
try {
  await sendStatusToWebhook(statusPayload);
} catch (err) {
  console.warn('[QA-GUARD] Gagal sync ke webhook n8n (non-fatal):', err);
  // Alur otomatisasi utama tetap berlanjut
}
```

### C. Menjaga Tanda Tangan Fungsi (*Function Signatures*)
Jangan mengubah urutan parameter fungsi publik yang sudah digunakan di banyak tempat. Gunakan objek opsi:
```javascript
// ✅ BENAR: Menambahkan opsi baru tanpa mematahkan pemanggilan lama
async function handleSsoLogin(options = {}) {
  const email = options.ssoEmail || defaultEmail;
  // ...
}
```

---

## 4. 🔍 Protokol Verifikasi Pasca-Pengembangan (Step-by-Step QA Protocol)

Setiap kali kode diubah atau fitur ditambahkan, jalankan 4 tahap verifikasi berikut:

### Tahap 1: Validasi Sintaks AST Menyeluruh
Jalankan validasi sintaks Node.js untuk seluruh berkas JavaScript proyek:
```powershell
node scripts/verify-all.js
# atau secara manual:
node -c background/background.js content/content.js content/fasih_api.js popup/popup.js lib/ntb_validator.js
```
> [!CAUTION]
> Tidak boleh ada satu pun berkas JavaScript yang mengalami kesalahan sintaks (*SyntaxError*).

### Tahap 2: Audit Jejak Kode (*Git Diff Review*)
Periksa perubahan dengan cermat:
```powershell
git diff
```
Pastikan:
- Tidak ada blok kode lama yang terhapus secara tidak sengaja.
- Tidak ada variabel global yang tertimpa secara liar.
- Tidak ada komentar dokumentasi penting yang hilang.

### Tahap 3: Uji Regresi 6 Fitur Kritis (*Critical Path Matrix*)
Wajib memverifikasi bahwa 6 fitur pilar ini tidak terganggu:
1. **Runner Lifecycle**:
   - `START_WORKFLOW` memproses antrian dengan benar.
   - `PAUSE_WORKFLOW` dan `RESUME_WORKFLOW` menjaga posisi index antrian.
   - `STOP_WORKFLOW` menghentikan proses secara aman.
2. **Auto Login SSO Eksternal**:
   - Berjalan **HANYA** ketika bot sedang `RUNNING`.
   - Mengabaikan pengisian saat halaman dibuka dalam kondisi idle.
   - Tombol SSO Eksternal terklik dengan multi-event fallback dan polling render SPA.
3. **Session Keep-Alive (Sapa Server 4 Menit)**:
   - Alarm `tuntasKeepAlive` terdaftar di `chrome.alarms`.
   - Tab FASIH yang terbuka diproteksi dengan `autoDiscardable: false`.
4. **Sinkronisasi n8n & WhatsApp Remote Control**:
   - Laporan status bot berhasil dikirim ke webhook.
   - Perintah remote WhatsApp (`#STATUS`, `#JEDA`, `#LANJUT`, `#STOP`, `#TAMBAH`) tetap terurai dengan benar.
5. **Validasi & Imputasi NTB**:
   - Klasifikasi batas wajar KBLI tetap akurat.
   - Variabel kuesioner R26b, R26c, R26d, dan R27a diimputasi sesuai batas wajar.
6. **Popup & Indikator UI**:
   - Status badge menampilkan RUNNING/PAUSED/IDLE dengan warna yang sesuai.
   - Tabel antrian menampilkan status PENDING/PROCESSING/SUCCESS/FAILED.

---

## 5. 🚨 Rencana Tanggap Darurat (Emergency Rollback)

Jika setelah pengujian ditemukan regresi:
1. **Quarantine**: Matikan fitur baru melalui opsi konfigurasi default (`enabled: false`).
2. **Revert**: Jika bug fatal dan merusak alur inti, lakukan pengembalian:
   ```powershell
   git checkout HEAD -- <berkas-yang-rusak>
   ```
3. **Perbaiki di Branch Terpisah**: Jangan pernah mencoba memperbaiki bug secara terburu-buru di branch utama (`main`). Selalu ikuti `git-safe-workflow`.

---
name: doc-sync
description: >-
  Pedoman dan instruksi wajib untuk selalu memperbarui README.md (panduan pengguna) dan context.md (spesifikasi arsitektur teknis) setiap kali ada penambahan fitur baru, perbaikan bug, atau perubahan kode. Menjamin dokumentasi proyek selalu akurat, sinkron, dan mutakhir.
---

# Documentation Sync Skill (README.md & context.md Auto-Updater)

Skill ini menetapkan protokol wajib bagi agen untuk **selalu memperbarui `README.md` dan `context.md`** secara disiplin setiap kali ada penambahan fitur baru, perbaikan alur kerja (*bugfix*), penyesuaian arsitektur, atau perubahan konfigurasi pada proyek **TUNTAS SE2026**.

---

## 1. 🎯 Prinsip Utama (Documentation-First & Zero Drift)

> [!IMPORTANT]
> **Kode dan Dokumentasi Adalah Satu Kesatuan**: Tidak ada fitur baru atau perbaikan kode yang dianggap selesai jika `README.md` dan `context.md` belum diperbarui. Dokumentasi yang usang (*outdated*) dapat memicu kesalahan fatal bagi pengguna maupun sesi agen berikutnya.

1. **Sinkronisasi Ganda (Two-Tier Documentation)**:
   - Setiap perubahan harus dicerminkan pada **kedua dokumen** sesuai dengan audiensnya masing-masing.
2. **Kesesuaian dengan Kode Aktual**:
   - Nilai default, nama opsi, selector DOM, nama *action* pesan, dan format file yang tertulis di dokumentasi harus 100% cocok dengan kode yang ada di `background/`, `content/`, `popup/`, dan `lib/`.
3. **Pembaruan Tanggal & Timestamp WITA**:
   - Setiap kali `context.md` disentuh, perbarui baris metadata `> Terakhir diperbarui: [Tanggal] [Bulan] [Tahun]` dengan waktu terkini (WITA / UTC+8).

---

## 2. 📚 Peran & Pembagian Isi Dokumen

| Berkas | Audiens Sasaran | Isi & Fokus Utama |
| :--- | :--- | :--- |
| **`README.md`** | **Pengguna Akhir (*End-User*)** / Petugas Lapangan BPS | - Gambaran umum aplikasi & 4 menu utama (#DC_00, #DC_01, API, NTB).<br>- Panduan langkah demi langkah cara pemakaian.<br>- Format kolom Excel yang dibutuhkan.<br>- Fitur proteksi (Keep-Alive, Auto SSO, Adaptive Throttling).<br>- Kendali jarak jauh WhatsApp Bot & perintah n8n.<br>- Tips pemecahan masalah (*troubleshooting*). |
| **`context.md`** | **Pengembang (*Engineer*) & AI Agent** | - Arsitektur sistem (Manifest V3, diagram Mermaid aliran data).<br>- Struktur pohon direktori berkas proyek.<br>- Daftar *action* pesan `chrome.runtime.onMessage` & `chrome.tabs.sendMessage`.<br>- Skema penyimpanan `chrome.storage.local` (`runnerState`, `runnerOptions`, `fasihQueue`).<br>- Logika State Machine & siklus hidup runner.<br>- Spesifikasi teknis API FormGear/FASIH dan webhook n8n. |

---

## 3. 📝 Prosedur Operasi Standar (SOP Pembaruan)

Setiap kali Anda selesai memodifikasi kode atau menambahkan fitur baru:

### Langkah 1: Identifikasi Dampak Perubahan
Tentukan apa yang berubah:
- [ ] Apakah ada menu baru atau opsi baru di UI popup?
- [ ] Apakah ada perbaikan alur kerja (misal: Auto-SSO hanya aktif saat running)?
- [ ] Apakah ada penambahan *message action* atau perubahan struktur state?
- [ ] Apakah ada format file Excel baru yang didukung?
- [ ] Apakah ada integrasi baru (webhook, API, dsb.)?

### Langkah 2: Perbarui `README.md` (Panduan Pengguna)
1. Buka `README.md`.
2. Jelaskan fitur baru menggunakan bahasa yang mudah dipahami oleh pengguna non-teknis.
3. Cantumkan cara mengaktifkannya di menu/popup jika ada opsi konfigurasi baru.
4. Perbarui tabel ringkasan menu atau daftar perintah WhatsApp jika ada perintah baru.

### Langkah 3: Perbarui `context.md` (Spesifikasi Teknis)
1. Buka `context.md`.
2. Perbarui header tanggal: `> Terakhir diperbarui: <Tanggal Sekarang> WITA`.
3. Jika ada file baru, perbarui bagan struktur berkas (*Project Tree*).
4. Jika ada *message action* baru, tambahkan ke tabel komunikasi pesan internal.
5. Jika ada aturan status baru (seperti syarat status `RUNNING`), perbarui bagian *State Machine*.

### Langkah 4: Verifikasi Integritas
Jalankan skrip verifikasi otomatis untuk memastikan kode dan dokumen dalam kondisi prima:
```powershell
node scripts/verify-all.js
```

---

## 4. 📋 Checklist Verifikasi Dokumentasi

Sebelum melakukan *commit*, pastikan checklist ini terpenuhi:
- [ ] `README.md` telah memuat penjelasan fungsi baru bagi pengguna.
- [ ] `context.md` telah memuat rincian teknis, fungsi, dan arsitektur baru.
- [ ] Tanggal pada header `context.md` telah dimutakhirkan.
- [ ] Tautan berkas dalam dokumen valid dan menggunakan format yang rapi.
- [ ] Sintaks kode diuji dan lulus pengujian QA (`node scripts/verify-all.js`).

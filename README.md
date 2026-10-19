# TUNTAS SE2026 - Tracking dan Tindak Lanjut Anomali Sensus

## Tiga Menu Utama

| Menu | Kapan dipakai | Template | Yang dilakukan bot |
|---|---|---|---|
| **#DC_00 · Tanpa Perubahan** | Anomali apa pun yang sudah sesuai | `Template_TUNTAS_DC0.xlsx` (link_fasih_sm) | Catatan #DC_00 di nilai produksi (27.a/31.a/UB 23.a, alur v8) **atau** 13.g Kode KBLI → konfirmasi anomali → Kirim → Approve (klik "Kembali ke Review" lalu tombol ✓ Approve di toolbar kanan) |
| **#DC_01 · Ganti KBLI** | KBLI salah dan harus diganti | `Template_TUNTAS_DC1_KBLI.xlsx` (link_fasih_sm, kbli_awal, kbli_tujuan) | Cari unit usaha dengan 13.g = kbli_awal → pilih radio kbli_tujuan → catatan #DC_01 di 13.g → konfirmasi anomali → Kirim → Approve |
| **API · Ubah Variabel** | Mengubah isian variabel lain secara massal | `Template_TUNTAS_API_Variabel.xlsx` (link_fasih_sm, kolom variabel) | Ubah nilai variabel via API FASIH → auto backup → buka form & Kirim (batal bila ada GALAT) → Approve |

- Link `/app/assignment-detail/<id>` langsung dibuka sebagai `/app/assignment/<ID Periode Survei>/<id>/edit` (ID periode diatur di popup).
- Pengaman: dokumen **tidak dikirim** bila target catatan / unit usaha / pilihan KBLI tujuan tidak ditemukan.
- #DC_01: KBLI dibaca dari radio rekomendasi 13.g **atau** kotak "Pilih dari Master KBLI" (`div#kbli#…`, nilai pada placeholder textarea). Bila kbli_tujuan tidak ada di rekomendasi, bot memilih lewat Master KBLI (Reset → ketik kode → pilih opsi → verifikasi).
- Fokus unit usaha sesuai kolom `nama_usaha`; satu dokumen = satu eksekusi (tidak diulang otomatis bila halaman berpindah).
- Tombol **Diagnosa**: membaca struktur halaman FASIH di tab aktif (tanpa mengubah apa pun) untuk pemeriksaan bila bot macet.


## Menu Ketiga · API Ubah Variabel

Alurnya seperti #DC_00/#DC_01, tetapi variabelnya bebas diubah sesuai dataKey form FASIH (selain KBLI):
1. Buka satu dokumen FASIH di tab aktif → klik **① Pilih Variabel** → centang variabel yang ingin diganti (bisa dicari).
2. Klik **② Unduh Template** → Excel berisi kolom `link_fasih_sm`, `nama_usaha`, `kode_catatan`, dan satu kolom per variabel; sheet PETUNJUK memuat kode pilihan tiap variabel.
3. Isi nilai baru → upload → Mulai (selalu jalankan mode **Uji coba (dry run)** terlebih dahulu).

- Judul kolom cukup nama variabel (misal `r27a`); bot mencocokkan `r27a#2001` dsb. secara otomatis. Bila dokumen berisi beberapa usaha, `nama_usaha` dipakai untuk memilih usaha yang tepat.
- Kolom `kode_catatan` menentukan catatan pada setiap variabel yang berubah (kosong = #1):
  - **#1**: Perbaikan karena kesalahan pemahaman konsep oleh petugas / kesalahan entri kuesioner
  - **#2**: Hasil konfirmasi/revisit kepada responden
  - **#3**: Informasi dari survei rutin/data administrasi
  - **#4**: Metode atau informasi lain selain kriteria kode
- **Variabel KBLI tidak diubah di menu ini** (kbli, kbli_genai, kbli_akhir, kategori) — gunakan menu #DC_01 · Ganti KBLI.
- Sel kosong = tidak diubah; `#KOSONG` = kosongkan jawaban.
- **Uji coba (dry run)** aktif secara bawaan: menampilkan perubahan tanpa menyimpan.
- Saat jalan sungguhan: backup otomatis dibuat (`.json`) → simpan lewat API → form dibuka ulang → Kirim (dibatalkan bila FASIH menampilkan GALAT) → Approve.
- Tombol **Backup** / **Restore** untuk mengunduh dan mengembalikan data awal; tombol **Cari dataKey** untuk melihat nama variabel di dokumen yang sedang dibuka.

## 📋 Alur Kerja Otomasi (Workflow)

Untuk setiap baris pada file Excel:
1. **Buka Tautan Langsung ke Mode `/edit` (Antrian Excel)**:
   - Saat membuka tautan dari antrian Excel, ekstensi secara otomatis menambahkan `/edit` pada akhir URL `link_fasih_sm` (misal `https://fasih-sm.bps.go.id/app/assignment/.../.../edit`), sehingga **tidak perlu lagi mencari tombol edit** dan tab langsung memuat formulir kuisioner.
2. **Penanganan Tab Aktif ("Test di Tab Aktif")**:
   - Jika dijalankan pada tab aktif yang belum berada di mode `/edit`, ekstensi memberi jeda stabilisasi agar halaman dan elemen SPA termuat terlebih dahulu.
   - Kemudian mencari tombol edit bulat (`tabler-icon-edit`) dan mengkliknya. Jika tombol tidak ditemukan, tautan dialihkan otomatis ke `/edit`.
   - Jika formulir tetap tidak dapat dibuka (misal read-only/selesai), proses otomatis menandai **Dilewati (Skip)**.
3. **Pilih Menu Blok yang Sesuai (BLOK I untuk UB / BLOK II untuk Non-UB)**:
   - Untuk kuisioner **`SE2026 - UB`**, ekstensi otomatis mengklik menu sidebar **`BLOK I (IDENTITAS USAHA/PERUSAHAAN)`**.
   - Untuk kuisioner selain UB (seperti `SE2026 - L`), ekstensi mengklik menu **`BLOK II (KETERANGAN USAHA/PERUSAHAAN)`**.
4. **Buka Dropdown Keterangan Usaha/Perusahaan (Non-UB)**:
   - Pada non-UB, membuka dropdown collapsible unit usaha. Pada `SE2026 - UB`, langsung memproses pertanyaan di form BLOK I.
5. **Iterasi Seluruh Unit Usaha & Penentuan Pertanyaan Sasaran**:
   - Klik unit usaha ke-*i* (misal: *TANAMAN PANGAN JAGUNG*, *PERKEBUNAN JERUK NIPIS*, dst).
   - **Logika Penentuan Pertanyaan yang Diberi Catatan**:
     - **Kondisi 1 (Kuisioner SE2026 - UB)**:
       Jika judul kuisioner adalah `SE2026 - UB`, maka pertanyaan yang diberi catatan adalah:
       👉 **`23. Rincian Nilai produksi Tahun 2025 - a. Nilai produksi barang dan jasa*`**
     - **Kondisi 2 (Kuisioner Selain SE2026 - UB)**:
       Ekstensi memeriksa pertanyaan **`25. Tahun berapa usaha/perusahaan ini mulai beroperasi secara komersial?`**:
       - Jika Tahun Beroperasi **`<= 2025`**: Pertanyaan yang diberi catatan adalah:
         👉 **`27. a. Nilai produksi/pendapatan/penjualan barang dan jasa`**
       - Jika Tahun Beroperasi **`> 2025`**: Pertanyaan yang diberi catatan adalah:
         👉 **`31. a. Nilai pendapatan barang dan jasa*`**
   - Klik tombol **Catatan** (icon komentar) pada pertanyaan target tersebut.
   - **Smart Skip pada Catatan yang Sudah Ada**: Jika pada modal catatan (atau riwayat catatan pertanyaan tersebut) sudah terdeteksi isian **`#DC_00`** atau **`#DC_01`**, dokumen langsung ditandai **Dilewati (SKIPPED)**. Bot tidak mengetik ulang, tidak mengirim survei, dan tidak melakukan langkah Approve. Tab dokumen akan segera ditutup dan antrian otomatis melompat ke baris berikutnya.
   - Jika belum ada catatan: Mengisi modal catatan dengan teks **Catatan Utama** (default **`#DC_00`**, berlaku untuk semua kuisioner termasuk `SE2026 - UB`). Catatan tambahan (#DC12 pada butir b) sudah dihapus.
   - **Mengaktifkan Toggle Switch Konfirmasi Galat** (`switch-cl-...-control` / Sesuai Lapangan) agar peringatan galat otomatis terkonfirmasi dan tidak memblokir saat submit survei.
   - Mengklik tombol kirim/simpan catatan di modal.
   - Mengulangi hingga seluruh unit usaha selesai diproses dan toggle aktif.
6. **Buka Menu CATATAN di Sidebar & Aktifkan Toggle Anomali**:
   - Mengklik menu sidebar **CATATAN** (ikon peringatan merah `tw:text-destructive`).
   - Mencari bagian **"Tampilkan Anomali Usaha dan Keluarga"**.
   - Mengaktifkan toggle switch konfirmasi anomali/galat agar seluruh anomali tervalidasi.
7. **Kirim Survei**: Mengklik tombol **Kirim** di pojok kanan atas formulir.
8. **Konfirmasi Pengiriman & Auto Approve**:
   - Mengonfirmasi modal pop-up kirim survei bawaan FASIH.
   - Jika opsi Auto Approve aktif: otomatis beralih ke halaman review dan mengklik tombol **✓ Approve** di toolbar.
9. **Penutupan Tab & Transisi Otomatis (Anti-Stuck)**:
   - Tab dokumen yang sudah selesai (`SUCCESS`) atau dilewati (`SKIPPED`) langsung ditutup secara otomatis.
   - **Safe Single-Tab Handling**: Jika hanya ada 1 tab di jendela browser, tab baru dibuka terlebih dahulu sebelum tab lama ditutup agar jendela browser tidak ikut tertutup.
   - **Bypass Beforeunload**: Memblokir dialog konfirmasi FASIH *"Leave site?"* sehingga penutupan tab tidak terhambat.
   - Antrian otomatis melompat ke baris berikutnya tanpa perlu intervensi manual pengguna. (Tombol **Stop** dan **Jeda/Pause** dapat ditekan kapan saja untuk menghentikan seketika).

---

## 🚀 Cara Memasang (Install) di Google Chrome

1. Buka browser **Google Chrome**.
2. Masuk ke halaman ekstensi dengan mengetikkan `chrome://extensions/` di address bar lalu tekan **Enter**.
3. Aktifkan **Developer mode** (Mode Pengembang) di pojok kanan atas.
4. Klik tombol **Load unpacked** (Muat yang belum dibongkar) di pojok kiri atas.
5. Pilih folder ekstensi ini:
   ```
   D:\Anomali2
   ```
6. Ekstensi **TUNTAS SE2026** akan muncul dan siap digunakan.
7. Sematkan (Pin) ikon ekstensi di toolbar Chrome agar mudah diakses.

---

## 📖 Cara Menggunakan

1. **Akun FASIH & Auto Login SSO Eksternal**:
   - Ekstensi dilengkapi fitur **Auto Login SSO Eksternal**: jika sesi berakhir atau tab dialihkan ke halaman login SSO BPS, bot akan otomatis mengklik **"Lanjutkan SSO Eksternal"**, memasukkan email `Haerulhaeruddin003@gmail.com` dan kata sandi `Mitra123`, lalu mengirim formulir login dan kembali melanjutkan antrian.
   - Anda juga dapat menyesuaikan email/kata sandi SSO kapan saja melalui menu Pengaturan pada popup.
2. **Buka Ekstensi**:
   - Klik ikon **TUNTAS SE2026** di toolbar Chrome.
3. **Import File Excel**:
   - Klik area upload atau tarik file Excel (misal: `Nilai Tambah positif tapi flag 3 binjai test.xlsx`).
   - Ekstensi akan otomatis mendeteksi kolom `link_fasih_sm` dan menampilkan daftar antrian.
4. **Atur Pengaturan (Opsional)**:
   - **Email & Password SSO**: Default `xxxxxx@gmail.com` & `XXXXXX` (bisa diubah di popup).
   - **Auto Login SSO Eksternal**: Centang untuk otomatis login saat sesi kedaluwarsa.
   - **Catatan Utama**: Default `#DC_00` (satu catatan saja, tanpa catatan tambahan).
   - **Jeda per Langkah**: Default `1.5` detik (dapat diperbesar menjadi 2.0 atau 2.5 jika koneksi server FASIH sedang lambat).
   - **Tampilkan konfirmasi sebelum kirim (untuk cek kesesuaian)**: Centang jika Anda ingin memeriksa isian terlebih dahulu sebelum survei dikirim. Ekstensi akan menampilkan modal konfirmasi interaktif di halaman dengan opsi:
     - *Ya, Sudah Sesuai & Lanjut Kirim*
     - *Lewati Kirim (Simpan Catatan & Lanjut Antrian)*
     - *Hentikan di Sini (Periksa Manual)*
   - **Kirim survei & konfirmasi modal di akhir**: Centang untuk otomatis submit survei.
   - **Tutup tab setelah survei berhasil dikirim**: Centang untuk menutup tab secara otomatis (berlaku untuk dokumen yang selesai maupun yang dilewati/skip).
    - **Auto Approve**: Centang untuk otomatis membuka halaman review dan mengklik tombol Approve setelah survei berhasil disubmit.
    - **Notifikasi Webhook (n8n / Telegram)**: Mengirim notifikasi otomatis saat terjadi error atau circuit breaker aktif ke endpoint Webhook (lengkap dengan identitas PC, nomor baris Excel, nama usaha, ID Assignment, dan penyebab error).
    - **Circuit Breaker**: Pengaman otomatis yang akan menjeda antrian jika terjadi 3 kegagalan beruntun akibat server FASIH down atau timeout jaringan.
5. **Mulai Eksekusi**:
   - Klik tombol **Mulai Otomasi**.
   - Ekstensi akan membuka tab, memproses alur step-by-step, dan memperbarui tabel status secara real-time.
   - Anda dapat menekan tombol **Jeda (Pause)**, **Lanjut (Resume)**, atau **Stop** kapan saja.
6. **Fitur "Test di Tab Aktif"**:
   - Jika Anda sedang membuka halaman formulir FASIH pada tab saat ini dan ingin menguji coba langkah tanpa melalui antrian Excel, cukup klik tombol **Test di Tab Aktif**.
7. **Export Log Hasil ke Excel**:
   - Klik tombol hijau **Export Log Excel** di atas tabel antrian kapan saja (baik saat proses berjalan, dijeda, maupun setelah selesai).
   - File Excel hasil akan mempertahankan seluruh kolom asli dari file yang diimpor, dengan tambahan kolom di paling belakang:
     - **`status`**: Menampilkan status akhir setiap baris (`SUKSES`, `GAGAL`, `DILEWATI`, atau `PENDING`).
     - **`keterangan`**: Menampilkan pesan keberhasilan (*Sukses terkirim*) atau penyebab error/kegagalan (*misal: Tombol Edit tidak ditemukan, Menu BLOK II tidak ditemukan, dll.*) sehingga mudah ditelusuri baris mana yang gagal dan alasannya.

---

## 📁 Struktur Berkas

```
Anomali2/
├── manifest.json            # Konfigurasi Chrome Extension Manifest V3
├── icons/                   # Ikon ekstensi (16px, 48px, 128px)
├── lib/
│   └── xlsx.full.min.js     # SheetJS untuk membaca file Excel secara lokal & offline
├── popup/
│   ├── popup.html           # Antarmuka kontrol pengguna
│   ├── popup.css            # Desain tampilan UI
│   └── popup.js             # Logika import Excel, antrian, & kontrol
├── background/
│   └── background.js        # Service Worker pengendali tab & queue
├── content/
│   ├── content.js           # Content Script pelaksana otomasi DOM di fasih-sm
│   └── fasih_api.js         # Library API FASIH untuk perubahan variabel langsung
├── template/                # File template Excel (.xlsx)
└── README.md                # Dokumentasi & panduan penggunaan
```

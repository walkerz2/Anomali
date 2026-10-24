# TUNTAS SE2026 - Tracking dan Tindak Lanjut Anomali Sensus

## Empat Menu Utama

| Menu | Kapan dipakai | Template / Sumber File | Yang dilakukan bot |
|---|---|---|---|
| **#DC_00 · Tanpa Perubahan** | Anomali apa pun yang sudah sesuai batas wajar | `Template_TUNTAS_DC0.xlsx` (link_fasih_sm) | Catatan #DC_00 di nilai produksi (27.a/31.a/UB 23.a), khusus **27.a**, **atau** 13.g Kode KBLI → konfirmasi anomali → Kirim → Approve |
| **#DC_01 · Ganti KBLI** | KBLI salah dan harus diganti | `Template_TUNTAS_DC1_KBLI.xlsx` (link_fasih_sm, kbli_awal, kbli_tujuan) | Cari unit usaha dengan 13.g = kbli_awal → pilih radio kbli_tujuan → catatan #DC_01 di 13.g → konfirmasi anomali → Kirim → Approve |
| **API · Ubah Variabel** | Mengubah isian variabel lain secara massal | `Template_TUNTAS_API_Variabel.xlsx` (link_fasih_sm, kolom variabel) | Ubah nilai variabel via API FASIH → auto backup → buka form & Kirim (batal bila ada GALAT) → Approve |
| **NTB · Validasi & Imputasi** | Validasi & perbaikan anomali Rasio NTB (Flag 3) | File ekspor **PANTAU BPS** (`.xlsx` / `.xls`) | Menganalisis KBLI A–V & rasio riil → memisahkan **#0 (Wajar)** vs **#1 (Perlu Imputasi)** → menghitung nominal perbaikan presisi → ekspor Excel 3-sheet & otomatis muat ke antrian eksekusi |

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



## Menu Keempat · NTB Validasi & Imputasi (Flag 3)

Fitur ini mengintegrasikan kecerdasan validasi **Rasio Nilai Tambah Bruto (NTB Flag 3)** secara langsung di dalam browser (100% *client-side*, tanpa memerlukan Python atau server tambahan):

1. **Upload File Mentah PANTAU BPS**:
   - Cukup unduh daftar anomali NTB Flag 3 dari PANTAU BPS (format `.xlsx` atau `.xls`), lalu tarik/pilih file di menu **NTB · Validasi Rasio**.
   - Sistem membaca otomatis kolom: `Nama Usaha`, `Total Pengeluaran`, `Pendapatan Barang & Jasa`, `Pendapatan Lainnya`, `Total Aset`, dan `Link Edit FASIH` / `Assignment ID`.

2. **Kalkulasi Mandiri & Diagnosa Cerdas**:
   - **Kalkulasi Riil**:
     $\text{Total Pendapatan} = \text{Pendapatan B\&J} + \text{Pendapatan Lainnya}$
     $\text{NTB Riil} = \text{Total Pendapatan} - \text{Total Pengeluaran}$
     $\text{Rasio NTB (\%)} = \left( \frac{\text{NTB Riil}}{\text{Total Pendapatan}} \right) \times 100$
   - **Inferensi Kategori KBLI**: Menganalisis kata kunci nama usaha dan mencocokkannya ke 22 kategori sektor ekonomi (A sampai V).
   - **Penentuan Status**:
     - **Status #0 (Sesuai Batas Wajar)**: Jika rasio riil berada di dalam rentang wajar resmi BPS (misal Perdagangan Kategori G: 7% s.d. 60%).
     - **Status #1 (Anomali / Perlu Imputasi)**: Jika rasio di luar batas wajar (terlalu tinggi / terlalu rendah) atau pengeluaran > pendapatan.

3. **Rekomendasi Imputasi Variabel Presisi**:
   - Untuk **Status #1**, sistem menghitung nilai target agar rasio berada tepat di titik tengah wajar (target median):
     - **Sektor G (Perdagangan) & K (Pulsa/Voucher)**: Variabel `r26c` (Biaya Pembelian Barang Dagangan)
     - **Sektor H (Transportasi) & Sektor Jasa (B, D, E, F, J, L–V)**: Variabel `r26d` (Biaya Operasional)
     - **Sektor C (Industri), A (Pertanian), I (Kuliner/Makan Minum)**: Variabel `r26b` (Bahan Baku / Bibit / Makanan)
     - **Pendapatan = 0 / Kosong**: Variabel `r27a` (Nilai Pendapatan Barang dan Jasa)

4. **Ekspor Excel 3-Sheet Otomatis**:
   - Klik **Unduh Hasil Validasi (.xlsx 3-Sheet)** untuk mendapatkan:
     - **Sheet 1 (Master Validasi NTB)**: Seluruh data lengkap dengan NTB riil, diagnosa, dan rekomendasi perbaikan.
     - **Sheet 2 (Panduan Imputasi #1)**: Daftar usaha anomali beserta instruksi petugas lapangan.
     - **Sheet 3 (Template API Siap Pakai)**: Format kolom siap pakai yang langsung cocok dengan menu API Ubah Variabel.

5. **Opsi Persiapan Sheet 3 Kustom (Input Mandiri & Multi-Variabel)**:
   - Jika Anda ingin menentukan sendiri variabel perbaikan atau nominal imputasi (bukan dari hitungan otomatis formula ekstensi), Anda dapat mengedit **Sheet 3 (Template API Siap Pakai)** secara mandiri.
   - **Bebas Mengubah Variabel Apa Saja & Multi-Variabel**: Anda tidak terbatas pada variabel bawaan (`r26b`, `r26c`, `r26d`, atau `r27a`). Anda dapat menambahkan kolom variabel apa saja dari kuesioner FASIH (misal: `r26a` upah pekerja, `r27b` pendapatan sampingan, `r28` modal, dll.), dan Anda bisa mengubah beberapa variabel sekaligus dalam 1 baris usaha.
   - **Fleksibilitas Nama Sheet**: Pada file terpisah, nama sheet tidak harus `Sheet 3` atau `Template API Siap Pakai` (bisa default `Sheet1`, `Data Perbaikan`, dsb.) karena sistem memindai langsung keberadaan kolom header `link_fasih_sm` atau `assignment_id`.
   - **Deteksi Otomatis**: Saat file Excel yang memiliki sheet Template API Siap Pakai diunggah kembali ke menu NTB, sistem otomatis mendeteksi dan mengaktifkan mode kustom (ditandai dengan badge hijau *Sheet 3 Kustom Terdeteksi*).
   - **Upload File Terpisah**: Disediakan tombol **Unggah Sheet 3 Kustom** jika file Sheet 3 disimpan dalam file Excel terpisah.
   - **Kombinasi Sempurna**: Usaha Status #1 akan diimputasi sesuai racikan variabel & nilai kustom pilihan Anda, sedangkan usaha Status #0 tetap otomatis diberi catatan konfirmasi #0 pada nilai produksi (27.a / 31.a / UB 23.a) tanpa perlu diatur ulang.

6. **Integrasi Antrian Bot FASIH**:
   - Anda dapat memilih data yang ingin dieksekusi oleh bot melalui tombol filter:
     - **Semua**: Memproses seluruh baris (Status #1 via API ubah variabel + submit + approve; Status #0 via catatan konfirmasi #0 pada 27.a + submit + approve).
     - **Hanya #1**: Hanya memproses unit usaha anomali yang perlu perbaikan nilai angka via API.
     - **Hanya #0**: Hanya memproses unit usaha yang sudah sesuai batas wajar untuk diberi catatan konfirmasi.
   - **Smart Alias Otomatis (UB & Usaha Buka 2026)**: Mesin API secara adaptif memetakan variabel pendapatan dan biaya jika dokumen survei adalah Usaha Buka 2026 (`31.a` / `nilai_pendapatan_bln` dan `30.b` / `biaya_produksi_bln`) maupun kuisioner UB (`23.a` / `r23a` dan `22` / `r22`), sehingga eksekusi Status #1 berjalan lancar dan otomatis untuk seluruh tipe kuisioner.

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

1. **Akun FASIH, Auto Login SSO Eksternal & Penjaga Sesi**:
   - **Jaga Sesi FASIH Tetap Aktif**: Memastikan sesi Anda di FASIH-SM tidak kedaluwarsa saat browser didiamkan. Cukup biarkan minimal satu tab `fasih-sm.bps.go.id` terbuka di latar belakang. Ekstensi akan mengirimkan *heartbeat* ringan ke server tiap 4 menit dan mengunci tab agar tidak dibekukan (*autoDiscardable: false*).
   - **Adaptive Throttling**: Otomatis memantau latensi dan respons server FASIH serta menyesuaikan kecepatan eksekusi bot secara mandiri saat server melambat atau padat.
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
    - **Jaga Sesi FASIH Tetap Aktif (Keep-Alive)**: Centang (default aktif) agar ekstensi secara otomatis menyapa server FASIH-SM setiap 4 menit lewat tab FASIH yang terbuka. Menjaga sesi login tidak habis karena lama diam dan mencegah tab ditidurkan (*discarded*) oleh Memory Saver Chrome. Status sesi (aktif/habis beserta jam terakhir diperpanjang) terpantau langsung di popup, dan ikon ekstensi menampilkan tanda seru merah (**!**) bila sesi habis.
    - **Adaptive Throttling (Penyesuaian Kecepatan Otomatis)**: Centang (default aktif) agar bot secara cerdas mengukur waktu respon server FASIH (latensi pemuatan tab & eksekusi API) secara *real-time*:
      - **Optimal (< 2.5 detik)**: Kecepatan normal (pengali 1.0x).
      - **Sedang (2.5 s.d. 5 detik)**: Bot melambat secara otomatis ke pengali 1.5x untuk memberi ruang server bernapas.
      - **Padat (> 5 detik)**: Bot memperlambat jeda langkah ke 2.2x agar tidak memicu bottleneck dan mencegah request timeout.
      - **Cooldown Otomatis (15 detik)**: Jika terdeteksi gangguan server (HTTP 502/503/504, Bad Gateway, Service Unavailable, atau timeout koneksi), bot secara otomatis mengaktifkan jeda pendinginan selama 15 detik sebelum memproses dokumen berikutnya.
      - **Live Health Badge**: Kondisi server terpantau langsung secara dinamis melalui status latensi dan badge kesehatan server (*Normal*, *Sedang*, *Padat*, *Cooldown*) di bagian kemajuan proses popup.
   - **Catatan Utama**: Default `#DC_00` (satu catatan saja, tanpa catatan tambahan).
   - **Jeda per Langkah**: Default `1.5` detik (dapat diperbesar menjadi 2.0 atau 2.5 jika koneksi server FASIH sedang lambat).
   - **Tampilkan konfirmasi sebelum kirim (untuk cek kesesuaian)**: Centang jika Anda ingin memeriksa isian terlebih dahulu sebelum survei dikirim. Ekstensi akan menampilkan modal konfirmasi interaktif di halaman dengan opsi:
     - *Ya, Sudah Sesuai & Lanjut Kirim*
     - *Lewati Kirim (Simpan Catatan & Lanjut Antrian)*
     - *Hentikan di Sini (Periksa Manual)*
   - **Kirim survei & konfirmasi modal di akhir**: Centang untuk otomatis submit survei.
   - **Tutup tab setelah survei berhasil dikirim**: Centang untuk menutup tab secara otomatis (berlaku untuk dokumen yang selesai maupun yang dilewati/skip).
    - **Auto Revoke jika Dokumen Sudah di-Approve**: Jika assignment sudah berstatus Approved sehingga tombol Kirim tidak tersedia, bot otomatis mengklik tombol Revoke (ikon panah putar balik di toolbar pojok kanan bawah), mengonfirmasi dialog Revoke, menunggu reload formulir selesai, mengisi catatan (misal 27.a atau 13.g), submit formulir, dan melakukan Approve kembali.
    - **Auto Approve**: Centang untuk otomatis membuka halaman review dan mengklik tombol Approve setelah survei berhasil disubmit.
    - **Notifikasi Webhook (n8n / Telegram)**: Mengirim notifikasi otomatis secara selektif ke endpoint Webhook. Notifikasi **hanya** dikirim jika ekstensi macet/tidak jalan (server FASIH down, 500/502/503/504, timeout >35s/70s, SSO gagal, koneksi terputus, formulir tidak terbuka) atau kandas dalam proses pemberian remark (pertanyaan target tidak ditemukan, modal catatan gagal dibuka, unit usaha/KBLI tidak ditemukan, gagal revoke, atau galat formulir). Event wajar seperti remark sudah ada sebelumnya, link URL Excel tidak valid, atau kendala tombol Approve setelah dokumen sukses terkirim tidak akan memicu notifikasi.
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
│   ├── ntb_validator.js     # Mesin validasi & imputasi rasio NTB (client-side)
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

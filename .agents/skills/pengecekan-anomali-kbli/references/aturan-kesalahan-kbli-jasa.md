# Referensi Lengkap Kesalahan Pemilihan KBLI SE2026 (Direktorat Statistik Jasa BPS)

Dokumen ini merangkum seluruh katalog temuan kesalahan KBLI yang diidentifikasi oleh **Direktorat Statistik Jasa BPS RI** pada kegiatan Sensus Ekonomi 2026 (SE2026), dilengkapi dengan alasan teknis, aturan pembagian subgolongan, serta aturan kata kunci negasi.

---

## 1. Golongan Pokok KBLI 55 (Penyediaan Akomodasi)

### Aturan Batas Konsep:
- KBLI **55201 (Pondok Wisata)** ditujukan khusus untuk penyediaan akomodasi harian/mingguan yang berlokasi di daerah tujuan wisata (homestay wisata).
- Unit usaha penyewaan tempat tinggal yang berorientasi **bulanan atau tahunan** (kos, asrama, mess) BUKAN pondok wisata, melainkan masuk **55909**.
- Unit usaha persewaan properti/rumah sewa utuh atau kontrakan yang tidak menyediakan fasilitas layanan hotel masuk ke **Kategori M (Real Estat - 68112)**.

### Matriks Temuan Kesalahan KBLI 55:

| Jenis Usaha / Kata Kunci | Kode Tercatat | Kode Seharusnya | Nama KBLI Seharusnya | Alasan & Landasan Konsep |
| :--- | :---: | :---: | :--- | :--- |
| **Kos-kosan** | 55201 | **55909** | Penyediaan Akomodasi Lainnya YTDL | Bersifat hunian kamar sewa jangka menengah/panjang. |
| **Sewa Kamar** | 55201 | **55909** | Penyediaan Akomodasi Lainnya YTDL | Persewaan kamar perorangan. |
| **Asrama** | 552 | **55909** | Penyediaan Akomodasi Lainnya YTDL | Akomodasi asrama mahasiswa, santri, atau pelajar. |
| **Mess** | 552 | **55909** | Penyediaan Akomodasi Lainnya YTDL | Akomodasi karyawan perusahaan, pemprov/pemkot, perumda. |
| **Kontrakan Rumah** | 55201 | **68112** | Aktivitas Penyewaan Bangunan & Lahan Hunian Milik Sendiri/Sewa | Penyewaan rumah hunian utuh tanpa fasilitas layanan kamar. |
| **Sewa Rumah** | 55201 | **68112** | Aktivitas Penyewaan Bangunan & Lahan Hunian Milik Sendiri/Sewa | Kategori M (Real Estat). |
| **Bedeng** | 55201 | **68112** / **55909** | Real Estat (68112) / Akomodasi Lainnya (55909) | Tergantung bentuk bangunan (hunian keluarga = 68112; barak pekerja = 55909). |
| **Laundry** | 55 / 55209 | **96100** | Aktivitas Pencucian dan Pembersihan Tekstil dan Bulu | Masuk Kategori T (Aktivitas Jasa Lainnya). |
| **Café / Coffee Shop** | 55 / 55209 | **56303** | Rumah Minum / Kafe | Masuk Kategori I Golongan Pokok 56 (PMM). |
| **Kantin** | 55 | **56101** | Kantin / Rumah Makan | Penyediaan makanan siap saji di lingkungan kantor/sekolah. |
| **Kedai Minuman** | 55 | **56304** | Kedai Minuman | Penjualan minuman es, teh, kopi seduh. |
| **Warung Makan Permanen** | 55 | **56101** | Warung Makan Permanen / Restoran | Tempat makan minum berstruktur tetap. |
| **Warung Makan Non-Permanen**| 55 | **56102** | Warung Makan Tidak Tetap | Tenda kaki lima, lapak dorong. |
| **Perdagangan Barang** | 55 | **47** | Perdagangan Eceran | Usaha murni berjualan barang (sembako, pulsa, baju, mainan). |

---

## 2. Golongan Pokok KBLI 56 (Penyediaan Makanan Minuman) — Aturan Kata Kunci Negasi

Petugas sensus kerap salah menetapkan kode 56101 / 56102 / 56304 hanya karena kata "warung" atau "kios". Gunakan aturan negasi berikut:

### Tabel Kata Kunci Negasi KBLI 56:

| Kata Kunci Negasi | Kata Tambahan Pendukung | Kode KBLI Rekomendasi | Kategori | Alasan Konsep |
| :--- | :--- | :---: | :---: | :--- |
| **SEMBAKO** | Beras, minyak, gula, telur, mie | **47112** | G | Perdagangan eceran barang kebutuhan pokok selain swalayan. |
| **KELONTONG** | Bumbu dapur, sabun, rokok, jajanan | **47112** | G | Toko/kios kelontong primer bahan kebutuhan harian. |
| **KIOS / TOKO** | Baju, bensin, mainan, pulsa | **47xxx** | G | Perdagangan eceran komoditas spesifik. |
| **KOS / KOST** | Kamar kos, anak kos, kos bulanan | **55909** | I | Penyediaan akomodasi sewa kamar. |
| **KONTRAKAN** | Rumah kontrakan, kontrakan keluarga | **68112** | M | Real estat hunian. |
| **PERTANIAN** | Jagung, padi, kebun, sawah, karet | **01xxx** | A | Budidaya tanaman pangan/perkebunan. |
| **HORTIKULTURA** | Cabai, terong, sayur, kangkung, buah | **0113x** | A | Budidaya tanaman hortikultura. |
| **SEWA RUKO / KIOS** | Sewa tempat usaha, sewa kios pasar | **68112** | M | Real estat komersial / persewaan tempat usaha. |
| **SEWA TENDA / TARATAK** | Tenda pesta, perlengkapan nikahan | **77291** | N | Penyewaan peralatan pesta dan acara. |
| **SEWA MOBIL / ANGKUT** | Pick up angkut barang, mobil rental | **77100** / **4942** | H / N | Angkutan barang / persewaan kendaraan. |

---

## 3. Kategori L (Aktivitas Keuangan dan Asuransi)

### Aturan Klasifikasi Lembaga Keuangan:

1. **Bank Sentral**: Hanya ada **1 institusi** yaitu Bank Indonesia (KBLI **64110**). Agen BRI Link, konter, atau koperasi DILARANG menggunakan kode ini!
2. **Perantara Moneter Lainnya YTDL (64199)**: Kode resmi untuk agen laku pandai, **Agen BRI Link**, Agen BNI 46, Mandiri Agen, dsb.
3. **Perbankan Umum vs BPR**:
   - Bank Umum Konvensional (BRI, BNI, BCA, Mandiri, Woori, Danamon) ➔ **64121**.
   - Bank Umum Syariah (BSI, Bank Muamalat, BTPN Syariah) ➔ **64122**.
   - BPR Konvensional (meski berbadan hukum Koperasi/PT) ➔ **64123**.
   - BPR Syariah (BPRS) ➔ **64124**.
4. **Koperasi Simpan Pinjam**:
   - Koperasi Simpan Pinjam (KSP) Konvensional ➔ **64191**.
   - Koperasi Simpan Pinjam dan Pembiayaan Syariah (KSPPS / BMT) ➔ **64192**.
5. **Pembiayaan Mikro & Leasing**:
   - PNM Mekaar Konvensional ➔ **64193**.
   - PNM Mekaar Syariah / Bank Wakaf Mikro ➔ **64194** / **64959**.
   - Leasing Kendaraan / Multifinance (FIF, BFI, NSC, Mega Finance, OTO) ➔ **64910**.
   - Gadai Resmi (PT Pegadaian) ➔ **64953**.
   - Gadai Perorangan / Rentenir / Bank Keliling ➔ **64959**.
   - Pinjol Legal / P2P Lending (Amartha, Modalku) ➔ **66161**.

---

## 4. Kategori M (Aktivitas Real Estat) & S (Rekreasi)

### Kesalahan Real Estat M68:
- **68112 (Sewa Rumah/Kontrakan)**: Kerap salah dipakai untuk usaha kos-kosan (`KOST PAK DJUREMI`, `KOS HIJAU`). Jika ada kata kunci **Kos/Kost**, wajib diganti ke **55909** (Kategori I).
- **68121 (Pengelolaan Kawasan Pariwisata)**:
  - Sering keliru dipakai untuk usaha las mobil (`33111`), kolam pancing rekreasi (`93293`), waduk rekreasi (`9329`), dan warung lesehan (`56101`).

### Kesalahan Olahraga & Rekreasi S93:
- **93193 (Perburuan di Kawasan Buru)**:
  - Sering salah dipakai untuk kolam pemancingan ikan mas/lele komersial. Seharusnya masuk **93293** (Daya Tarik Rekreasi Pemancingan).
  - Sering salah dipakai untuk pencari telur semut rangrang (kroto) atau pakan burung di hutan. Seharusnya masuk Kategori **A (02209 Pengambilan Hasil Hutan Bukan Kayu)**.
- **93296 (Wisata Agro)**:
  - Sering salah dipakai untuk petani tanaman cabai, bawang merah, jagung, bayam di kebun biasa tanpa fasilitas objek wisata. Seharusnya masuk **Kategori A (Golongan Pokok 01 Pertanian)**.

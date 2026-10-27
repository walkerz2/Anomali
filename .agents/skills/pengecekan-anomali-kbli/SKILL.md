---
name: pengecekan-anomali-kbli
description: >-
  Pemeriksaan, validasi, dan koreksi anomali kode KBLI serta anomali data SE2026 berdasarkan pedoman resmi Direktorat Statistik Jasa BPS. Gunakan skill ini untuk mendeteksi kesalahan klasifikasi KBLI (Akomodasi 55, Makan Minum 56, Keuangan L/64-66, Real Estat M/68, Hiburan/Rekreasi S/93, Jasa Lainnya T/95-96), menganalisis kata kunci negasi (sembako, kelontong, kos, kontrakan, pertanian, sewa), mendeteksi anomali kuantitatif (NTB negatif, rasio upah terhadap NTB ekstrem, upah pekerja < Rp100.000, inkonsistensi R224/R226/R227, dummy 100.000, rasio NTB 1.00), serta memberikan rekomendasi KBLI yang benar (rekomendasi #DC_01).
---

# Skill Pengecekan KBLI & Anomali Data SE2026 (Direktorat Statistik Jasa BPS)

Skill ini memandu AI Agent dalam melakukan pemeriksaan kepatuhan, audit anomali klasifikasi KBLI, deteksi inkonsistensi data kuisioner, serta pemberian rekomendasi kode KBLI yang benar pada **Sensus Ekonomi 2026 (SE2026)** berdasarkan materi resmi **Direktorat Statistik Jasa BPS RI**.

---

## 1. 🎯 Ruang Lingkup dan Tujuan

1. **Audit Mismatch KBLI vs Jenis Usaha / Uraian Kegiatan**:
   - Memastikan kegiatan usaha responden diklasifikasikan ke dalam kode KBLI 5 digit yang tepat sesuai substansi ekonomi ril, bukan sekadar kata umum yang menyesatkan (*false keyword match*).
2. **Pendeteksian Kata Kunci Negasi (*Negation Keywords*)**:
   - Menemukan usaha yang salah masuk ke Kategori Jasa (misal masuk ke KBLI 55 atau 56) padahal merupakan sektor Perdagangan Eceran (47), Real Estat (68), Pertanian (01), atau Penyewaan (77).
3. **Pemeriksaan Inkonsistensi Aritmetika & Validasi Blok Kuisioner**:
   - Total Pekerja Jenis Kelamin vs Pembayaran (`R.224.c1 ≠ R.224.c2`).
   - Penjumlahan Total Pendapatan (`R.227.c ≠ R.227.a + R.227.b`).
   - Penjumlahan Total Pengeluaran (`R.226.f ≠ R.226.a + R.226.b + R.226.c + R.226.d + R.226.e`).
   - Pekerja dibayar ada namun upah nol (`R.224.a2 > 0` tapi `R.226.a = 0`).
4. **Pendeteksian Outlier & Rasio Ekstrem Regional**:
   - Nilai Tambah Bruto (NTB) negatif atau bernilai dummy (`Rp 100.000`).
   - Upah/gaji per pekerja ekstrem rendah (< Rp 100.000) atau ekstrem besar (> Rp 1 Miliar).
   - Rasio NTB terhadap Output bernilai `1,00` (tanpa biaya antara sama sekali) atau bernilai minus.
   - Rasio Upah terhadap NTB yang melampaui batas wajar (> 1,00 atau negatif).

---

## 2. 🔍 Matriks Kesalahan KBLI & Aturan Koreksi Resmi

### A. Kategori I — Golongan Pokok 55 (Penyediaan Akomodasi)

| Keyword / Nama Usaha / Kegiatan | KBLI Salah (Hasil Entri) | KBLI Seharusnya | Deskripsi KBLI Seharusnya & Alasan BPS |
| :--- | :---: | :---: | :--- |
| **Kos-kosan / Kamar Kos / Rumah Kos** | `55201` | **`55909`** | **Penyediaan Akomodasi Lainnya YTDL** (Kos-kosan beroperasi jangka panjang bulanan/tahunan, bukan pondok wisata). |
| **Sewa Kamar** | `55201` | **`55909`** | **Penyediaan Akomodasi Lainnya YTDL**. |
| **Asrama / Asrama Mahasiswa / Pelajar** | Subgolongan `552` | **`55909`** | **Penyediaan Akomodasi Lainnya YTDL**. |
| **Mess / Mess Karyawan / Pemda** | Subgolongan `552` | **`55909`** | **Penyediaan Akomodasi Lainnya YTDL**. |
| **Kontrakan / Rumah Kontrakan / Sewa Rumah** | `55201` | **`68112`** | **Aktivitas Real Estat (Kategori M)**: Persewaan bangunan/lahan hunian milik sendiri/sewa jangka panjang. |
| **Bedeng / Sewa Bedeng** | `55201` | **`68112`** / **`55909`** | **Aktivitas Real Estat (68112)** jika sewa unit hunian; atau **55909** jika akomodasi pekerja. |
| **Laundry / Jasa Cuci Pakaian** | Subgolongan `55` | **`96100`** | **Aktivitas Jasa Lainnya (Kategori T)**: Pencucian dan pembersihan tekstil/bulu. |
| **Café / Kafe** | Subgolongan `55` | **`56303`** | **Penyediaan Makanan Minuman (Kategori I)**: Rumah Minum / Kafe. |
| **Kantin, Warung Makan, Kedai** | Subgolongan `55` | **`56101`** / **`56102`** / **`56304`** | Masuk ke Golongan Pokok **56** (56101 Restoran/Rumah Makan, 56102 Warung Makan, 56304 Kedai Minuman). |
| **Perdagangan Eceran (Sembako, Mainan, Pulsa)** | Subgolongan `55` | Subgolongan **`47`** | Masuk ke Perdagangan Eceran (misal **47112** Sembako). |

---

### B. Kategori I — Golongan Pokok 56 (Penyediaan Makanan Minuman) — Deteksi Negasi

Sering terjadi kesalahan petugas memasukkan usaha non-makanan ke KBLI 56 (seperti `56101`, `56102`, `56304`). Gunakan filter kata kunci negasi berikut:

| Kata Kunci Negasi | Contoh Kasus Nama Usaha | KBLI Salah | KBLI Seharusnya |
| :--- | :--- | :---: | :---: |
| **SEMBAKO** | Usaha Warung Sembako, Kios Sembako, Toko Sembako | `56101` / `56102` / `56304` | **`47112`** (Perdagangan Eceran Sembako Selain Swalayan) |
| **KELONTONG** | Usaha Kelontong, Jualan Kelontong, Kios Kelontong | `56101` / `56304` / `56400` | **`47112`** (Perdagangan Eceran Sembako & Kebutuhan Dapur) |
| **KIOS / TOKO** | Kios Baju, Toko Mainan, Kios Rokok | `56101` / `56304` | Golongan Pokok **`47`** (Perdagangan Eceran) |
| **KOS / KOST** | Anak Kos, Kos-kosan, Persewaan Kamar Kos | `56101` / `56290` / `56304` | **`55909`** (Penyediaan Akomodasi Lainnya YTDL) |
| **PERTANIAN / KEBUN** | Pertanian Jagung, Petani Padi, Kebun Karet, Toko Pupuk | `56101` / `56304` / `56306` | Kategori **`A01`** (Budidaya Pertanian) / **`4776`** (Toko Obat Tani) |
| **SEWA LAHAN / RUKO** | Sewa Ruko, Sewa Rumah, Sewa Kios, Sewa Lahan | `56101` / `56290` / `56400` | **`68112`** (Real Estat / Persewaan Properti) |
| **SEWA ALAT / TENDA** | Sewa Taratak Pesta, Sewa Tenda Pernikahan, Sewa Pelampung | `56102` / `56210` / `56290` | **`77291`** (Penyewaan Perlengkapan Acara - Kategori N) |

---

### C. Kategori L — Aktivitas Keuangan dan Asuransi

| Institusi / Kegiatan Usaha | KBLI Salah (Hasil Entri) | KBLI Seharusnya | Catatan & Regulasi BPS |
| :--- | :---: | :---: | :--- |
| **BRI LINK / Agen BRILink** | `64110` (Bank Sentral) / `64194` / `66125` | **`64199`** | Agen perbankan masuk **Perantara Moneter Lainnya YTDL**. |
| **Bank Umum Konvensional (BRI, BNI, Mandiri, Woori, dll.)** | `64191` (Koperasi) | **`64121`** | **Perbankan Umum Konvensional**. |
| **Bank Umum Syariah (BSI, Muamalat, BTPN Syariah)** | `64124` / `64192` | **`64122`** | **Perbankan Umum Syariah**. |
| **BPR (Bank Perekonomian Rakyat Konvensional)** | `64121` (Bank Umum) / `64191` | **`64123`** | **Perbankan Konvensional Lainnya (BPR)** (meski berbentuk PT/koperasi). |
| **BPRS (BPR Syariah)** | `64122` / `64192` | **`64124`** | **Perbankan Syariah Lainnya (BPRS)**. |
| **Koperasi Simpan Pinjam (KSP Konvensional)** | `64124` / `64193` | **`64191`** | **Pemberian Kredit oleh Koperasi Konvensional**. |
| **KSPPS / BMT / Koperasi Syariah** | `64122` / `64194` | **`64192`** | **Pemberian Kredit oleh Koperasi Syariah**. |
| **PT Pegadaian (Persero)** | `64121` (Bank Umum) | **`64953`** | **Aktivitas Gadai Konvensional**. |
| **Gadai Perorangan** | `64953` | **`64959`** | **Aktivitas Pemberian Kredit Lainnya YTDL**. |
| **Leasing / Multifinance (FIF, BFI, NSC, Mega Finance)** | `64121` / `64191` / `64193` / `64953` | **`64910`** | **Aktivitas Sewa Guna Usaha Finansial (Leasing)**. |
| **Pembiayaan Mikro Konvensional (PNM Mekaar)** | `64191` (Koperasi) | **`64193`** | **Pembiayaan Mikro Konvensional Nonperbankan**. |
| **Pembiayaan Mikro Syariah (PNM Mekaar Syariah / BWM)** | `64192` (Koperasi) | **`64194`** / **`64959`** | **Pembiayaan Mikro Syariah Nonperbankan**. |
| **Bank Keliling / Rentenir Perorangan** | `64191` / `64193` | **`64959`** | **Aktivitas Pemberian Kredit Lainnya YTDL**. |
| **P2P Lending / Pinjol Legal (Amartha, dsb)** | `64191` | **`66161`** | **Intermediasi Pinjam Meminjam Berbasis TI**. |
| **Sewa Lahan / Sewa Ruko / Sewa Alfamart** | `64910` (Sewa Guna Finansial) | **`68112`** | Bukan leasing finansial, melainkan **Real Estat (68112)**. |
| **Kredit Sembako / Kredit Barang** | `64959` | **`47112`** / **`47192`** | Inti usaha adalah **Perdagangan Eceran Barang**, bukan lembaga kredit. |
| **Money Changer (66125)** | Digunakan untuk Warkop / Sembako / Saham | **`56303`** / **`47112`** / **`64994`** | `66125` hanya untuk **Pedagang Valuta Asing**. |

---

### D. Kategori M (Aktivitas Real Estat) & S (Olahraga, Hiburan, Rekreasi)

| Nama Usaha / Uraian Kegiatan | KBLI Salah (Hasil Entri) | KBLI Seharusnya | Alasan Koreksi BPS |
| :--- | :---: | :---: | :--- |
| **Kos / Kost (Kos Pak Djuremi, Kos Hijau, Kos Aliyah)** | `68112` | **`55909`** | Usaha Kos-Kosan masuk ke Kategori **I (Akomodasi 55909)**, bukan Real Estat M68112. |
| **68121 Pengelolaan Kawasan Pariwisata** (diisi Jasa Las Mobil) | `68121` | **`33111`** / **`4520`** | Reparasi & las mobil masuk kategori C/G. |
| **68121 Pengelolaan Kawasan Pariwisata** (diisi Sewa Lahan Wisata) | `68121` | **`68112`** / **`9329`** | Penyewaan tanah/lahan masuk Real Estat (68112). |
| **68121 Pengelolaan Kawasan Pariwisata** (diisi Wisata Alam Terbuka / Waduk) | `68121` | **`9329`** | Objek daya tarik wisata alam terbuka masuk **9329**. |
| **Tambak Fishing / Kolam Pemancingan Rekreasi** | `93193` (Perburuan Kawasan Buru) | **`93293`** | Kolam pancing rekreasi masuk **93293** (Daya Tarik Rekreasi Lainnya). |
| **Mencari Telur Serangga (Kroto) / Pakan Burung di Hutan** | `93193` | **`0220`** / **`0172`** | Pengumpulan hasil hutan bukan kayu / perburuan liar Kategori A. |
| **Petani Murni (Budidaya Cabai, Bayam, Padi, Bawang)** | `93296` (Wisata Agro) | Kategori **`A01`** | Jika murni budidaya tanpa wahana wisata/rekreasi, wajib masuk Kategori A. |

---

## 3. 📊 Pemeriksaan Anomali Data Kuantitatif SE2026

Berikut adalah formula dan batasan anomali kuantitatif yang dipantau oleh Direktorat Statistik Jasa BPS:

### 1. Anomali Aritmetika Blok Kuisioner (Kategori I Subgolongan 56)
- **Cek 1 (Tenaga Kerja)**:
  $$\Delta_{\text{pekerja}} = |R.224.c1 - R.224.c2|$$
  Jika $\Delta_{\text{pekerja}} \neq 0 \rightarrow$ **FLAG ANOMALI**: Inkonsistensi rincian gender vs jenis pembayaran.
- **Cek 2 (Pendapatan)**:
  $$\Delta_{\text{pendapatan}} = |R.227.c - (R.227.a + R.227.b)|$$
  Jika $\Delta_{\text{pendapatan}} > 100 \rightarrow$ **FLAG ANOMALI**: Total pendapatan tidak sama dengan rincian (a+b).
- **Cek 3 (Pengeluaran)**:
  $$\Delta_{\text{pengeluaran}} = |R.226.f - (R.226.a + R.226.b + R.226.c + R.226.d + R.226.e)|$$
  Jika $\Delta_{\text{pengeluaran}} > 100 \rightarrow$ **FLAG ANOMALI**: Total pengeluaran tidak sama dengan jumlah komponen rincian (a s.d. e).
- **Cek 4 (Pekerja Dibayar vs Upah)**:
  $$\text{Jika } R.224.a2 > 0 \text{ dan } R.226.a = 0 \rightarrow \text{\textbf{FLAG ANOMALI}}$$
  Ada pekerja dibayar tetapi pengeluaran upah/gaji dicatat Rp 0.
- **Cek 5 (Nilai Dummy Rp 100.000)**:
  $$\text{Jika } R.227.c = 100.000 \text{ atau } R.226.f = 100.000 \rightarrow \text{\textbf{FLAG DUMMY}}$$
  Terindikasi pengisian data tiruan (*dummy data*) oleh petugas.

### 2. Anomali Rasio Ekonomi & Outlier Ekstrem
- **NTB Negatif**:
  $$\text{NTB} = \text{Total Pendapatan} - \text{Total Pengeluaran} < 0$$
  Usaha merugi ekstrem yang tidak wajar secara struktural statistik.
- **Upah/Gaji per Tenaga Kerja di Bawah Batas Layak (< Rp 100.000,-)**:
  $$\text{Rasio Upah} = \frac{\text{Total Upah (R.226.a)}}{\text{Total Tenaga Kerja (R.224.c)}} < 100.000$$
  Indikasi salah satuan (ribuan rupiah tidak dikalikan) atau entri tidak wajar.
- **Rasio NTB terhadap Output = 1,00**:
  $$\frac{\text{NTB}}{\text{Total Pendapatan}} = 1{,}00 \quad (\text{Biaya Antara} = 0)$$
  Tidak realistis dalam operasi usaha komersial (tidak mencatat biaya produksi/operasional sama sekali).
- **Rasio Upah terhadap NTB Ekstrem (> 1,00 atau Negatif)**:
  $$\text{Rasio Upah/NTB} = \frac{\text{Total Upah}}{\text{NTB}} > 1{,}00 \quad \text{atau} \quad < 0$$
  Biaya tenaga kerja melebihi nilai tambah yang dihasilkan perusahaan.

---

## 4. 🛠️ Prosedur Audit Otomatis dengan Skrip Python

Gunakan modul `scripts/cek_anomali_kbli.py` untuk mengaudit file Excel dari PANTAU atau kuesioner FASIH SM:

```powershell
# Jalankan audit berkas Excel:
python .agents/skills/pengecekan-anomali-kbli/scripts/cek_anomali_kbli.py --input "D:\data_anomali.xlsx" --output "D:\hasil_audit_kbli.xlsx"
```

Skrip akan memeriksa setiap baris dan menambahkan kolom:
1. `KBLI_Awal`: Kode KBLI saat ini di dokumen.
2. `KBLI_Rekomendasi`: Kode KBLI yang benar sesuai pedoman Statistik Jasa BPS.
3. `Perlu_Ganti_KBLI`: `YA` / `TIDAK`.
4. `Alasan_Koreksi`: Penjelasan standar konsep BPS.
5. `Flag_Anomali_Aritmetika`: Deteksi selisih R224, R226, R227, atau Upah=0.
6. `Flag_Rasio_Ekstrem`: Deteksi NTB negatif, Upah < 100rb, Rasio = 1.00.
7. `Rekomendasi_Action`: `#DC_01` (Ganti KBLI), `#1` (Koreksi Angka), atau `#DC_00` (Konfirmasi Wajar).

---

## 5. 📚 Referensi Pendukung
- [aturan-kesalahan-kbli-jasa.md](./references/aturan-kesalahan-kbli-jasa.md) — Kamus lengkap pola kesalahan KBLI kategori Jasa (55, 56, L, M, S, T) beserta keyword negasi.
- [indikator-anomali-data-se2026.md](./references/indikator-anomali-data-se2026.md) — Rincian indikator kuantitatif dashboard monitoring SE2026 dan ambang batas anomali.

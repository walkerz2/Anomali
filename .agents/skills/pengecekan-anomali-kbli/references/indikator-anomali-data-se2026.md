# Rincian Indikator Anomali Data SE2026 (Direktorat Statistik Jasa BPS)

Dokumen ini memuat seluruh parameter matematis, batas toleransi, dan formula pendeteksian anomali data hasil pencacahan Sensus Ekonomi 2026 (SE2026) di lingkungan **Direktorat Statistik Jasa BPS**.

---

## 1. 🧮 Daftar 5 Cek Inkonsistensi Aritmetika Kuisioner

| ID Uji | Variabel Terkait | Formula & Kondisi Anomali | Dampak / Makna Kesalahan |
| :---: | :--- | :--- | :--- |
| **ARIT-1** | Tenaga Kerja Gender vs Pembayaran | `R.224.c1 ≠ R.224.c2` | Total pekerja laki-laki + perempuan tidak sama dengan jumlah pekerja dibayar + tidak dibayar. |
| **ARIT-2** | Penjumlahan Pendapatan | `R.227.c ≠ (R.227.a + R.227.b)` | Total pendapatan tidak cocok dengan penjumlahan omzet barang/jasa (a) dan pendapatan lainnya (b). |
| **ARIT-3** | Penjumlahan Pengeluaran | `R.226.f ≠ (R.226.a + R.226.b + R.226.c + R.226.d + R.226.e)` | Total biaya tidak cocok dengan penjumlahan upah (a), bahan baku (b), dagangan (c), operasional (d), dan non-ops (e). |
| **ARIT-4** | Pekerja Dibayar Tanpa Upah | `R.224.a2 > 0 DAN R.226.a = 0` | Mengakui memiliki tenaga kerja yang digaji, tetapi total upah/gaji dilaporkan Rp 0 (nol). |
| **ARIT-5** | Nilai Dummy Seragam Rp 100.000 | `R.227.c = 100.000 ATAU R.226.f = 100.000` | Indikasi petugas mengisi data tiruan (*dummy entri*) untuk sekadar meloloskan validasi sistem. |

---

## 2. 📈 Indikator Rasio Ekstrem & Outlier Wilayah

### 1. Nilai Tambah Bruto (NTB) Negatif
- **Definisi**: $\text{NTB} = \text{Total Pendapatan (R.227.c)} - \text{Total Pengeluaran (R.226.f)}$
- **Ambang Anomali**: $\text{NTB} < 0$
- **Contoh Temuan Nasional**:
  - Kab. Jeneponto (Sulawesi Selatan): Sektor 55 memiliki NTB sebesar **-Rp 553.374.829**.
  - Tuban (Jawa Timur): Sektor J59 memiliki NTB sebesar **-Rp 8.146.114.998**.
  - Kepulauan Anambas: Sektor J60 memiliki NTB sebesar **-Rp 137.000.000**.
  - Tolikara (Papua Pegunungan): Sektor K (Infokom) NTB rata-rata **-Rp 50.150.000 per usaha**.
  - Pulau Morotai (Maluku Utara): Sektor M68 (Real Estat) NTB **-Rp 7.581.740.340**.

---

### 2. Upah dan Gaji per Tenaga Kerja Ekstrem Rendah (< Rp 100.000,-)
- **Definisi**: $\text{Upah per Pekerja} = \frac{\text{Total Upah dan Gaji (R.226.a)}}{\text{Total Pekerja (R.224.c)}}$
- **Ambang Anomali**: $\text{Upah per Pekerja} < \text{Rp 100.000 per tahun/bulan}$
- **Contoh Temuan Nasional**:
  - Dairi: Rp 95.238 per tenaga kerja.
  - Kuantan Singingi: Rp 31.250 per tenaga kerja.
  - Sumba Barat Daya: Rp 32.000 per tenaga kerja.
  - Maluku Tengah: Rp 18.181 per tenaga kerja.
  - Nduga, Lanny Jaya, Mamberamo Tengah: Total upah = Rp 0 untuk sektor reparasi T95.
- **Penyebab**: Petugas salah membaca satuan uang (misalnya mengisi dalam satuan ribuan rupiah padahal kuisioner FASIH meminta nominal rupiah penuh).

---

### 3. Rasio NTB terhadap Total Output = 1,00 (Biaya Antara Nol)
- **Definisi**: $\text{Rasio Output} = \frac{\text{NTB}}{\text{Total Output / Pendapatan}}$
- **Ambang Anomali**: $\text{Rasio Output} = 1{,}00$ (Persis 100% tanpa pengeluaran operasional/bahan baku sama sekali).
- **Contoh Temuan Nasional**:
  - Kabupaten Aceh Barat: Sektor J58 (Penerbitan) memiliki rasio 1,00 (Pendapatan Rp 528.000.000, NTB Rp 525.600.000).
- **Penyebab**: Pengeluaran operasional di Rincian 26 tidak diisi atau dicatat Rp 0 oleh responden/petugas.

---

### 4. Rasio Upah terhadap NTB yang Ekstrem Tinggi (> 1,00) atau Negatif
- **Definisi**: $\text{Rasio Upah-NTB} = \frac{\text{Total Upah (R.226.a)}}{\text{NTB}}$
- **Ambang Wajar Sektor Jasa**: Umumnya berkisar antara **0,15 s.d. 0,60** (15% – 60% dari nilai tambah digunakan untuk gaji).
- **Ambang Anomali**:
  - **Ekstrem Besar (> 1,00)**: Upah melebihi seluruh nilai tambah ekonomi yang diciptakan (contoh: Manado rasio 15,49; Pulau Morotai 1,91; Kep. Anambas 1,66).
  - **Ekstrem Negatif (< 0)**: Disebabkan oleh NTB yang bernilai minus (contoh: Jeneponto rasio -5,63).
  - **Ekstrem Kecil (< 0,02)**: Upah nyaris 0 dibandingkan nilai tambah (contoh: Musi Rawas Utara 0,01; Barru 0,01; Mahakam Ulu 0,02).

---

### 5. Outlier Omzet & Nilai Tambah per Usaha Ekstrem Masif
- **Contoh Temuan Nasional**:
  - Kab. Bintan (Kepulauan Riau): Sektor 55 omzet rata-rata mencapai **Rp 18.240.891.153 per usaha**.
  - Jakarta Pusat: Sektor J (Infokom) rata-rata omzet **Rp 70.911.728.711 per usaha**.
  - Tasikmalaya: Sektor K (Infokom) omzet rata-rata **Rp 120.019.750.515 per usaha**.
  - Halmahera Tengah: Sektor M68 (Real Estat) omzet rata-rata **Rp 137.038.806.584 per usaha**.
  - Bengkalis & Pekanbaru: Sektor T95 (Bengkel/Reparasi) omzet mencapai **Rp 5,5 Miliar per usaha**.
- **Tindak Lanjut**: Konfirmasi ulang apakah responden memang perusahaan skala konglomerasi/holding besar atau terjadi pengetikan digit 0 berlebih (*fat-finger error*).

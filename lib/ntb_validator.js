/**
 * TUNTAS SE2026 — NTB Validator & Imputation Engine
 * Porting lengkap dari Skill validasi-ntb (Python) ke JavaScript murni (Client-Side).
 * 
 * Fitur:
 * 1. Kalkulasi mandiri Total Pendapatan, Total Pengeluaran, NTB riil, dan Rasio NTB (%).
 * 2. Pemetaan Kategori KBLI (A s.d. V) dan rentang wajar resmi BPS.
 * 3. Klasifikasi Status: #0 (Valid/Wajar) vs #1 (Anomali/Perlu Perbaikan).
 * 4. Rekomendasi imputasi variabel (r26c, r26b, r26d, r27a) dan nominal baru secara presisi.
 * 5. Ekspor Excel multi-sheet (Master Validasi, Panduan Imputasi #1, dan Format API Ubah Variabel).
 * 6. Konversi langsung hasil validasi ke antrian kerja bot FASIH SM.
 */

(function (global) {
  'use strict';

  // 1. Rentang Rasio NTB & Target Titik Tengah Wajar per Kategori KBLI
  const KBLI_RANGES = {
    'A': { nama: 'Pertanian, Kehutanan, dan Perikanan', min: 19.0, max: 30.0, target: 25.0, defaultVar: 'r26b', varLabel: 'Biaya Bahan Baku / Pakan / Bibit (R26b)' },
    'B': { nama: 'Pertambangan dan Penggalian', min: 28.0, max: 81.0, target: 50.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'C': { nama: 'Industri Pengolahan', min: 33.0, max: 67.0, target: 45.0, defaultVar: 'r26b', varLabel: 'Biaya Bahan Baku / Produksi (R26b)' },
    'D': { nama: 'Pengadaan Listrik, Gas, Uap/Air Panas, Udara Dingin', min: 13.0, max: 68.0, target: 35.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'E': { nama: 'Pengelolaan Air, Limbah, Penanganan Limbah, Remediasi', min: 29.0, max: 47.0, target: 38.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'F': { nama: 'Konstruksi', min: 34.0, max: 44.0, target: 39.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'G': { nama: 'Perdagangan Besar dan Eceran; Reparasi Mobil & Motor', min: 7.0, max: 60.0, target: 30.0, defaultVar: 'r26c', varLabel: 'Biaya Pembelian Barang Dagangan (R26c)' },
    'H': { nama: 'Transportasi dan Pergudangan', min: 7.0, max: 60.0, target: 35.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional - BBM & Servis (R26d)' },
    'I': { nama: 'Penyediaan Akomodasi dan Makan Minum', min: 7.0, max: 60.0, target: 35.0, defaultVar: 'r26b', varLabel: 'Biaya Bahan Makanan/Minuman (R26b)' },
    'J': { nama: 'Informasi dan Komunikasi (Penerbitan, Penyiaran, Konten)', min: 7.0, max: 60.0, target: 35.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'K': { nama: 'Aktivitas Telekomunikasi, Komputer, Jasa Informasi', min: 7.0, max: 60.0, target: 30.0, defaultVar: 'r26c', varLabel: 'Biaya Pembelian Pulsa/Voucher (R26c)' },
    'L': { nama: 'Aktivitas Keuangan dan Asuransi', min: 15.0, max: 100.0, target: 25.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'M': { nama: 'Aktivitas Real Estat', min: 15.0, max: 100.0, target: 25.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'N': { nama: 'Aktivitas Profesional, Ilmiah, dan Teknis', min: 15.0, max: 100.0, target: 30.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'O': { nama: 'Aktivitas Administratif dan Penunjang Usaha', min: 15.0, max: 100.0, target: 30.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'P': { nama: 'Administrasi Pemerintahan, Pertahanan, Jamsostek', min: 15.0, max: 100.0, target: 25.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'Q': { nama: 'Aktivitas Pendidikan', min: 15.0, max: 100.0, target: 25.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'R': { nama: 'Aktivitas Kesehatan Manusia dan Sosial', min: 15.0, max: 100.0, target: 25.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'S': { nama: 'Kesenian, Olahraga, dan Rekreasi', min: 15.0, max: 100.0, target: 30.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'T': { nama: 'Aktivitas Jasa Lainnya', min: 15.0, max: 100.0, target: 30.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'U': { nama: 'Aktivitas Rumah Tangga Pemberi Kerja', min: 15.0, max: 100.0, target: 25.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' },
    'V': { nama: 'Aktivitas Badan Internasional', min: 15.0, max: 100.0, target: 25.0, defaultVar: 'r26d', varLabel: 'Biaya Operasional (R26d)' }
  };

  // 2. Inferensi Kategori KBLI berdasarkan Nama dan Jenis Usaha
  function guessKbli(namaUsaha) {
    const n = String(namaUsaha || '').toLowerCase();

    if (['warung makan', 'rumah makan', 'resto', 'kafe', 'cafe', 'warkop', 
         'coto', 'bakso', 'batagor', 'nasi kuning', 'nasi campur', 
         'nasi goreng', 'catering', 'jual kue', 'kue tradisional', 
         'pisang ijo', 'gorengan', 'kedai kopi', 'penjual makanan'].some(k => n.includes(k))) {
      return 'I';
    }
    if (['bentor', 'becak', 'pete pete', 'pete-pete', 'ojek', 'sopir', 
         'driver', 'angkot', 'ekspedisi', 'kurir', 'pengangkutan', 
         'perahu', 'kapal', 'angkutan sewa', 'sewa bentor'].some(k => n.includes(k))) {
      return 'H';
    }
    if (['konter pulsa', 'jual pulsa', 'kartu data', 'kuota', 'warnet', 
         'wifi koin', 'servis komputer', 'pulsa inna'].some(k => n.includes(k))) {
      return 'K';
    }
    if (['genprint', 'citra print', 'percetakan', 'sablon', 'fotokopi', 
         'studio foto', 'video shooting', 'shooting'].some(k => n.includes(k))) {
      return 'J';
    }
    if (['konstruksi', 'kontruksi', 'tukang batu', 'tukang kayu', 
         'borongan bangunan', 'pemborong', 'mandor'].some(k => n.includes(k))) {
      return 'F';
    }
    if (['pamsimas', 'air bersih', 'kelola limbah', 'pengolahan sampah', 'sedot tinja'].some(k => n.includes(k))) {
      return 'E';
    }
    if (['klinik', 'kesehatan', 'bidan', 'dokter', 'praktik dokter', 
         'puskesmas', 'apotek', 'terapi', 'fisioterapi', 'khitan'].some(k => n.includes(k))) {
      return 'R';
    }
    if (['barbershop', 'salon', 'pangkas rambut', 'laundry', 'jahit', 
         'penjahit', 'servis hp', 'servis tv', 'reparasi elektronik', 
         'reparasi jam'].some(k => n.includes(k))) {
      return 'T';
    }
    if (['parut kelapa', 'mebel', 'penggilingan padi', 'pabrik gabah', 
         'pabrik gaba', 'konveksi', 'kerajinan', 'pandai besi', 
         'produksi kerupuk', 'bengkel las', 'pembuatan'].some(k => n.includes(k))) {
      return 'C';
    }
    if (['ngamen', 'senam', 'sanggar seni', 'sewa lapangan', 'futsal', 'rental ps', 'playstation'].some(k => n.includes(k))) {
      return 'S';
    }
    if (['koperasi', 'simpan pinjam', 'brilink', 'bri link', 'agen bank', 'laku pandai'].some(k => n.includes(k))) {
      return 'L';
    }
    if (['jual', 'jualan', 'kios', 'toko', 'warung', 'kelontong', 
         'campuran', 'eceran', 'pedagang', 'agen', 'distributor', 
         'olshop', 'online shop', 'bengkel motor', 'bengkel mobil', 
         'sembako', 'lpg', 'gas 3kg', 'beras'].some(k => n.includes(k))) {
      return 'G';
    }
    if (['utp', 'ternak', 'itik', 'sapi', 'kambing', 'tambak', 
         'empang', 'nelayan', 'petani', 'tani', 'padi', 'jagung', 
         'rumput laut', 'kebun', 'sawah', 'budidaya', 'kolam ikan', 
         'bebek', 'petelur', 'peternak'].some(k => n.includes(k))) {
      return 'A';
    }
    return 'G'; // default UMKM umum
  }

  // 3. Helper Parsing Angka & Nilai Bersih
  function parseNum(val) {
    if (val === null || val === undefined || val === '' || val === '&nbsp;') return 0.0;
    const clean = String(val).replace(/,/g, '').replace(/[^\d.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0.0 : num;
  }

  function roundTenThousand(val) {
    return Math.round(val / 10000) * 10000;
  }

  function formatRp(num) {
    return 'Rp ' + Math.round(num || 0).toLocaleString('id-ID');
  }

  function getVal(row, ...candidates) {
    if (!row) return '';
    const normCandidates = candidates.map(c => c.toLowerCase().replace(/[\s_&.\-]+/g, ''));
    for (const k of Object.keys(row)) {
      const nk = k.toLowerCase().replace(/[\s_&.\-]+/g, '');
      if (normCandidates.includes(nk)) {
        return row[k];
      }
    }
    return '';
  }

  // 4. Perhitungan Imputasi dan Status per Baris Data
  function calculateRowImputation(row, defaultPeriodeId = 'fd68e454-ba45-4b85-8205-f3bf777ded24') {
    const namaUsaha = getVal(row, 'Nama Usaha', 'nama_usaha', 'nama', 'usaha');
    const assignmentId = getVal(row, 'Assignment ID', 'assignment_id', 'id_assignment', 'id');
    const surveyPeriodId = getVal(row, 'Survey Period ID', 'survey_period_id', 'periode_id') || defaultPeriodeId;
    const kecamatan = getVal(row, 'Kecamatan', 'kecamatan');
    const desa = getVal(row, 'Desa/Kel', 'desa', 'desa_kel', 'kelurahan');
    const no = getVal(row, 'No', 'no', 'nomor');

    let linkFasih = getVal(row, 'Link Edit FASIH', 'link_edit_fasih', 'link_fasih_sm', 'link_fasih', 'link');
    if (!linkFasih && assignmentId && surveyPeriodId) {
      linkFasih = `https://fasih-sm.bps.go.id/app/assignment/${surveyPeriodId}/${assignmentId}/edit`;
    }

    const pengeluaran = parseNum(getVal(row, 'Total Pengeluaran', 'total_pengeluaran', 'pengeluaran', 'biaya'));
    const pendBj = parseNum(getVal(row, 'Pendapatan Barang & Jasa', 'pendapatan_barang_jasa', 'pendapatan_bj', 'pend_bj', 'pendapatan', 'r27a'));
    const pendLain = parseNum(getVal(row, 'Pendapatan Lainnya', 'pendapatan_lainnya', 'pendapatan_lain', 'pend_lain'));
    const totalAset = parseNum(getVal(row, 'Total Aset', 'total_aset', 'aset'));
    const rasioSistem = parseNum(getVal(row, 'Rasio NTB', 'rasio_ntb', 'rasio_sistem', 'rasio_sistem_pct', 'rasio'));

    const totalPendapatan = pendBj + pendLain;
    const ntbHitung = totalPendapatan - pengeluaran;
    const rasioHitung = totalPendapatan > 0 ? (ntbHitung / totalPendapatan) * 100.0 : 0.0;

    const katKbli = guessKbli(namaUsaha);
    const infoKbli = KBLI_RANGES[katKbli] || KBLI_RANGES['G'];
    const minWajar = infoKbli.min;
    const maxWajar = infoKbli.max;
    const targetRasio = infoKbli.target;

    // Evaluasi Status #0 vs #1
    let status = '#0';
    let diagnosa = '';

    if (totalPendapatan <= 0) {
      status = '#1';
      diagnosa = 'Pendapatan bernilai Rp 0 atau kosong';
    } else if (rasioHitung < 0) {
      status = '#1';
      diagnosa = `Rasio negatif (${rasioHitung.toFixed(2)}%): Pengeluaran melebihi Pendapatan (rugi tidak wajar)`;
    } else if (rasioHitung === 0.0) {
      status = '#1';
      diagnosa = `Rasio 0% (Impas): Pengeluaran dicatat sama persis dengan Pendapatan`;
    } else if (rasioHitung < minWajar) {
      status = '#1';
      diagnosa = `Rasio terlalu rendah (${rasioHitung.toFixed(2)}% < batas bawah ${minWajar.toFixed(1)}%)`;
    } else if (rasioHitung > maxWajar) {
      status = '#1';
      diagnosa = `Rasio terlalu tinggi (${rasioHitung.toFixed(2)}% > batas atas ${maxWajar.toFixed(1)}%)`;
    } else {
      status = '#0';
      diagnosa = `Sesuai batas wajar (${rasioHitung.toFixed(2)}% dalam rentang ${minWajar}% - ${maxWajar}%)`;
    }

    // Deteksi mismatch display sistem PANTAU (misal display 100% atau 975% padahal riilnya wajar)
    const isMismatch = status === '#0' && Math.abs(rasioSistem - rasioHitung) > 5.0;
    if (isMismatch) {
      diagnosa += ` | Mismatch sistem: Kolom sistem mencatat ${rasioSistem.toFixed(1)}% (salah display), hitungan riil ${rasioHitung.toFixed(2)}%`;
    }

    // Hitung Rekomendasi Imputasi Variabel & Nilai Baru
    let varUbah = '-';
    let dataKeyUbah = '';
    let valLama = pengeluaran;
    let valBaru = pengeluaran;
    let targetPengBaru = pengeluaran;
    let targetPendBaru = totalPendapatan;
    let ntbBaru = ntbHitung;
    let rasioBaru = rasioHitung;
    let instruksi = 'Data sudah sesuai standar wajar, tidak perlu ada variabel yang diubah.';
    let catatanFasih = '#0';

    if (status === '#1') {
      if (totalPendapatan <= 0) {
        varUbah = 'Pendapatan Barang & Jasa (R27a)';
        dataKeyUbah = 'r27a';
        valLama = 0.0;
        valBaru = Math.max(totalAset * 0.5, 3000000.0);
        targetPengBaru = roundTenThousand(valBaru * (1.0 - targetRasio / 100.0));
        targetPendBaru = valBaru;
        ntbBaru = targetPendBaru - targetPengBaru;
        rasioBaru = (ntbBaru / targetPendBaru) * 100.0;
        instruksi = `Isi Pendapatan (R27a) = ${formatRp(valBaru)} dan Pengeluaran (R26) = ${formatRp(targetPengBaru)}`;
        catatanFasih = '#1';
      } else if (rasioHitung > targetRasio) {
        targetPengBaru = roundTenThousand(totalPendapatan * (1.0 - targetRasio / 100.0));
        targetPendBaru = totalPendapatan;
        valLama = pengeluaran;
        valBaru = targetPengBaru;
        ntbBaru = totalPendapatan - targetPengBaru;
        rasioBaru = (ntbBaru / totalPendapatan) * 100.0;

        if (katKbli === 'G' || katKbli === 'K') {
          varUbah = infoKbli.varLabel;
          dataKeyUbah = 'r26c';
        } else if (katKbli === 'A' || katKbli === 'C' || katKbli === 'I') {
          varUbah = infoKbli.varLabel;
          dataKeyUbah = 'r26b';
        } else {
          varUbah = infoKbli.varLabel;
          dataKeyUbah = 'r26d';
        }
        instruksi = `Ubah ${varUbah} menjadi ${formatRp(valBaru)}`;
        catatanFasih = '#1';
      } else {
        // Rasio terlalu rendah (< batas bawah) atau Impas (0%)
        if (pendLain > 0 && totalPendapatan > 0 && rasioHitung < 10.0) {
          varUbah = 'Pendapatan B&J (R27a)';
          dataKeyUbah = 'r27a';
          targetPendBaru = pendBj + pendLain;
          valLama = pendBj;
          valBaru = targetPendBaru;
          targetPengBaru = roundTenThousand(targetPendBaru * (1.0 - targetRasio / 100.0));
          ntbBaru = targetPendBaru - targetPengBaru;
          rasioBaru = (ntbBaru / targetPendBaru) * 100.0;
          instruksi = `Pindahkan Pendapatan Lainnya ke R27a (Total ${formatRp(valBaru)}) & sesuaikan R26 menjadi ${formatRp(targetPengBaru)}`;
          catatanFasih = '#1';
        } else {
          targetPengBaru = roundTenThousand(totalPendapatan * (1.0 - targetRasio / 100.0));
          targetPendBaru = totalPendapatan;
          valLama = pengeluaran;
          valBaru = targetPengBaru;
          ntbBaru = totalPendapatan - targetPengBaru;
          rasioBaru = (ntbBaru / totalPendapatan) * 100.0;

          if (katKbli === 'G' || katKbli === 'K') {
            varUbah = infoKbli.varLabel;
            dataKeyUbah = 'r26c';
          } else if (katKbli === 'A' || katKbli === 'C' || katKbli === 'I') {
            varUbah = infoKbli.varLabel;
            dataKeyUbah = 'r26b';
          } else {
            varUbah = infoKbli.varLabel;
            dataKeyUbah = 'r26d';
          }
          instruksi = `Ubah ${varUbah} dari ${formatRp(valLama)} menjadi ${formatRp(valBaru)}`;
          catatanFasih = '#1';
        }
      }
    }

    return {
      no,
      assignmentId,
      surveyPeriodId,
      kecamatan,
      desa,
      namaUsaha,
      kategoriKbli: katKbli,
      namaKbli: infoKbli.nama,
      rangeAcuan: `${minWajar}% – ${maxWajar}%`,
      pengeluaran,
      pendapatanBj: pendBj,
      pendapatanLain: pendLain,
      totalPendapatan,
      totalAset,
      ntbHitung,
      rasioHitungPct: parseFloat(rasioHitung.toFixed(2)),
      rasioSistemPct: parseFloat(rasioSistem.toFixed(2)),
      status,
      diagnosa,
      varUbah,
      dataKeyUbah,
      valLama,
      valBaru,
      targetPengBaru,
      targetPendBaru,
      ntbBaru,
      rasioBaruPct: parseFloat(rasioBaru.toFixed(2)),
      instruksi,
      catatanFasih,
      linkFasih,
      originalRow: row
    };
  }

  // 5. Validasi Sekumpulan Baris Data
  function validateNtbDataset(rows, defaultPeriodeId) {
    if (!Array.isArray(rows) || rows.length === 0) return { items: [], summary: { total: 0, status0: 0, status1: 0 } };

    const items = rows.map((r, i) => {
      const res = calculateRowImputation(r, defaultPeriodeId);
      res.index = i;
      res.excelRowNum = i + 1;
      return res;
    });

    const status0Count = items.filter(x => x.status === '#0').length;
    const status1Count = items.filter(x => x.status === '#1').length;

    return {
      items,
      summary: {
        total: items.length,
        status0: status0Count,
        status1: status1Count,
        pctValid: items.length ? Math.round((status0Count / items.length) * 100) : 0,
        pctAnomali: items.length ? Math.round((status1Count / items.length) * 100) : 0
      }
    };
  }

  // 6. Buat File Excel Hasil Validasi (Multi-Sheet)
  function generateNtbWorkbook(results, XLSX) {
    if (!XLSX) throw new Error('SheetJS (XLSX) belum dimuat.');

    const wb = XLSX.utils.book_new();

    // Sheet 1: Master Validasi Seluruh Usaha
    const masterData = results.map(r => ({
      'No': r.no || r.excelRowNum,
      'Assignment ID': r.assignmentId,
      'Kecamatan': r.kecamatan,
      'Desa/Kel': r.desa,
      'Nama Usaha': r.namaUsaha,
      'Kategori KBLI': r.kategoriKbli,
      'Nama Sektor': r.namaKbli,
      'Rentang Wajar (%)': r.rangeAcuan,
      'Total Pengeluaran (Rp)': r.pengeluaran,
      'Pendapatan B&J (Rp)': r.pendapatanBj,
      'Pendapatan Lainnya (Rp)': r.pendapatanLain,
      'Total Pendapatan (Rp)': r.totalPendapatan,
      'Total Aset (Rp)': r.totalAset,
      'NTB Riil (Rp)': r.ntbHitung,
      'Rasio NTB Riil (%)': r.rasioHitungPct,
      'Rasio di Sistem (%)': r.rasioSistemPct,
      'Status': r.status,
      'Diagnosa Anomali': r.diagnosa,
      'Variabel Diubah': r.varUbah,
      'Nominal Baru (Rp)': r.valBaru,
      'Estimasi Rasio Baru (%)': r.rasioBaruPct,
      'Teks Catatan FASIH': r.catatanFasih,
      'Link Edit FASIH': r.linkFasih
    }));
    const wsMaster = XLSX.utils.json_to_sheet(masterData);
    XLSX.utils.book_append_sheet(wb, wsMaster, 'Master Validasi NTB');

    // Sheet 2: Khusus Status #1 (Panduan Imputasi & Perbaikan)
    const status1List = results.filter(r => r.status === '#1');
    const status1Data = status1List.map(r => ({
      'No': r.no || r.excelRowNum,
      'Assignment ID': r.assignmentId,
      'Kecamatan': r.kecamatan,
      'Nama Usaha': r.namaUsaha,
      'Kategori': r.kategoriKbli,
      'Total Pendapatan (Rp)': r.totalPendapatan,
      'Pengeluaran Lama (Rp)': r.pengeluaran,
      'Rasio Lama (%)': r.rasioHitungPct,
      'Variabel Yang Harus Diubah': r.varUbah,
      'DataKey': r.dataKeyUbah,
      'Nominal Baru Rekomendasi (Rp)': r.valBaru,
      'Estimasi Rasio Baru (%)': r.rasioBaruPct,
      'Instruksi Petugas': r.instruksi,
      'Catatan FASIH': r.catatanFasih,
      'link_fasih_sm': r.linkFasih
    }));
    const wsStatus1 = XLSX.utils.json_to_sheet(status1Data.length ? status1Data : [{ 'Info': 'Tidak ada data anomali status #1' }]);
    XLSX.utils.book_append_sheet(wb, wsStatus1, 'Panduan Imputasi #1');

    // Sheet 3: Siap Pakai untuk Menu API Ubah Variabel (TUNTAS SE2026)
    const apiData = status1List.map(r => {
      const rowObj = {
        'link_fasih_sm': r.linkFasih,
        'nama_usaha': r.namaUsaha,
        'kode_catatan': '#1'
      };
      // Isi kolom variabel yang diimputasi
      if (r.dataKeyUbah) {
        rowObj[r.dataKeyUbah] = r.valBaru;
      }
      return rowObj;
    });
    const wsApi = XLSX.utils.json_to_sheet(apiData.length ? apiData : [{ 'link_fasih_sm': '', 'nama_usaha': '', 'kode_catatan': '#1', 'r26c': '' }]);
    XLSX.utils.book_append_sheet(wb, wsApi, 'Template API Siap Pakai');

    return wb;
  }

  // 7. Konversi Hasil Validasi ke Format Antrian Bot TUNTAS
  function convertNtbToQueue(results, filterMode = 'ALL') {
    // filterMode: 'ALL' (status #0 & #1), 'ONLY_1' (hanya #1), 'ONLY_0' (hanya #0)
    let filtered = results;
    if (filterMode === 'ONLY_1') filtered = results.filter(r => r.status === '#1');
    if (filterMode === 'ONLY_0') filtered = results.filter(r => r.status === '#0');

    return filtered.map((r, idx) => {
      const link = r.linkFasih;
      let error = (!link || !/^https?:\/\//i.test(link)) ? 'Link FASIH tidak ditemukan atau tidak valid' : null;

      if (r.status === '#1' && r.dataKeyUbah) {
        // Mode API: Ubah nilai variabel kuesioner via API FASIH, lalu Kirim & Approve
        const apiValues = {};
        apiValues[r.dataKeyUbah] = String(r.valBaru);
        return {
          index: idx,
          excelRowNum: r.excelRowNum || (idx + 1),
          mode: 'API',
          link_fasih_sm: link,
          assignmentId: r.assignmentId,
          nama_usaha: r.namaUsaha || `Baris #${idx + 1}`,
          targetUsaha: r.namaUsaha,
          apiNoteCode: '#1',
          commentText: '#1',
          apiValues,
          apiRemarks: {},
          ntbInfo: {
            status: '#1',
            kategori: r.kategoriKbli,
            rasioLama: r.rasioHitungPct,
            rasioBaru: r.rasioBaruPct,
            varUbah: r.varUbah,
            valBaru: r.valBaru
          },
          status: error ? 'INVALID' : 'PENDING',
          error,
          originalRow: r.originalRow
        };
      } else {
        // Mode DC0: Cukup beri catatan konfirmasi #0 tanpa ubah angka, lalu Kirim & Approve
        return {
          index: idx,
          excelRowNum: r.excelRowNum || (idx + 1),
          mode: 'DC0',
          link_fasih_sm: link,
          assignmentId: r.assignmentId,
          nama_usaha: r.namaUsaha || `Baris #${idx + 1}`,
          targetUsaha: r.namaUsaha,
          commentText: '#0',
          dc0Target: 'nilai',
          ntbInfo: {
            status: '#0',
            kategori: r.kategoriKbli,
            rasio: r.rasioHitungPct
          },
          status: error ? 'INVALID' : 'PENDING',
          error,
          originalRow: r.originalRow
        };
      }
    });
  }

  // Export modul ke global object (window / self / globalThis / module)
  const validatorObj = {
    KBLI_RANGES,
    guessKbli,
    parseNum,
    formatRp,
    calculateRowImputation,
    validateNtbDataset,
    generateNtbWorkbook,
    convertNtbToQueue
  };

  global.NTB_VALIDATOR = validatorObj;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = validatorObj;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

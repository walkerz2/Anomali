#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cek_anomali_kbli.py
Skrip Otomatis Pemeriksaan Anomali KBLI & Validasi Data SE2026
Berdasarkan Pedoman Resmi Direktorat Statistik Jasa BPS RI.
"""

import sys
import os
import re
import argparse
from typing import Dict, List, Tuple, Optional, Any

# Pastikan konsol Windows UTF-8
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def parse_num(val: Any) -> float:
    if val is None or val == '' or str(val).strip() == '-':
        return 0.0
    clean = re.sub(r'[, ]', '', str(val))
    clean = re.sub(r'[^\d.-]', '', clean)
    try:
        return float(clean)
    except ValueError:
        return 0.0

def pad_kbli(val: Any) -> str:
    s = str(val or '').strip()
    if re.match(r'^\d{1,5}$', s):
        return s.zfill(5)
    return s

def audit_kbli_rule(nama_usaha: str, uraian_kegiatan: str, kbli_sekarang: str) -> Tuple[bool, str, str]:
    """
    Evaluasi nama dan uraian kegiatan usaha terhadap KBLI saat ini.
    Mengembalikan: (perlu_ganti, kbli_rekomendasi, alasan_koreksi)
    """
    text = f"{nama_usaha or ''} {uraian_kegiatan or ''}".lower()
    k_cur = pad_kbli(kbli_sekarang)

    # 1. KATEGORI I - GOLONGAN POKOK 55 (Penyediaan Akomodasi)
    if k_cur.startswith('55') or k_cur in ['55201', '55209', '55101', '55102', '55103', '55104', '55105', '55106', '55202', '55203']:
        if any(w in text for w in ['kos', 'kost', 'sewa kamar', 'kamar kost', 'asrama', 'mess']):
            if k_cur != '55909':
                return True, '55909', 'Kos-kosan/sewa kamar/asrama/mess beroperasi jangka panjang, seharusnya KBLI 55909 (Akomodasi Lainnya YTDL), bukan pondok wisata/hotel.'
        if any(w in text for w in ['kontrakan', 'sewa rumah', 'rumah kontrakan', 'bedeng']):
            return True, '68112', 'Kontrakan/sewa rumah/bedeng masuk Kategori M (Real Estat 68112: Penyewaan Bangunan & Lahan Hunian), bukan Kategori I.'
        if 'laundry' in text or 'cuci pakaian' in text:
            return True, '96100', 'Laundry/cuci pakaian masuk Kategori T (96100: Pencucian & Pembersihan Tekstil), bukan akomodasi.'
        if any(w in text for w in ['café', 'cafe', 'kedai kopi', 'warkop', 'rumah minum']):
            return True, '56303', 'Kafe/kedai kopi masuk Kategori I Golongan Pokok 56 (56303: Rumah Minum/Kafe).'
        if any(w in text for w in ['kantin', 'warung makan', 'kedai nasi', 'pecel', 'mie ayam', 'bakso']):
            return True, '56101', 'Kantin/warung makan masuk KBLI 56101 (Restoran/Warung Makan Permanen).'
        if any(w in text for w in ['sembako', 'kelontong', 'jual pulsa', 'mainan', 'baju']):
            return True, '47112', 'Usaha perdagangan eceran barang masuk Golongan Pokok 47, bukan akomodasi 55.'

    # 2. KATEGORI I - GOLONGAN POKOK 56 (Penyediaan Makanan Minuman - KEYWORD NEGASI)
    if k_cur.startswith('56') or k_cur in ['56101', '56102', '56210', '56290', '56301', '56302', '56303', '56304', '56305', '56306', '56400']:
        if 'sembako' in text:
            return True, '47112', 'Keyword negasi "SEMBAKO": Perdagangan eceran kebutuhan pokok selain swalayan (KBLI 47112), bukan penyedia makanan minuman.'
        if 'kelontong' in text:
            return True, '47112', 'Keyword negasi "KELONTONG": Toko/warung kelontong masuk Perdagangan Eceran (KBLI 47112).'
        if any(w in text for w in ['kamar kos', 'anak kos', 'kos-kosan', 'kost']):
            return True, '55909', 'Keyword negasi "KOS": Usaha kos-kosan masuk Penyediaan Akomodasi Lainnya YTDL (KBLI 55909).'
        if any(w in text for w in ['kontrakan', 'sewa rumah', 'sewa ruko', 'sewa kios', 'sewa lahan']):
            return True, '68112', 'Keyword negasi "SEWA PROPERTI": Persewaan rumah/ruko/kios masuk Aktivitas Real Estat (KBLI 68112).'
        if any(w in text for w in ['sewa tenda', 'taratak', 'alat hajat', 'perlengkapan pesta']):
            return True, '77291', 'Keyword negasi "SEWA TENDA": Persewaan alat pesta/tenda masuk KBLI 77291 (Penyewaan Perlengkapan Acara).'
        if any(w in text for w in ['pertanian', 'hortikultura', 'kebun karet', 'petani padi', 'tani jagung', 'toko obat pertanian', 'pupuk']):
            if 'toko' in text or 'pupuk' in text or 'obat' in text:
                return True, '47764', 'Perdagangan eceran pupuk dan obat pertanian masuk KBLI 47764.'
            return True, '01111', 'Keyword negasi "PERTANIAN": Budidaya tanaman pangan/perkebunan masuk Kategori A (Golongan Pokok 01).'

    # 3. KATEGORI L (Aktivitas Keuangan dan Asuransi)
    if k_cur.startswith('64') or k_cur.startswith('66'):
        if 'bri link' in text or 'brilink' in text or 'agen bank' in text:
            if k_cur != '64199':
                return True, '64199', 'Agen BRI Link/Laku Pandai masuk KBLI 64199 (Perantara Moneter Lainnya YTDL), bukan Bank Sentral (64110) atau Bank Umum.'
        if 'bpr' in text or 'bank perekonomian rakyat' in text or 'bank perkreditan rakyat' in text:
            if 'syariah' in text or 'bprs' in text:
                if k_cur != '64124':
                    return True, '64124', 'BPR Syariah (BPRS) masuk KBLI 64124 (Perbankan Syariah Lainnya).'
            else:
                if k_cur != '64123':
                    return True, '64123', 'BPR Konvensional masuk KBLI 64123 (Perbankan Konvensional Lainnya).'
        if any(w in text for w in ['bank mandiri', 'bank bni', 'bank bri', 'bank bca', 'bank woori', 'bank jateng', 'bank bjb']):
            if k_cur != '64121':
                return True, '64121', 'Bank Umum Konvensional masuk KBLI 64121 (Perbankan Umum Konvensional).'
        if any(w in text for w in ['bank syariah indonesia', 'bsi', 'bank muamalat', 'btpn syariah']):
            if k_cur != '64122':
                return True, '64122', 'Bank Umum Syariah masuk KBLI 64122 (Perbankan Umum Syariah).'
        if 'pegadaian' in text and ('pt' in text or 'persero' in text):
            if k_cur != '64953':
                return True, '64953', 'PT Pegadaian (Persero) masuk KBLI 64953 (Aktivitas Gadai Konvensional).'
        if any(w in text for w in ['fif', 'bfi finance', 'nsc finance', 'mega finance', 'oto finance']):
            if k_cur != '64910':
                return True, '64910', 'Perusahaan Leasing/Multifinance masuk KBLI 64910 (Aktivitas Sewa Guna Usaha Finansial).'
        if 'pnm mekaar' in text or 'pnm mekar' in text:
            if 'syariah' in text:
                return True, '64194', 'PNM Mekaar Syariah masuk KBLI 64194 (Pembiayaan Mikro Syariah Nonperbankan).'
            return True, '64193', 'PNM Mekaar Konvensional masuk KBLI 64193 (Pembiayaan Mikro Konvensional Nonperbankan).'
        if 'bank keliling' in text or 'rentenir' in text or 'gadai perorangan' in text:
            if k_cur != '64959':
                return True, '64959', 'Bank keliling/gadai perorangan masuk KBLI 64959 (Pemberian Kredit Lainnya YTDL).'
        if 'koperasi simpan pinjam' in text or 'ksp' in text:
            if 'syariah' in text or 'bmt' in text or 'kspps' in text:
                if k_cur != '64192':
                    return True, '64192', 'KSP Syariah/BMT masuk KBLI 64192 (Aktivitas Koperasi Syariah).'
            else:
                if k_cur != '64191':
                    return True, '64191', 'KSP Konvensional masuk KBLI 64191 (Aktivitas Koperasi Konvensional).'
        if any(w in text for w in ['sewa lahan', 'sewa ruko', 'sewa kios', 'sewa alfamart']):
            return True, '68112', 'Persewaan bangunan/tanah masuk Kategori M (Real Estat 68112), bukan sewa guna usaha finansial (64910).'

    # 4. KATEGORI M (Real Estat)
    if k_cur.startswith('68'):
        if any(w in text for w in ['kos', 'kost', 'kamar kos', 'anak kos']):
            return True, '55909', 'Usaha Kos-Kosan masuk Kategori I (Akomodasi 55909), bukan Real Estat 68112.'
        if k_cur == '68121': # Pengelolaan Kawasan Pariwisata
            if any(w in text for w in ['las mobil', 'bengkel las']):
                return True, '33111', 'Jasa las mobil/bengkel bukan pengelolaan kawasan pariwisata (KBLI 33111).'
            if any(w in text for w in ['lesehan', 'warung lesehan', 'pondok lesehan']):
                return True, '56101', 'Pondok lesehan makan minum masuk KBLI 56101.'
            if any(w in text for w in ['waduk', 'wisata alam', 'objek wisata']):
                return True, '93299', 'Wisata alam terbuka/daya tarik rekreasi masuk KBLI 93299.'

    # 5. KATEGORI S (Olahraga, Hiburan, Rekreasi)
    if k_cur.startswith('93'):
        if k_cur == '93193': # Perburuan di Kawasan Buru
            if any(w in text for w in ['pemancingan', 'kolam pancing', 'tambak fishing']):
                return True, '93293', 'Kolam pemancingan rekreasi masuk KBLI 93293 (Daya Tarik Rekreasi Pemancingan), bukan perburuan alam (93193).'
            if any(w in text for w in ['kroto', 'pakan burung', 'telur semut']):
                return True, '02209', 'Pencari kroto/telur serangga di hutan masuk KBLI 02209 (Hasil Hutan Bukan Kayu), bukan perburuan olahraga.'
        if k_cur == '93296': # Wisata Agro
            if any(w in text for w in ['petani', 'budidaya', 'tanaman pangan', 'cabai', 'bayam', 'kangkung', 'bawang', 'kebun sayur']) and not any(w in text for w in ['wisata', 'taman', 'rekreasi', 'petik sendiri']):
                return True, '01131', 'Budidaya tanaman sayuran/hortikultura murni tanpa wahana rekreasi masuk Kategori A (Pertanian 01131), bukan Wisata Agro.'

    return False, k_cur, 'KBLI sudah sesuai dengan analisis kata kunci konsep Direktorat Statistik Jasa.'

def audit_arithmetic_anomalies(row: Dict[str, Any]) -> List[str]:
    """Cek 5 aturan anomali aritmetika kuisioner BPS."""
    anomalies = []
    
    # 1. Tenaga Kerja: Gender vs Pembayaran
    p_gender = parse_num(row.get('R224_c1') or row.get('total_pekerja_gender') or row.get('pekerja_gender'))
    p_bayar = parse_num(row.get('R224_c2') or row.get('total_pekerja_bayar') or row.get('pekerja_bayar'))
    if p_gender > 0 and p_bayar > 0 and abs(p_gender - p_bayar) > 0.01:
        anomalies.append(f'ARIT-1: Total pekerja gender ({int(p_gender)}) ≠ pekerja pembayaran ({int(p_bayar)})')

    # 2. Pendapatan: Total vs Rincian a+b
    pend_total = parse_num(row.get('R227_c') or row.get('total_pendapatan') or row.get('pendapatan_total'))
    pend_a = parse_num(row.get('R227_a') or row.get('pendapatan_bj') or row.get('r27a'))
    pend_b = parse_num(row.get('R227_b') or row.get('pendapatan_lain') or row.get('r27b'))
    if pend_total > 0 and abs(pend_total - (pend_a + pend_b)) > 100:
        anomalies.append(f'ARIT-2: Total pendapatan ({pend_total:,.0f}) ≠ rincian a+b ({(pend_a+pend_b):,.0f})')

    # 3. Pengeluaran: Total vs Rincian a s.d. e
    peng_total = parse_num(row.get('R226_f') or row.get('total_pengeluaran') or row.get('pengeluaran_total'))
    upah = parse_num(row.get('R226_a') or row.get('upah_gaji') or row.get('r26a'))
    bahan = parse_num(row.get('R226_b') or row.get('biaya_produksi') or row.get('r26b'))
    dagang = parse_num(row.get('R226_c') or row.get('biaya_pembelian') or row.get('r26c'))
    ops = parse_num(row.get('R226_d') or row.get('biaya_operasional') or row.get('r26d'))
    non_ops = parse_num(row.get('R226_e') or row.get('biaya_non_operasional') or row.get('r26e'))
    sum_peng = upah + bahan + dagang + ops + non_ops
    if peng_total > 0 and abs(peng_total - sum_peng) > 100:
        anomalies.append(f'ARIT-3: Total pengeluaran ({peng_total:,.0f}) ≠ jumlah komponen ({sum_peng:,.0f})')

    # 4. Pekerja Dibayar > 0 tapi Upah = 0
    p_dibayar = parse_num(row.get('R224_a2') or row.get('pekerja_dibayar'))
    if p_dibayar > 0 and upah == 0:
        anomalies.append(f'ARIT-4: Ada {int(p_dibayar)} pekerja dibayar tetapi Total Upah/Gaji (R226.a) = Rp 0')

    # 5. Nilai Dummy Rp 100.000
    if pend_total == 100000.0 or peng_total == 100000.0:
        anomalies.append('ARIT-5: Terindikasi data dummy (Pendapatan/Pengeluaran = Rp 100.000,-)')

    return anomalies

def audit_economic_ratios(row: Dict[str, Any]) -> List[str]:
    """Cek rasio ekonomi ekstrem (NTB negatif, rasio=1, upah per pekerja < 100rb)."""
    flags = []
    pend_total = parse_num(row.get('R227_c') or row.get('total_pendapatan') or row.get('pendapatan_total') or row.get('omzet'))
    peng_total = parse_num(row.get('R226_f') or row.get('total_pengeluaran') or row.get('pengeluaran_total') or row.get('pengeluaran'))
    upah = parse_num(row.get('R226_a') or row.get('upah_gaji') or row.get('r26a'))
    p_total = parse_num(row.get('R224_c') or row.get('total_pekerja') or row.get('pekerja'))

    ntb = pend_total - peng_total

    # 1. NTB Negatif
    if pend_total > 0 and ntb < 0:
        flags.append(f'EKON-1: NTB Negatif (Rp {ntb:,.0f}) — Pengeluaran melebihi Pendapatan')

    # 2. Rasio NTB = 1.00 (Biaya Antara Nol)
    if pend_total > 0 and peng_total == 0:
        flags.append('EKON-2: Rasio NTB = 1.00 (Biaya Antara Rp 0 / tanpa pengeluaran sama sekali)')

    # 3. Upah per Tenaga Kerja < Rp 100.000
    if p_total > 0 and upah > 0:
        upah_per_pekerja = upah / p_total
        if upah_per_pekerja < 100000.0:
            flags.append(f'EKON-3: Upah per tenaga kerja sangat rendah (Rp {upah_per_pekerja:,.0f} < Rp 100.000,-)')

    # 4. Rasio Upah terhadap NTB Ekstrem
    if ntb > 0 and upah > 0:
        rasio_upah_ntb = upah / ntb
        if rasio_upah_ntb > 1.0:
            flags.append(f'EKON-4: Rasio Upah/NTB Ekstrem ({rasio_upah_ntb:.2f} > 1.00) — Biaya upah melebihi seluruh nilai tambah')

    return flags

def main():
    parser = argparse.ArgumentParser(description='Audit Anomali KBLI & Data SE2026 (Statistik Jasa BPS)')
    parser.add_argument('--input', '-i', required=True, help='Path file Excel / CSV input data')
    parser.add_argument('--output', '-o', help='Path file Excel hasil audit')
    args = parser.parse_args()

    print(f"🔍 [AUDIT-KBLI] Membaca file: {args.input}...")
    # Implementasi pembacaan dan ekspor Excel dapat menggunakan openpyxl / pandas
    print("✅ Modul Audit KBLI Direktorat Statistik Jasa siap digunakan.")

if __name__ == '__main__':
    main()

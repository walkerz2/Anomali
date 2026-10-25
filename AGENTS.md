# Aturan Pengembangan & Git Workflow Proyek

## 1. Larangan Push Langsung ke Branch Main
- **DILARANG KERAS** melakukan commit atau push langsung ke branch `main` atau `master` secara otomatis.
- Setiap kali ada bugfix, fitur baru, perbaikan, atau perubahan kode, agen WAJIB:
  1. Membuat branch kerja baru (misal: `fix/<nama-masalah>`, `feat/<nama-fitur>`).
  2. Melakukan commit dan push HANYA ke branch kerja tersebut.
  3. Menguji validitas sintaks (`node -c ...`) dan pengujian QA (`node scripts/verify-all.js`) sebelum commit.
  4. Melaporkan branch baru kepada pengguna dan menunggu instruksi atau konfirmasi eksplisit dari pengguna sebelum melakukan merge/push ke `main`.

## 2. Jaminan Anti-Regresi & Kualitas Fitur (Zero-Regression Rule)
- Setiap kali menambahkan fitur baru atau mengubah kode:
  1. **Primum Non Nocere**: Fitur baru tidak boleh merusak atau mengubah perilaku fitur yang sudah stabil (backward compatibility terjaga).
  2. **Isolasi Fitur**: Fitur baru harus diisolasi dengan `try...catch` dan memiliki safe fallback agar kegagalan fitur baru tidak mematikan alur kerja otomatisasi utama.
  3. **Verifikasi Integritas**: Jalankan verifikasi otomatis sebelum commit:
     ```powershell
     node scripts/verify-all.js
     ```
  4. **Uji 6 Fitur Kritis**: Pastikan (1) Runner Queue, (2) Auto-SSO Eksternal, (3) Keep-Alive 4 Menit, (4) Webhook n8n & WhatsApp Bot, (5) Validasi NTB, dan (6) Popup UI tetap berfungsi normal tanpa regresi.

## 3. Kewajiban Sinkronisasi Dokumentasi (Doc-Sync Rule)
- Setiap kali menambahkan fitur baru, memperbaiki bug, atau mengubah kodingan:
  1. **Update `README.md`**: Perbarui panduan pengguna, deskripsi menu, atau alur kerja yang terdampak dengan bahasa yang jelas.
  2. **Update `context.md`**: Perbarui spesifikasi teknis, arsitektur, struktur berkas, daftar message actions, dan perbarui tanggal header (`Terakhir diperbarui: ... WITA`).
  3. **Zero Documentation Drift**: Kode dan dokumentasi wajib disinkronkan dalam commit yang sama sebelum diajukan untuk merge ke `main`.

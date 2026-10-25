# Aturan Pengembangan & Git Workflow Proyek

## Larangan Push Langsung ke Branch Main
- **DILARANG KERAS** melakukan commit atau push langsung ke branch `main` atau `master` secara otomatis.
- Setiap kali ada bugfix, fitur baru, perbaikan, atau perubahan kode, agen WAJIB:
  1. Membuat branch kerja baru (misal: `fix/<nama-masalah>`, `feat/<nama-fitur>`).
  2. Melakukan commit dan push HANYA ke branch kerja tersebut.
  3. Menguji validitas sintaks (`node -c ...`) sebelum commit.
  4. Melaporkan branch baru kepada pengguna dan menunggu instruksi atau konfirmasi eksplisit dari pengguna sebelum melakukan merge/push ke `main`.

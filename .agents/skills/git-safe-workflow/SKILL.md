---
name: git-safe-workflow
description: >-
  Pedoman dan alur kerja Git yang aman agar tidak pernah melakukan push langsung ke branch main atau master. Gunakan skill ini setiap kali melakukan perubahan kode, membuat commit, membuat branch fitur/bugfix baru (misal: feat/*, fix/*), melakukan pengujian sintaks, dan hanya melakukan push ke branch kerja sampai pengguna memberikan persetujuan eksplisit untuk merge ke main, dan langsung menghapus branch fitur tersebut secara otomatis (auto-cleanup lokal & remote) begitu di-push ke main.
---

# Git Safe Workflow (No Direct Push to Main)

Skill ini menetapkan protokol ketat dalam pengelolaan *version control* Git agar agen tidak pernah melakukan *commit* atau *push* langsung ke branch utama (`main` / `master`) secara sembrono.

---

## 1. 🛡️ Prinsip Utama (Golden Rules)

> [!CAUTION]
> **DILARANG KERAS** menjalankan perintah `git push origin main` atau `git push origin master` secara otomatis, kecuali pengguna telah memberikan perintah eksplisit (misal: *"silahkan push ke branch main"* atau *"merge ke main"*).

1. **Selalu Bekerja di Branch Terpisah**:
   - Seluruh perbaikan bug, penambahan fitur, dokumentasi, atau pengujian harus dilakukan di branch terisolasi.
2. **Push Hanya ke Branch Fitur/Fix**:
   - Perintah *push* hanya boleh ditujukan ke branch kerja yang sedang aktif (`git push origin <nama-branch>`).
3. **Merge ke Main Memerlukan Otorisasi Pengguna**:
   - Agen hanya boleh menggabungkan (*merge*) dan melakukan *push* ke `main` setelah kode diuji di branch kerja dan disetujui oleh pengguna.

---

## 2. 🏷️ Konvensi Penamaan Branch

Gunakan format penamaan branch yang deskriptif dan konsisten:

| Tipe Branch | Format Penamaan | Contoh |
| :--- | :--- | :--- |
| **Bugfix** | `fix/<deskripsi-singkat>` | `fix/auto-revoke-fallback`, `fix/webhook-sync-url` |
| **Fitur Baru** | `feat/<deskripsi-singkat>` | `feat/whatsapp-two-way-monitoring`, `feat/export-log` |
| **Refactoring** | `refactor/<komponen>` | `refactor/queue-runner-engine` |
| **Dokumentasi** | `docs/<topik>` | `docs/update-readme-n8n` |
| **Performance** | `perf/<optimasi>` | `perf/virtual-windowing-large-dataset` |

---

## 3. 📋 Standard Operating Procedure (SOP) Langkah Kerja

Setiap kali ada permintaan perbaikan kode atau penambahan fitur:

### Langkah 1: Periksa Status & Branch Aktif
```powershell
git status
git branch
```
- Jika saat ini berada di `main` atau `master`: **JANGAN LAKUKAN EDIT & COMMIT DI MAIN**.

### Langkah 2: Buat Branch Baru
Pastikan `main` bersih, lalu buat branch baru:
```powershell
git checkout -b fix/<nama-masalah>
# atau: git checkout -b feat/<nama-fitur>
```

### Langkah 3: Lakukan Perubahan & Uji Sintaks
Sebelum melakukan commit, selalu uji validitas sintaks dan fungsionalitas kode:
```powershell
node -c background/background.js content/content.js content/fasih_api.js popup/popup.js
```

### Langkah 4: Commit Perubahan
Gunakan format pesan *Conventional Commits*:
```powershell
git add <file-yang-diubah>
git commit -m "fix(komponen): ringkasan singkat perubahan"
```

### Langkah 5: Push ke Branch Kerja (Bukan Main!)
```powershell
git push origin <nama-branch-aktif>
```

### Langkah 6: Konfirmasi ke Pengguna
Informasikan kepada pengguna:
- Branch yang dibuat dan tautan perubahannya di remote repository.
- Berikan ringkasan perubahan yang telah dilakukan.
- Tunggu instruksi atau konfirmasi dari pengguna jika ingin di-merge ke `main`.

---

## 4. 🔀 Prosedur Penggabungan & Auto-Cleanup (Merge & Delete Branch)

Hanya lakukan prosedur ini **JIKA PENGGUNA SECARA EKSPLISIT MEMINTA** (misal: *"silahkan push ke main"*, *"merge dan push"*, dsb):

1. Pindah ke branch `main`:
   ```powershell
   git checkout main
   ```
2. Tarik pembaruan remote terkini:
   ```powershell
   git pull origin main
   ```
3. Gabungkan branch kerja:
   ```powershell
   git merge <nama-branch-kerja>
   ```
4. Verifikasi integritas QA:
   ```powershell
   node scripts/verify-all.js
   ```
5. Push ke `main`:
   ```powershell
   git push origin main
   ```
6. **Auto-Cleanup (Wajib Langsung Hapus Branch Fitur)**:
   Setelah push ke `main` berhasil, agen **WAJIB LANGSUNG MENGHAPUS** branch fitur tersebut baik secara lokal maupun remote agar repositori selalu bersih dan rapi:
   ```powershell
   # Hapus branch lokal
   git branch -d <nama-branch-kerja>

   # Hapus branch remote di GitHub
   git push origin --delete <nama-branch-kerja>
   ```
7. Beritahukan pengguna bahwa perubahan sudah berada di `main` dan branch fitur telah otomatis dibersihkan secara tuntas.

# Task Plan: Standardisasi Terminologi "Presensi" vs "Absensi" (KBBI)

## Goal
Menyelaraskan seluruh istilah penggunaan "Absensi" menjadi "Presensi" pada teks antarmuka pengguna (UI/UX), pesan error/validasi, feedback toast, dan dokumentasi Project Brain (`/docs/*.md`) sesuai kaidah Kamus Besar Bahasa Indonesia (KBBI), tanpa menyentuh skema basis data (`prisma/schema.prisma`), tanpa mengubah enum database internal (`status: "absent"`), dan tanpa mengubah URL remote git (`absensi.git`).

## Current Phase
Complete (All Phases Implemented, Verified, and Pushed)

## Constraints & Principles
1. **Standar KBBI**:
   - Presensi = Kehadiran (tanda bukti hadir, jam kerja, clock-in/out, foto kehadiran).
   - Absensi = Ketidakhadiran (alpa, tidak hadir).
2. **Zero Schema Modification**:
   - Dilarang memodifikasi file `prisma/schema.prisma` atau model Prisma.
   - Dilarang menjalankan `prisma db push`, `prisma migrate`, atau `prisma db reset`.
3. **Preserve Database Enum**:
   - Status internal `"absent"` tetap dipertahankan karena secara bahasa Inggris dan semantik KBBI memang berarti tidak hadir/alpa.
4. **Preserve Git Remote Link**:
   - Link `https://github.com/fadeta-ig/absensi.git` tetap dipertahankan tanpa perubahan.
5. **Strict Verification**:
   - TypeScript `tsc --noEmit` wajib 0 error.
   - ESLint wajib 0 error.
   - Vitest suite (services/utils) wajib lulus 100%.

---

## Planned Phases

### Phase 1 — Comprehensive Audit & Lexical Analysis
- [x] Scan seluruh kemunculan kata `absensi` dan `absen` di `/docs/`, `src/`, dan root file.
- [x] Klasifikasikan temuan: Project Brain docs, UI render text, API messages, Service/Validation, dan item yang wajib dipertahankan.
- [x] Tuliskan laporan audit lengkap dengan rincian path dan nomor baris ke `findings.md`.
- **Status:** complete

### Phase 2 — Project Brain Alignment (`docs/*.md`)
- [x] Perbarui 18 dokumen canonical di `/docs/` (ganti judul `# ... — Absensi & HRIS WIG` menjadi `# ... — Presensi & HRIS WIG`).
- [x] Perbarui narasi semantik di `docs/CODEBASE_MAP.md`, `docs/FEATURES.md`, `docs/DATA_MODEL.md`, `docs/FLOWS.md`, `docs/PROJECT.md`, `docs/API.md`, `docs/SECURITY.md`, dan `docs/DOMAIN.md`.
- [x] Pastikan link `absensi.git` di `docs/WORKFLOWS.md` tetap dipertahankan.
- **Status:** complete

### Phase 3 — Frontend Render Alignment
- [x] Perbarui teks modal judul: `AttendanceCorrectionDetailModal.tsx` (`Detail Pengajuan Koreksi Presensi`).
- [x] Perbarui toast feedback: `AttendanceCorrectionTab.tsx` (`koreksi presensi berhasil`).
- [x] Perbarui placeholder tabel & itemLabel: `AttendanceLogTab.tsx` (`data presensi`, `catatan presensi`, `presensi`).
- [x] Perbarui deskripsi menu: `AllMenusSheet.tsx` (`presensi harian`).
- [x] Perbarui placeholder data: `Employee360View.tsx` (`Belum ada data presensi`).
- [x] Perbarui helper teks: `LocationSection.tsx` (`Karyawan dapat melakukan presensi dari mana saja.`).
- **Status:** complete

### Phase 4 — API & Validation Messages Alignment
- [x] Perbarui pesan error radius lokasi: `src/app/api/attendance/route.ts`.
- [x] Perbarui pesan waktu clock-in: `src/app/api/attendance/route.ts`.
- [x] Perbarui log & pesan cron cleanup: `src/app/api/cron/cleanup-photos/route.ts`.
- [x] Perbarui pesan notifikasi karyawan: `src/app/api/notifications/route.ts`.
- [x] Perbarui pesan error hapus karyawan: `src/lib/services/employeeService.ts`.
- [x] Perbarui pesan validasi foto: `src/lib/validations/validationSchemas.ts`.
- [x] Perbarui service logger: `src/lib/logger.ts`.
- **Status:** complete

### Phase 5 — Verification & Health Check
- [x] Jalankan ESLint pada file yang dimodifikasi (0 errors).
- [x] Jalankan `npx tsc --noEmit` (0 error).
- [x] Jalankan Vitest test suite (`npm test` / `vitest run` — 52 passed).
- [x] Periksa `git status` dan pastikan zero database schema modifications.
- **Status:** complete

### Phase 6 — Delivery & Project Brain Assessment
- [x] Lakukan assessment perubahan pengetahuan durable pada `/docs/` (seluruh 18 dokumen canonical telah diselaraskan).
- [x] Commit dan push ke remote git dengan pesan detail dan jelas.
- [x] Laporkan hasil lengkap ke pengguna.
- **Status:** complete

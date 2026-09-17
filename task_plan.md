# Task Plan: Implementasi & Penyempurnaan Lengkap Modul Green Meeting

## Goal
Membangun dan menyempurnakan modul **Green Meeting** (Rapat Koordinasi Harian Internal Perusahaan) yang dikelola permanen oleh General Affairs (`GA_ADMIN` / `ga.manage`), dipantau oleh HR secara read-only, dan dapat diakses transparan oleh seluruh karyawan dengan fitur presensi 1-klik, notulensi fleksibel DARI ➔ KEPADA, pelacak multi-deadline, kalender kerja, audit revisi notulensi terlacak, arsitektur multi-page dengan sidebar sub-dropdown, serta smart filter relevansi employee yang praktis.

## Status
**Completed & Verified 100%**. Siap untuk di-push ke repository remote.

## Tahapan yang Telah Diselesaikan
- [x] **Fase 1 — Fondasi Skema & Database**: Model Prisma, enum, relasi sesi, presensi default `ALPA`, notulen, target, deadline history, dan revision history.
- [x] **Fase 2 — Service Layer & REST API**: `greenMeetingService.ts` dan 9 route API `/api/green-meeting/*` dengan RBAC ketat.
- [x] **Fase 3 — Fleksibilitas DARI & KEPADA**: Segmented scope selector & live employee search autocomplete untuk DARI; target polymorphic untuk KEPADA.
- [x] **Fase 4 — Multi-Page & Sidebar Sub-Dropdown GA**: Memecah halaman monolitik menjadi 5 sub-halaman terdedikasi (`attendance`, `notes`, `tasks`, `settings`, `recap`) dengan navigasi ganda (`AppShell` subItems + `GreenMeetingNavTabs`).
- [x] **Fase 5 — Koreksi Notulensi & Revision Ledger**: Kemampuan GA mengedit butir notulen dengan alasan wajib, snapshot revisi append-only, audit log, dan proteksi mutasi tugas.
- [x] **Fase 6 — UX Smart Filter Employee**: Filter relevansi presisi (`Semua`, `Untuk Saya & Dept`, `Khusus Saya`, `Tugas`, `Arahan Direksi`) dengan visual relevance badges dan pencegahan kebocoran lintas divisi.
- [x] **Fase 7 — Project Brain & Dokumentasi**: Menyelaraskan seluruh 9 dokumen canonical di `/docs/`.
- [x] **Fase 8 — Verifikasi & Quality Gates**: Typecheck (0 error), targeted ESLint (0 warning), unit tests (25 passed), dan production build Next.js (130 static pages).

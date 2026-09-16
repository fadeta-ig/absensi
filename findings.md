# Audit & Analisis Terminologi: "Presensi" vs "Absensi" (Standar KBBI)

## 1. Landasan Teori Kebahasaan (Kamus Besar Bahasa Indonesia)

Berdasarkan Kamus Besar Bahasa Indonesia (KBBI) dan rujukan Balai Bahasa:
- **Presensi**: Memiliki arti *kehadiran* atau *adanya seseorang di tempat kerja/kegiatan*. Kata dasar: *hadir/ada*. Fungsi logis: pencatatan dan pembuktian kehadiran (jam kerja, clock-in, clock-out, foto selfie, koordinat GPS, verifikasi biometrik/lokasi).
- **Absensi**: Memiliki arti *ketidakhadiran*. Kata dasar: *absen* (tidak masuk kerja/sekolah, mangkir). Fungsi logis: pencatatan dan rekapitulasi jumlah hari atau waktu seorang karyawan tidak hadir (cuti, izin, sakit, alpa/alpha).

### Salah Kaprah yang Terjadi di Codebase & Solusinya
- **Salah Kaprah**: Frasa *"lokasi absensi"*, *"foto absensi"*, *"koreksi absensi"*, *"catatan absensi"*, *"belum absen hari ini"*.
- **Makna Sebenarnya**: Kalimat-kalimat tersebut secara semantik berarti "lokasi ketidakhadiran", "foto tidak hadir", "koreksi ketidakhadiran".
- **Koreksi Sesuai KBBI**:
  - *"Presensi & HRIS WIG"* (sebagai nama sistem kehadiran & kepegawaian terpadu).
  - *"Koreksi Presensi"* (mengoreksi jam kedatangan/kepulangan saat hadir).
  - *"Catatan Presensi"* / *"Data Presensi"* (daftar rekaman jam kerja karyawan).
  - *"Lokasi Presensi"* & *"Foto Presensi"* (bukti kehadiran fisik).
  - *"Belum melakukan presensi hari ini"* (belum mencatatkan bukti kehadiran).

---

## 2. Batasan Keamanan Arsitektur & Skema Database (Strict Non-Negotiable)

1. **Zero Database Schema Changes**:
   - File `prisma/schema.prisma` **TIDAK DISENTUH SAMA SEKALI**.
   - Model database (`AttendanceRecord`, `AttendanceCorrection`, dll.) tetap menggunakan bahasa Inggris standar industri.
2. **Nilai Enum Database & API Internal**:
   - Nilai enum `status: "absent"` dalam kode dan database **TETAP DIPERTAHANKAN** karena dalam bahasa Inggris *"absent"* memang berarti *tidak hadir/alpa*, yang 100% konsisten dengan kaidah KBBI (*Absen = tidak hadir/alpa*).
3. **Pengecualian Khusus Remote Git**:
   - URL remote git `https://github.com/fadeta-ig/absensi.git` **DIPERTAHANKAN** sesuai instruksi eksplisit pengguna.
4. **Fokus Intervensi**:
   - Teks yang dirender ke antarmuka pengguna (UI/UX).
   - Pesan feedback/toast, pesan error validasi, dan label tabel.
   - Seluruh 18 dokumen Project Brain di `/docs/*.md`.

---

## 3. Matriks Hasil Audit Lengkap (Inventory Path & Line)

### A. Dokumen Project Brain (`/docs/*.md`) — 29 Temuan

| No | File | Baris | Teks Aktual (Sebelum) | Rencana Perubahan (Baku KBBI) |
|---|---|---|---|---|
| 1 | `docs/README.md` | 1 | `# Project Brain Entry Point — Absensi & HRIS WIG` | `# Project Brain Entry Point — Presensi & HRIS WIG` |
| 2 | `docs/AGENT_RULES.md` | 1 | `# AI Agent Rules & Operational Contract — Absensi & HRIS WIG` | `# AI Agent Rules & Operational Contract — Presensi & HRIS WIG` |
| 3 | `docs/PROJECT.md` | 1, 10 | `# Project Overview — Absensi & HRIS WIG` / `Project **Absensi & HRIS WIG**` | `# Project Overview — Presensi & HRIS WIG` / `Project **Presensi & HRIS WIG**` |
| 4 | `docs/CODEBASE_MAP.md` | 1 | `# Codebase Map — Absensi & HRIS WIG` | `# Codebase Map — Presensi & HRIS WIG` |
| 5 | `docs/CODEBASE_MAP.md` | 79 | `Monitoring absensi harian dan rekap kehadiran.` | `Monitoring presensi harian dan rekap kehadiran.` |
| 6 | `docs/CODEBASE_MAP.md` | 85 | `pengajuan koreksi absensi` | `pengajuan koreksi presensi` |
| 7 | `docs/ARCHITECTURE.md` | 1 | `# Architecture — Absensi & HRIS WIG` | `# Architecture — Presensi & HRIS WIG` |
| 8 | `docs/DOMAIN.md` | 1, 7 | `# Domain Model & Business Rules — Absensi & HRIS WIG` | `# Domain Model & Business Rules — Presensi & HRIS WIG` |
| 9 | `docs/FEATURES.md` | 1, 7 | `# System Features & Capabilities — Absensi & HRIS WIG` | `# System Features & Capabilities — Presensi & HRIS WIG` |
| 10 | `docs/FEATURES.md` | 36 | `- **Koreksi Absensi (Attendance Correction)**` | `- **Koreksi Presensi (Attendance Correction)**` |
| 11 | `docs/FLOWS.md` | 1 | `# End-to-End System Flows — Absensi & HRIS WIG` | `# End-to-End System Flows — Presensi & HRIS WIG` |
| 12 | `docs/FLOWS.md` | 59 | `Hasil catatan absensi` | `Hasil catatan presensi` |
| 13 | `docs/DATA_MODEL.md` | 1 | `# Data Model & Storage — Absensi & HRIS WIG` | `# Data Model & Storage — Presensi & HRIS WIG` |
| 14 | `docs/DATA_MODEL.md` | 56 | `Permohonan koreksi absensi` | `Permohonan koreksi presensi` |
| 15 | `docs/API.md` | 1, 7 | `# API Map & HTTP Contracts — Absensi & HRIS WIG` | `# API Map & HTTP Contracts — Presensi & HRIS WIG` |
| 16 | `docs/CONVENTIONS.md` | 1 | `# Coding Conventions — Absensi & HRIS WIG` | `# Coding Conventions — Presensi & HRIS WIG` |
| 17 | `docs/DECISIONS.md` | 1 | `# Architectural Decisions — Absensi & HRIS WIG` | `# Architectural Decisions — Presensi & HRIS WIG` |
| 18 | `docs/CONSTRAINTS.md` | 1 | `# Technical & Business Constraints — Absensi & HRIS WIG` | `# Technical & Business Constraints — Presensi & HRIS WIG` |
| 19 | `docs/SECURITY.md` | 1, 7 | `# Security Architecture & Rules — Absensi & HRIS WIG` | `# Security Architecture & Rules — Presensi & HRIS WIG` |
| 20 | `docs/TESTING.md` | 1 | `# Testing Strategy & Configuration — Absensi & HRIS WIG` | `# Testing Strategy & Configuration — Presensi & HRIS WIG` |
| 21 | `docs/INTEGRATIONS.md` | 1 | `# Integrations & External Services — Absensi & HRIS WIG` | `# Integrations & External Services — Presensi & HRIS WIG` |
| 22 | `docs/GOTCHAS.md` | 1 | `# Gotchas & Pitfalls — Absensi & HRIS WIG` | `# Gotchas & Pitfalls — Presensi & HRIS WIG` |
| 23 | `docs/WORKFLOWS.md` | 1 | `# Workflows & Operational Commands — Absensi & HRIS WIG` | `# Workflows & Operational Commands — Presensi & HRIS WIG` |
| 24 | `docs/WORKFLOWS.md` | 24 | `cd absensi` | `cd absensi` (Tetap folder repositori git) |

---

### B. Frontend Render & UI Components (`src/app` & `src/components`) — 8 Temuan

| No | File | Baris | Konteks Teks UI | Rencana Perubahan |
|---|---|---|---|---|
| 1 | `src/app/dashboard/attendance/components/AttendanceCorrectionDetailModal.tsx` | 99 | `Detail Pengajuan Koreksi Absensi` | `Detail Pengajuan Koreksi Presensi` |
| 2 | `src/app/dashboard/attendance/components/AttendanceCorrectionTab.tsx` | 121 | `toast("... koreksi absensi berhasil ...")` | `toast("... koreksi presensi berhasil ...")` |
| 3 | `src/app/dashboard/attendance/components/AttendanceLogTab.tsx` | 142 | `Tidak ada data absensi ditemukan untuk kriteria ini.` | `Tidak ada data presensi ditemukan untuk kriteria ini.` |
| 4 | `src/app/dashboard/attendance/components/AttendanceLogTab.tsx` | 267 | `itemLabel="catatan absensi"` | `itemLabel="catatan presensi"` |
| 5 | `src/app/dashboard/attendance/components/AttendanceLogTab.tsx` | 277 | `itemLabel="absensi"` | `itemLabel="presensi"` |
| 6 | `src/app/employee/components/AllMenusSheet.tsx` | 111 | `description: "Catatan log jam kerja dan absensi harian"` | `description: "Catatan log jam kerja dan presensi harian"` |
| 7 | `src/components/Employee360View.tsx` | 207 | `Belum ada data absensi` | `Belum ada data presensi` |
| 8 | `src/components/employee-form/LocationSection.tsx` | 53 | `Karyawan dapat absen dari mana saja.` | `Karyawan dapat melakukan presensi dari mana saja.` |

---

### C. Pesan Respons API & Validasi Form (`src/app/api` & `src/lib`) — 9 Temuan

| No | File | Baris | Konteks Pesan / Error | Rencana Perubahan |
|---|---|---|---|---|
| 1 | `src/app/api/attendance/route.ts` | 108 | `Anda berada di luar radius lokasi absensi yang diizinkan.` | `Anda berada di luar radius lokasi presensi yang diizinkan.` |
| 2 | `src/app/api/attendance/route.ts` | 212 | `Anda bisa absen mulai pukul ...` | `Anda bisa melakukan presensi mulai pukul ...` |
| 3 | `src/app/api/cron/cleanup-photos/route.ts` | 49 | `Foto absensi lama berhasil dibersihkan...` | `Foto presensi lama berhasil dibersihkan...` |
| 4 | `src/app/api/cron/cleanup-photos/route.ts` | 52 | `logger.error("Cron: Gagal membersihkan foto absensi")` | `logger.error("Cron: Gagal membersihkan foto presensi")` |
| 5 | `src/app/api/notifications/route.ts` | 97 | `${emp.name} belum absen hari ini` | `${emp.name} belum presensi hari ini` |
| 6 | `src/app/api/notifications/employee/route.ts` | 50 | `// Koreksi absensi yang sudah diresolved` | `// Koreksi presensi yang sudah diresolved` |
| 7 | `src/lib/validations/validationSchemas.ts` | 41 | `Foto absensi wajib disertakan sebagai bukti kehadiran` | `Foto presensi wajib disertakan sebagai bukti kehadiran` |
| 8 | `src/lib/services/employeeService.ts` | 357 | `masih memiliki riwayat absensi, gaji, atau peminjaman` | `masih memiliki riwayat presensi, gaji, atau peminjaman` |
| 9 | `src/lib/logger.ts` | 89 | `defaultMeta: { service: "absensi-hris" }` | `defaultMeta: { service: "presensi-hris" }` |

---

### D. Item yang Tetap Dipertahankan Sesuai Peraturan Teknis & KBBI

1. **Status Enum Database (`status: "absent"`)**:
   - Tetap `"absent"` di `prisma/schema.prisma` dan seluruh kode pembanding logika (`r.status === "absent"`).
   - Label di UI: `"Alpa"` atau `"Tidak Hadir"` (sesuai KBBI: alpa/tidak hadir).
2. **Git Repository URL**:
   - `https://github.com/fadeta-ig/absensi.git` tetap dipertahankan tanpa perubahan.

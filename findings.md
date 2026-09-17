# Findings & Audit: Penyesuaian Kepemilikan Permanen GA (WIG002)

## 1. Arahan Baru Direksi
- **Kepemilikan Permanen**: Modul "Green Meeting" selamanya menjadi tanggung jawab dan dikelola penuh oleh **General Affairs (GA / WIG002)**.
- **Eliminasi Fitur Mutasi PIC**: Tidak ada lagi fitur pengalihan hak kelola (*no PIC reassignment*) ke divisi atau role lain.
- **Akses Pengguna**:
  - **Pengelola Penuh (Write & Manage)**: Hanya akun tim GA (`WIG002` / `GA_ADMIN` / `ga.manage`).
  - **Pemantauan (Monitoring) & Open Access (Read-Only)**: Seluruh insan perusahaan (termasuk tim HR, direksi, manajer, dan karyawan umum) memiliki hak baca (*read-only*) terhadap agenda, transparansi presensi, notulen, dan progres tugas.

---

## 2. Audit Dampak pada Kode Fase 1 & Fase 2

### A. Fase 1 — Skema Basis Data (`prisma/schema.prisma`)
- **Tabel `green_meeting_configs`**:
  - Field `picRole` (default: `"GA"`) dan `assignedPicUserId` tidak lagi membutuhkan logika mutasi.
  - Kita dapat mengunci `picRole` secara permanen ke `"GA"` atau membersihkan relasi `assignedPicUserId` yang tidak terpakai agar skema bersih dan patuh pada prinsip *YAGNI*.
  - Field operasional rapat lainnya (`defaultRoom`, `defaultTime`, `maxDeadlineExtensions`, `offDaysWeekly`) tetap aktif dan dikelola oleh GA.
- **Tabel Lainnya**:
  - `GreenMeetingUnit`, `GreenMeetingHoliday`, `GreenMeetingSession`, `GreenMeetingAttendance`, `GreenMeetingNote`, `GreenMeetingNoteTarget`, `GreenMeetingDeadlineHistory` **100% tetap utuh dan sempurna**, karena kebutuhan bisnis presensi cepat 1-klik, multi-deadline bertingkat, dan penargetan *From ➔ To* tidak berubah.

### B. Fase 2 — Service Layer & API Routes
- **`src/lib/services/greenMeetingService.ts`**:
  - `canManageGreenMeeting(session)`: Disederhanakan total. Hanya memeriksa otorisasi GA (`ga.manage` atau `GA_ADMIN`). Seluruh logika dinamis pengecekan IT atau departemen lain dihapus.
  - `updateGreenMeetingConfig()`: Menghapus kemampuan mengubah `picRole` dan `assignedPicUserId`. GA hanya memperbarui `defaultRoom`, `defaultTime`, `maxDeadlineExtensions`, dan `offDaysWeekly`.
- **`src/lib/validations/validationSchemas.ts`**:
  - `greenMeetingConfigSchema`: Menghapus `picRole` dan `assignedPicUserId` dari skema payload update, sehingga endpoint tidak menerima perubahan PIC.
- **`src/app/api/green-meeting/config/route.ts`**:
  - Otorisasi PATCH dikunci khusus untuk GA.

---

## 3. Penyesuaian Roadmap Fase 3, 4, 5, 6

| Fase | Rencana Awal | Penyesuaian Pasca Arahan Direksi | Status |
|---|---|---|---|
| **Fase 1** | Skema Prisma & Seeding awal | Kunci PIC permanen di GA; pertahankan konfigurasi operasional rapat. | ✅ Selesai (Perlu penyesuaian minor) |
| **Fase 2** | Service Layer & API Routes | Sederhanakan `canManageGreenMeeting` khusus GA, hapus mutasi PIC. | ✅ Selesai (Perlu penyesuaian minor) |
| **Fase 3** | GA Management Dashboard (`/ga/green-meeting`) | Menjadi **dashboard sentral tunggal** untuk seluruh operasional rapat, presensi 1-klik, notulen From ➔ To, pelacak multi-deadline, kalender libur, dan ekspor data. | ⏳ Fase Berikutnya |
| **Fase 4** | Employee Open Access Portal (`/employee/green-meeting`) | Portal baca transparan bagi seluruh karyawan, termasuk tim HR dan seluruh unit kerja. | ⏳ Akan Dijalankan |
| **Fase 5** | HR Governance & PIC Reassignment (`/dashboard/green-meeting-governance`) | **DIHAPUS / DITIADAKAN** (Sesuai arahan direksi, tidak ada fitur pemindahan PIC). | ❌ Dihapus |
| **Fase 6** | Verifikasi, Pengujian, & Update `/docs/` | Menyelaraskan seluruh unit test dan dokumentasi Project Brain. | ⏳ Fase Penutup |

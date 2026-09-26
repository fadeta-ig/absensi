# Data Model & Storage — Presensi & HRIS WIG

> **Purpose**: Persistent data and schema knowledge.  
> **Source of Truth**: `prisma/schema.prisma` and live database tables.  
> **Last Verified**: 2026-09-26

Dokumen ini mendokumentasikan teknologi penyimpanan, skema basis data MariaDB/Prisma, model entitas, relasi antar tabel, dan strategi migrasi. Skema aktual memuat **67 model Prisma** dan **19 enum**; setiap model dipetakan ke tabel fisik.


---

## 1. Storage Technology

- **Database Engine**: MariaDB 10.11+ / MySQL 8.0+
- **ORM / Schema Tool**: Prisma ORM 6.19.2 (`provider = "mysql"`)
- **Connection URI**: Dikonfigurasi via environment variable `DATABASE_URL` (`mysql://USER:PASSWORD@HOST:3306/DATABASE`).
- **Penyimpanan Berkas Biner (MediumBlob)**: Dokumen BAST aset disimpan langsung di kolom `file_data` tabel `asset_bast_documents` sebagai biner `MediumBlob` (maksimal 16MB).
- **Penyimpanan Berkas Disk Fisik**: Foto kunjungan dinas disimpan di direktori filesystem lokal `/storage/visit-photos/`, dan berkas unggahan umum di `/public/uploads/`.

---

## 2. Comprehensive Model & Table Catalog

Basis data terdiri dari **66 model Prisma** yang dipetakan ke tabel fisik melalui deklarasi `@@map` pada schema Prisma:

### A. Autentikasi & RBAC (5 Model)
1. `UserAccount` (`user_accounts`): Akun pengguna aplikasi. Kolom penting: `id`, `username`, `email`, `password_hash`, `session_version`, `is_active`, `employee_id`.
2. `Role` (`roles`): Peran sistem. Kolom penting: `id`, `code` (`SUPER_ADMIN`, `HR_ADMIN`, `GA_ADMIN`, `EMPLOYEE_USER`), `name`, `is_system`.
3. `Permission` (`permissions`): Hak akses atomik. Kolom penting: `code` (`user.manage`, `hr.manage`, `ga.manage`, `employee.self`, `asset.read`).
4. `UserRoleAssignment` (`user_role_assignments`): Pemetaan akun ke peran dengan audit pembuat (`assigned_by_user_id`).
5. `RolePermission` (`role_permissions`): Pemetaan peran ke izin.

### B. Kepegawaian & Master Data (10 Model)
6. `Employee` (`employees`): Entitas induk karyawan. Kolom penting: `employee_id`, `name`, `email`, `department_id`, `division_id`, `position_id`, `employment_type`, `manager_id`, `total_leave`, `used_leave`, `bypass_location`, `is_active`.
7. `Division` (`divisions`): Divisi perusahaan. Kolom penting: `name`, `is_active`.
8. `Department` (`departments`): Departemen kerja di bawah divisi.
9. `Position` (`positions`): Jabatan/posisi kerja.
10. `Location` (`locations`): Titik koordinat kantor untuk geofencing (`latitude`, `longitude`, `radius`).
11. `WorkShift` (`work_shifts`): Master shift kerja dengan ambang toleransi waktu.
12. `WorkShiftDay` (`work_shift_days`): Jadwal shift per hari dalam sepekan (`day_of_week`, `start_time`, `end_time`, `is_off`).
13. `EmployeeStatusHistory` (`employee_status_histories`): Riwayat perubahan status aktif/non-aktif pegawai.
14. `EmployeeImportJob` (`employee_import_jobs`): Log dan status proses batch import data karyawan via Excel.
15. `EmployeeDocument` (`employee_documents`): Berkas arsip karyawan (KTP, NPWP, BPJS, Ijazah, Kontrak) dengan tanggal kedaluwarsa.

### C. Data Privat & Sensitif Karyawan (PII) (7 Model)
16. `EmployeePrivateProfile` (`employee_private_profiles`): Data pribadi (tempat/tgl lahir, status pernikahan, golongan darah, agama, pendidikan).
17. `EmployeeIdentity` (`employee_identities`): NIK, No KK, BPJS Kesehatan, BPJS Ketenagakerjaan tersimpan terenkripsi, dilengkapi blind index hash (`national_id_hash`, `family_card_number_hash`, `bpjs_employment_hash`, `bpjs_health_hash`).
18. `EmployeeAddress` (`employee_addresses`): Alamat KTP (`ID_CARD`) dan domisili (`DOMICILE`).
19. `EmployeeEmergencyContact` (`employee_emergency_contacts`): Kontak darurat keluarga dengan flag `is_primary`.
20. `EmployeeBankAccount` (`employee_bank_accounts`): Rekening payroll dengan hash `account_number_hash` untuk verifikasi unik.
21. `EmployeeTaxProfile` (`employee_tax_profiles`): Status PTKP perpajakan dan tanggal efektif.
22. `EmployeeTaxHistory` (`employee_tax_histories`): Riwayat audit perubahan PTKP karyawan.

### D. Presensi & Kunjungan Lapangan (5 Model)
23. `AttendanceRecord` (`attendance_records`): Kehadiran harian (`date`, `clock_in`, `clock_out`, `clock_in_location`, `clock_out_location`, `clock_in_photo`, `clock_out_photo`, `status`, `is_off_day`, `off_day_reason`). Constraint unik: `[employeeId, date]`. Indeks: `[is_off_day]`.
24. `AttendanceCorrection` (`attendance_corrections`): Permohonan koreksi presensi (`target_date`, `proposed_clock_in`, `proposed_clock_out`, `status`, `assigned_manager_id`).
25. `VisitReport` (`visit_reports`): Laporan kunjungan dinas luar (`client_name`, `client_address`, `visit_location`, `clock_in_location`, `clock_out_location`, `status`).
26. `VisitPhoto` (`visit_photos`): Foto kunjungan dengan hash `sha256_original`, deviasi jarak `distance_to_target_meters`, dan path gambar watermark `stamped_path`.
27. `Location` ── `Employee` (`_employeelocations`): Tabel pivot many-to-many lokasi kerja yang ditugaskan ke karyawan.

### E. GA & Aset Perusahaan (9 Model)
28. `AssetCategory` (`asset_categories`): Kategori aset dan awalan kode inventaris (`prefix`).
29. `Asset` (`assets`): Master aset fisik (`asset_code`, `serial_number`, `imei`, `kondisi`, `status`, `holder_type`, `assigned_to_id`). Dilengkapi indeks `FULLTEXT` pada `(name, assetCode, serialNumber)`.
30. `AssetHistory` (`asset_histories`): Mutasi pemegang dan kondisi aset.
31. `AssetBastDocument` (`asset_bast_documents`): Berkas Berita Acara Serah Terima (`file_data` MediumBlob).
32. `AssetInspection` (`asset_inspections`): Sesi inspeksi periodik tim GA.
33. `InspectionChecklistItem` (`inspection_checklist_items`): Butir checklist inspeksi (`is_pass`, `notes`).
34. `AssetMaintenance` (`asset_maintenances`): Log perbaikan aset, vendor servis, biaya, dan nota invoice.
35. `AssetTicket` (`asset_tickets`): Tiket permintaan/laporan kerusakan aset dari karyawan.
36. `SimCard` (`sim_cards`): Nomor kartu SIM perusahaan dan masa aktif.

### F. Payroll, Cuti, Lembur, & Pengumuman (11 Model)
37. `PayrollComponent` (`payroll_components`): Komponen gaji dasar (Tunjangan/Potongan).
38. `EmployeePayrollComponent` (`employee_payroll_components`): Komponen gaji spesifik karyawan.
39. `PayslipRecord` (`payslip_records`): Master slip gaji bulanan per karyawan.
40. `PayslipItem` (`payslip_items`): Rincian baris slip gaji (`type`, `name`, `amount`).
41. `LeaveRequest` (`leave_requests`): Permohonan cuti karyawan.
42. `OvertimeRequest` (`overtime_requests`): Permohonan lembur karyawan.
43. `LetterRequest` (`letter_requests`): Permohonan surat keterangan resmi.
44. `NewsItem` (`news_items`): Pengumuman dan berita internal perusahaan.
45. `TodoItem` (`todo_items`): Daftar tugas personal karyawan.
46. `AuditLog` (`audit_logs`): Catatan audit sistem terpusat (`action`, `entity`, `details` JSON, metadata aktor).
47. `PushSubscription` (`push_subscriptions`): Langganan Web Push VAPID browser.
48. `BirthdayReminderSetting` (`birthday_reminder_settings`): Konfigurasi pengingat email ulang tahun.
49. `BirthdayPreparationStatus` (`birthday_preparation_statuses`): Status alur persiapan ulang tahun.
50. `EmployeeBirthdayPreparation` (`employee_birthday_preparations`): Rekap persiapan per karyawan per tahun.

> Penomoran katalog lama di atas bersifat indeks domain historis dan memasukkan tabel pivot sebagai item tersendiri. Jumlah canonical skema tetap mengikuti deklarasi `model` aktual di `prisma/schema.prisma`.

### G. Green Meeting (9 Model)
- `GreenMeetingConfig` (`green_meeting_configs`): Konfigurasi tunggal modul (`id = "default"`) yang mengunci `picRole = "GA"`, ruangan dan jam default, daftar hari libur mingguan, serta kuota maksimum perpanjangan deadline.
- `GreenMeetingUnit` (`green_meeting_units`): Pemetaan satu-ke-satu ke `Department`; menentukan apakah departemen aktif sebagai peserta rapat dan apakah kehadirannya diwajibkan secara default.
- `GreenMeetingHoliday` (`green_meeting_holidays`): Tanggal libur khusus beserta deskripsi dan flag pengulangan.
- `GreenMeetingSession` (`green_meeting_sessions`): Satu sesi per `meetingDate`, menyimpan ruangan, jam mulai, status, notulis, serta relasi presensi dan notulen.
- `GreenMeetingAttendance` (`green_meeting_attendances`): Presensi unik per kombinasi sesi dan departemen (`[sessionId, unitId]`), berstatus `HADIR`, `IZIN`, atau `ALPA`; nilai awal adalah `ALPA`, dan `IZIN` wajib memiliki alasan.
- `GreenMeetingNote` (`green_meeting_notes`): Butir informasi atau tugas. `originType` mendukung `DIREKSI`, `DEPARTMENT`, `DIVISION`, `EMPLOYEE`, dan `LAINNYA`; `originName` menyimpan label sumber yang human-readable, sedangkan `lastEditedAt` dan `lastEditedBy` menandai koreksi terakhir.
- `GreenMeetingNoteRevision` (`green_meeting_note_revisions`): Riwayat revisi append-only berisi nomor revisi, alasan wajib, aktor, timestamp, dan snapshot JSON notulensi sebelum perubahan.
- `GreenMeetingNoteTarget` (`green_meeting_note_targets`): Sasaran many-to-one untuk notulen. Setiap baris bertipe `DEPARTMENT`, `DIVISION`, atau `EMPLOYEE` dan menyimpan foreign key terkait serta label tampilan. Sasaran seluruh perusahaan direpresentasikan oleh `GreenMeetingNote.isAllTarget = true` tanpa baris target.
- `GreenMeetingDeadlineHistory` (`green_meeting_deadline_histories`): Riwayat Deadline 1 dan setiap perpanjangan tugas secara berurutan (`sequence`), lengkap dengan alasan dan pembuat. Riwayat lama tidak ditimpa.

Relasi inti Green Meeting:

1. `Department` 1 ── 0..1 `GreenMeetingUnit`.
2. `GreenMeetingSession` 1 ── * `GreenMeetingAttendance`; setiap sesi/departemen unik.
3. `GreenMeetingSession` 1 ── * `GreenMeetingNote`.
4. `GreenMeetingNote` 1 ── * `GreenMeetingNoteTarget`.
5. `GreenMeetingNote` 1 ── * `GreenMeetingDeadlineHistory`.
6. `Division`, `Department`, dan `Employee` menjadi sumber master HR bagi target notulen; data organisasi tidak diduplikasi ke master baru Green Meeting.

### H. Inspeksi Harian / Core Cleaning Loop (9 Model)
- `CleaningRoom` (`cleaning_rooms`): Ruangan yang dikelola inspeksi hariannya. Kolom penting: `id`, `name`, `normalizedName` (unik), `templateId` (FK ke `CleaningTemplate`), `isActive`, timestamps.
- `CleaningTemplate` (`cleaning_templates`): Template item checklist yang dapat dipakai ulang oleh banyak ruangan. Kolom penting: `id`, `name`, `normalizedName` (unik), `isActive`, timestamps. Tidak dapat dinonaktifkan selama masih dipakai ruangan aktif.
- `CleaningTemplateItem` (`cleaning_template_items`): Item checklist di dalam template. Kolom penting: `id`, `templateId`, `name`, `normalizedName` (unik per template), `sortOrder`, `isActive`, timestamps.
- `CleaningWorkerAssignment` (`cleaning_worker_assignments`): Penetapan petugas internal/outsource ke ruangan dengan interval tanggal WIB. Kolom penting: `id`, `roomId`, `userId`, `workerType`, `startsOnWibDate`, `endsOnWibDate` (nullable), timestamps. Assignment yang belum berakhir mempertahankan role `CLEANING_WORKER`, sedangkan interval tanggal menentukan akses ruangan aktual.
- `CleaningDailyChecklist` (`cleaning_daily_checklists`): Satu record per ruangan dan tanggal WIB. Kolom penting: `id`, `roomId`, `wibDate`, `roomNameSnapshot`, timestamps. Unik: `[roomId, wibDate]`.
- `CleaningDailyChecklistItem` (`cleaning_daily_checklist_items`): Snapshot item checklist harian. Kolom penting: `id`, `checklistId`, `templateItemId` (nullable), `itemNameSnapshot`, `sortOrder`, `isActive`, `isComplete`, `lastChangedByUserId` (nullable), `lastChangedAt` (nullable), timestamps. Item yang belum disentuh tidak memiliki aktor atau waktu.
- `CleaningMonthlyApproval` (`cleaning_monthly_approvals`): Konfigurasi reviewer bulanan per ruangan dan bulan WIB, dengan snapshot nama ruangan serta employee `INSPECTED_BY` dan `KNOWN_BY`. Unik: `[roomId, monthWib]`.
- `CleaningMonthlyApprovalSignature` (`cleaning_monthly_approval_signatures`): Tanda tangan berversi per approval/role. Menyimpan snapshot penanda tangan, payload tanda tangan, waktu, status `SIGNED`/`REOPENED`, alasan reopen, pelaku reopen, dan hubungan versi pengganti.
- `CleaningApprovalIdempotency` (`cleaning_approval_idempotency`): Penyimpanan respons idempotent bertenggat waktu berdasarkan aktor, scope endpoint, dan idempotency key.

Relasi inti Cleaning:

1. `CleaningRoom` * ── 1 `CleaningTemplate` (wajib saat aktif).
2. `CleaningRoom` 1 ── * `CleaningWorkerAssignment`.
3. `CleaningRoom` 1 ── * `CleaningDailyChecklist`.
4. `CleaningDailyChecklist` 1 ── * `CleaningDailyChecklistItem`.
5. `CleaningRoom` 1 ── * `CleaningMonthlyApproval`.
6. `CleaningMonthlyApproval` 1 ── * `CleaningMonthlyApprovalSignature`.
7. `UserAccount` 1 ── * `CleaningWorkerAssignment` (petugas).
8. `UserAccount` 1 ── * `CleaningDailyChecklistItem` via `lastChangedByUserId` (aktor perubahan).
9. `Employee` 1 ── * `CleaningMonthlyApproval` untuk masing-masing peran reviewer dan 1 ── * `CleaningMonthlyApprovalSignature` sebagai penanda tangan.
10. Enum: `CleaningWorkerType` (`INTERNAL`, `OUTSOURCE`), `CleaningApprovalRole` (`INSPECTED_BY`, `KNOWN_BY`), dan `CleaningApprovalSignatureStatus` (`SIGNED`, `REOPENED`).

RBAC: Permission `cleaning.execute`, Role `CLEANING_WORKER` di `seedRbac.ts`. Akun outsource memakai `UserAccount.employeeId = null` dan `createdByUserId` untuk membatasi kepemilikan administratif akun; tidak ada model outsource terpisah.

---

## 3. Migration & Synchronization Strategy

- **Development Mode**: Sinkronisasi skema langsung ke MariaDB menggunakan `prisma db push` (`npm run db:push` atau `npm run db:reset:dev`).
- **Catatan Operasional**: Tabel internal Prisma `_prisma_migrations` tidak dibuat saat menjalankan `db:push`. Jika lingkungan produksi ingin berpindah ke workflow migrasi terkelola (`prisma migrate deploy`), baseline migrasi awal harus diterapkan secara hati-hati agar tidak menimpa data yang sudah ada.

# Data Model & Storage — Absensi & HRIS WIG

> **Purpose**: Persistent data and schema knowledge.  
> **Source of Truth**: `prisma/schema.prisma` and live database tables.  
> **Last Verified**: 2026-09-10  

Dokumen ini mendokumentasikan teknologi penyimpanan, skema basis data MariaDB/Prisma, 47 model entitas, relasi antar tabel, dan strategi migrasi.


---

## 1. Storage Technology

- **Database Engine**: MariaDB 10.11+ / MySQL 8.0+
- **ORM / Schema Tool**: Prisma ORM 6.19.2 (`provider = "mysql"`)
- **Connection URI**: Dikonfigurasi via environment variable `DATABASE_URL` (`mysql://USER:PASSWORD@HOST:3306/DATABASE`).
- **Penyimpanan Berkas Biner (MediumBlob)**: Dokumen BAST aset disimpan langsung di kolom `file_data` tabel `asset_bast_documents` sebagai biner `MediumBlob` (maksimal 16MB).
- **Penyimpanan Berkas Disk Fisik**: Foto kunjungan dinas disimpan di direktori filesystem lokal `/storage/visit-photos/`, dan berkas unggahan umum di `/public/uploads/`.

---

## 2. Comprehensive Model & Table Catalog

Basis data terdiri dari **47 model Prisma** yang dipetakan ke **50 tabel fisik** pada basis data MariaDB (`hris_local`):

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
23. `AttendanceRecord` (`attendance_records`): Kehadiran harian (`date`, `clock_in`, `clock_out`, `clock_in_location`, `clock_out_location`, `clock_in_photo`, `clock_out_photo`, `status`). Constraint unik: `[employeeId, date]`.
24. `AttendanceCorrection` (`attendance_corrections`): Permohonan koreksi absensi (`target_date`, `proposed_clock_in`, `proposed_clock_out`, `status`, `assigned_manager_id`).
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

---

## 3. Migration & Synchronization Strategy

- **Development Mode**: Sinkronisasi skema langsung ke MariaDB menggunakan `prisma db push` (`npm run db:push` atau `npm run db:reset:dev`).
- **Catatan Operasional**: Tabel internal Prisma `_prisma_migrations` tidak dibuat saat menjalankan `db:push`. Jika lingkungan produksi ingin berpindah ke workflow migrasi terkelola (`prisma migrate deploy`), baseline migrasi awal harus diterapkan secara hati-hati agar tidak menimpa data yang sudah ada.

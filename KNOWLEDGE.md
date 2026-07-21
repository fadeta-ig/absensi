# KNOWLEDGE.md - Pemahaman Project HRIS

Dokumen ini ditulis untuk AI yang akan melanjutkan pekerjaan pada project ini. Isinya adalah pemahaman faktual atas codebase: struktur, alur data, fitur, dependensi internal, dan pola yang konsisten dipakai. Dokumen ini tidak berisi penilaian, opini, atau saran perubahan.

## 1. Gambaran Sistem

Project ini adalah aplikasi HRIS/PWA bernama WIG HRIS. Aplikasi dibangun dengan Next.js App Router, React, TypeScript, Prisma, MySQL, Tailwind CSS, dan beberapa library pendukung untuk PWA, geolokasi, pengenalan wajah, ekspor file, QR, email, push notification, dan pemrosesan gambar.

Konteks utamanya adalah sistem internal perusahaan untuk:

- HR: mengelola data karyawan, absensi, cuti, lembur, payroll, slip gaji, berita, surat karyawan, audit, laporan, master data, dan monitoring aset secara baca.
- GA: mengelola aset perusahaan, kategori aset, assignment aset, inspeksi, maintenance, BAST, QR aset, ticketing aset, SIM card, dan dashboard operasional aset.
- Karyawan: melakukan absensi berbasis lokasi dan wajah, melihat riwayat absensi, mengajukan koreksi absensi, cuti, lembur, kunjungan kerja, surat, melihat slip gaji, berita, todo, profil, aset yang dipakai, dan mendaftarkan wajah.

Sistem berjalan sebagai aplikasi web Next.js dengan API route internal. Browser mengakses halaman di `src/app`, halaman memanggil route di `src/app/api`, route memakai service di `src/lib/services`, service memakai Prisma client dari `src/lib/prisma.ts`, dan Prisma menyimpan data ke MySQL sesuai `prisma/schema.prisma`.

## 2. Stack dan Runtime

Teknologi utama:

- Next.js `16.1.6` dengan App Router.
- React `19.2.3`.
- TypeScript dengan mode `strict`.
- Prisma `6.19.0` dengan provider database `mysql`.
- Tailwind CSS untuk styling.
- `@ducanh2912/next-pwa` untuk PWA/service worker.
- `face-api.js`, `@tensorflow/tfjs`, dan `@tensorflow/tfjs-backend-webgl` untuk face recognition di client.
- `bcryptjs` untuk hash password.
- `jose` untuk JWT.
- `zod` untuk validasi environment dan payload.
- `winston` untuk logging.
- `exceljs`, `xlsx`, `jspdf`, dan `jspdf-autotable` untuk ekspor/import file.
- `leaflet`, `react-leaflet`, dan `lucide-react` untuk UI peta dan ikon.
- `html5-qrcode`, `qrcode`, dan `react-qr-code` untuk QR code.
- `nodemailer` untuk email.
- `web-push` untuk push notification.
- `sharp` untuk validasi dan watermark foto kunjungan.
- `vitest` untuk pengujian.

Script utama di `package.json`:

- `dev`: menjalankan Next.js development server.
- `build`: melakukan `prisma generate` lalu build Next.js.
- `start`: menjalankan server production.
- `lint`: menjalankan ESLint.
- `db:push`: push schema Prisma.
- `db:studio`: membuka Prisma Studio.
- `seed:*`: menjalankan script seed Prisma.
- `test`: menjalankan Vitest.

Konfigurasi penting:

- `tsconfig.json` memakai alias `@/*` ke `./src/*`.
- `next.config.ts` mengaktifkan PWA hanya di non-development, menambahkan security headers, dan mengatur fallback Webpack untuk modul Node tertentu.
- `tailwind.config.js` mendefinisikan tema utama maroon/gold dan `darkMode: "class"`.
- `components.json` menunjukkan gaya shadcn `new-york`, ikon `lucide`, dan alias komponen/lib.
- `.env` berisi konfigurasi database, JWT, SMTP, face threshold, VAPID, dan CRON secret. Nilai rahasia tidak boleh diasumsikan dari dokumentasi ini.

## 3. Struktur Folder

### Root Project

- `package.json`: dependency dan script.
- `tsconfig.json`: konfigurasi TypeScript dan alias import.
- `next.config.ts`: konfigurasi Next.js, PWA, Webpack, dan security headers.
- `tailwind.config.js`: warna, font, dan mode tema.
- `eslint.config.mjs`: konfigurasi lint.
- `vitest.config.ts`: konfigurasi test.
- `components.json`: konfigurasi komponen UI.
- `.env`: konfigurasi runtime lokal, berisi rahasia dan endpoint.
- `prisma/`: schema, migration, dan script seed/migrasi data.
- `public/`: aset statis, icon PWA, service worker, model face-api, template import, logo, dan file upload publik.
- `src/`: seluruh source aplikasi.
- `logs/`: file log runtime.
- `storage/`: storage file privat/runtime jika dibuat oleh service; path ini dipakai oleh service dokumen dan foto kunjungan.

### `prisma/`

- `schema.prisma`: definisi model database, enum, relation, map field/table, dan index/unique constraint.
- `migrations/`: migration SQL historis untuk evolusi schema.
- `seed.ts`, `seedHR.ts`, `seedGA.ts`, `seedDev.ts`, `seedEmployee.ts`: script seed user/role/data demo.
- `seedRbac.ts`: helper seed roles, permissions, role-permission.
- `seedAssets.ts`: import data aset dari file eksternal.
- `linkAssetEmployees.ts`: menghubungkan aset ke employee berdasarkan nama.
- `migrate-json-to-relations.ts`: memindahkan data JSON legacy payslip/inspection ke tabel relational.

### `public/`

- `manifest.json`: manifest PWA dengan nama WIG HRIS, mode standalone portrait, theme maroon, dan ikon.
- `sw.js`, `workbox-*.js`, worker JS lain: output/custom service worker PWA.
- `worker/index.js`: custom service worker source untuk push notification dan klik notifikasi.
- `models/`: file model face-api untuk deteksi wajah, landmark, recognition, dan tiny face detector.
- `logo-wig.png`, `icon-*.svg`, `next.svg`: aset visual.
- `templates/Template_Import_Karyawan_V2.xlsx`: template import karyawan.
- `uploads/news/...`: contoh/upload media berita.

### `src/app`

Folder App Router Next.js.

- `layout.tsx`: root layout, metadata, viewport, `ThemeProvider`, `ConfirmModal`, dan `ToastContainer`.
- `globals.css`: token tema, class global, komponen CSS generik, modal, table, button, form, badge, spinner, animasi, safe-area.
- `page.tsx`: halaman login.
- `proxy.ts`: guard halaman berbasis JWT untuk `/dashboard`, `/employee`, dan `/ga`.
- `api/`: seluruh backend API route.
- `dashboard/`: portal HR.
- `ga/`: portal GA.
- `employee/`: portal karyawan.
- `scan/[id]/`: halaman publik terbatas untuk scan QR aset.

### `src/components`

Komponen shared lintas portal:

- Layout: `AppShell`, `ThemeProvider`, `ThemeToggle`.
- Feedback: `Toast`, `ConfirmModal`, `ConfirmDialog`, `Skeleton`, `Pagination`.
- Notifikasi: `NotificationCenter`, `EmployeeNotificationPanel`, `PushNotificationManager`.
- HR dashboard widgets: `StatsGrid`, `PendingBadges`, `QuickMenu`, `WeeklyChart`, `DepartmentStats`, `ActivityFeed`, `PendingLeaveList`, `TodayAttendance`, `LeaveCalendar`.
- Employee management: `EmployeeForm`, section form karyawan, `BulkImportModal`, `EmployeeStatusModal`, `Employee360View`.
- Map/evidence: `LocationMap`, `VisitPhotoGrid`.

### `src/features/ga`

Modul fitur GA yang dipisah dari komponen shared:

- `components/AssetForm.tsx`: form create/edit asset.
- `components/SimCardForm.tsx`: form SIM card.
- `components/AssetStatCards.tsx`: kartu statistik aset.
- `components/badges/AssetBadges.tsx`: badge status/kondisi/holder.
- `styles/assetStyles.ts`: style constants untuk asset UI.

### `src/lib`

Lapisan utility, auth, middleware, service, types, dan validasi:

- `prisma.ts`: singleton Prisma client.
- `env.ts`: validasi environment dengan Zod.
- `auth.ts`: login, JWT session, verifikasi session aktif, role/permission projection.
- `permissions.ts`: role, permission, helper akses, landing path.
- `middleware/`: helper route API (`requireAuth`, response standard, validasi body, rate limit, sanitize).
- `services/`: aturan domain dan operasi DB.
- `security/pii.ts`: enkripsi/hash/masking data PII.
- `validations/validationSchemas.ts`: Zod schema payload umum.
- `faceRecognition.ts`, `gpsValidator.ts`, `webPush.ts`, `export.ts`, `timezone.ts`, `logger.ts`, `utils.ts`: utilitas lintas fitur.
- `constants/`: konstanta BPJS dan PPh 21.
- `types/`: tipe asset.
- `__tests__/` dan `services/__tests__/`: test unit/integrasi.

### `src/types`

- `index.ts`: tipe frontend/domain untuk Employee, Attendance, Payslip, Leave, News, Todo, Visit, Overtime, dan tipe terkait.

## 4. Model Domain dan Database

Database dimodelkan di `prisma/schema.prisma` dan memakai MySQL.

### Employee sebagai pusat domain

`Employee` adalah model pusat. Field utamanya:

- Identitas: `id`, `employeeId`, `employeeIdNormalized`, `name`, `academicTitle`, `preferredName`, `email`, `phone`, `alternatePhone`, `gender`.
- Organisasi: `departmentId`, `divisionId`, `positionId`, `managerId`.
- Kepegawaian: `employmentType`, `joinDate`, `employmentStartDate`, `employmentEndDate`, `probationEndDate`, `isActive`, `statusChangedAt`.
- Absensi: `faceDescriptor`, `shiftId`, `bypassLocation`, relasi `locations`.
- Cuti: `totalLeave`, `usedLeave`.
- Payroll: `basicSalary`, relasi `payrollComponents`, `payslips`, `overtimes`.
- Profil: `avatarUrl`.
- Relasi self manager/subordinates berbasis `employeeId`.

Relasi employee menghubungkan hampir semua fitur: attendance, leave, overtime, payslip, todo, visit, asset assignment, correction approval/request, letter request, private profile, identity, addresses, emergency contacts, bank accounts, tax profile/history, documents, SIM card, dan status histories.

### Auth dan RBAC

Model auth:

- `UserAccount`: akun login. Berisi `username`, `email`, `passwordHash`, `displayName`, `isActive`, `sessionVersion`, relasi optional ke employee via `employeeId`, waktu login/password change, creator, roles, audit logs, push subscriptions, dan aktivitas GA/HR.
- `Role`: role sistem.
- `Permission`: permission granular.
- `UserRoleAssignment`: relasi user-role.
- `RolePermission`: relasi role-permission.

Role default yang dipakai:

- `SUPER_ADMIN`
- `HR_ADMIN`
- `GA_ADMIN`
- `EMPLOYEE_USER`

Permission default:

- `user.manage`
- `hr.manage`
- `ga.manage`
- `employee.self`
- `asset.read`

### Master organisasi

Model master:

- `Division`
- `Department`, optional terhubung ke `Division`
- `Position`
- `Location`, memiliki latitude, longitude, radius, dan relasi many-to-many employee
- `WorkShift` dan `WorkShiftDay`

### Absensi, cuti, lembur, payroll

- `AttendanceRecord`: satu record unik per `employeeId + date`, menyimpan clock in/out, lokasi JSON string, foto JSON/LongText, status, notes.
- `AttendanceCorrection`: request koreksi absensi dengan target date, proposed clock in/out, reason, attachment, status, requester, assigned manager, approver.
- `LeaveRequest`: request cuti dengan type, date range, reason, status, attachment.
- `OvertimeRequest`: request lembur dengan date, start/end time, hours, approvedHours, holiday flag, overtimePay, reason, status.
- `PayrollComponent`: master komponen earning/deduction.
- `EmployeePayrollComponent`: nilai komponen payroll per employee.
- `PayslipRecord`: slip gaji per employee/period.
- `PayslipItem`: item allowance/deduction relational untuk payslip.

### Kunjungan kerja

- `VisitReport`: draft dan realisasi kunjungan. Menyimpan employee, tanggal, client, address, purpose, result, target location JSON, radius, clock in/out time, clock in/out location JSON, status, notes, dan flag `hrChecked`.
- `VisitPhoto`: bukti foto kunjungan relational dengan phase (`CLOCK_IN` atau `CLOCK_OUT`), sequence, category, caption, path original/stamped, timestamps, lat/lng, accuracy, distance, SHA256, MIME, file size, width, height, dan overlayVersion.

### Asset dan GA

Model utama:

- `AssetCategory`: nama dan prefix kode aset.
- `Asset`: data aset, kode, kategori, kondisi, status, holder type, assignment, spesifikasi perangkat, finansial, garansi.
- `AssetHistory`: riwayat assignment/return/reassign/retire.
- `AssetBastDocument`: dokumen BAST yang disimpan sebagai blob di database.
- `AssetInspection`: catatan inspeksi fisik.
- `InspectionChecklistItem`: item checklist inspeksi.
- `AssetMaintenance`: catatan maintenance.
- `AssetTicket`: ticket aset dari karyawan.
- `SimCard`: data SIM card, provider, nomor, expired date, assignment employee.

Enum asset:

- `AssetKondisi`: `BAIK`, `KURANG_BAIK`, `RUSAK`.
- `AssetStatus`: `AVAILABLE`, `IN_USE`, `MAINTENANCE`, `RETIRED`, `COMPANY_OWNED`.
- `HolderType`: `EMPLOYEE`, `FORMER_EMPLOYEE`, `TEAM`, `GA_POOL`, `COMPANY_OWNED`.

### Data privat karyawan

Data privat dipisah dari `Employee`:

- `EmployeePrivateProfile`
- `EmployeeIdentity`
- `EmployeeAddress`
- `EmployeeEmergencyContact`
- `EmployeeBankAccount`
- `EmployeeTaxProfile`
- `EmployeeTaxHistory`
- `EmployeeDocument`
- `EmployeeImportJob`

Field identitas tertentu dienkripsi dan di-hash untuk pencarian/keunikan internal. Service PII memakai AES-256-GCM dengan format `enc:v1` dan hash HMAC.

### Audit dan notifikasi

- `AuditLog`: menyimpan aksi, entity, entityId, details JSON string, actor type, actor user, identifier, nama, role, IP, userAgent.
- `PushSubscription`: subscription browser untuk Web Push. Unik per endpoint dan terhubung ke `UserAccount`.

## 5. Auth, Session, dan Akses

Alur login:

1. Halaman `src/app/page.tsx` mengirim `employeeId`, `password`, dan optional `rememberMe` ke `/api/auth/login`.
2. Route login memakai rate limit preset login dan `loginSchema`.
3. `verifyLogin` di `src/lib/auth.ts` mencari `UserAccount` aktif berdasarkan username/email, memverifikasi bcrypt password, dan memperbarui `lastLoginAt`.
4. `createSession` membuat JWT HS256 berisi user id, username, role/permission, employee link, dan `sessionVersion`.
5. JWT disimpan di cookie `session`. Durasi default 8 jam, atau 30 hari jika remember me.
6. Response mengembalikan user projection dan `landingPath`.

Verifikasi session:

- `getActiveSession` membaca cookie `session`, memverifikasi JWT dengan `JWT_SECRET`, lalu mengambil user dari database.
- Session dianggap valid jika user aktif, `sessionVersion` cocok, role/permission valid, dan relasi employee memenuhi aturan portal karyawan.
- `toPrincipal` membentuk objek session yang dipakai UI/API: `userId`, `username`, `displayName`, `employeeId`, employee record id, department/division, roles, permissions, primaryRole, role projection (`hr`, `ga`, `employee`), dan `hasSubordinates`.

Guard halaman:

- `src/proxy.ts` melindungi halaman, bukan API.
- `/dashboard` membutuhkan `hr.manage`.
- `/dashboard/users` membutuhkan `user.manage`.
- `/employee` membutuhkan `employee.self` dan employee terhubung.
- `/ga` membutuhkan `ga.manage`.
- User tanpa session diarahkan ke login dengan query `redirect`.
- Landing path ditentukan dari prioritas permission: HR ke `/dashboard`, GA ke `/ga`, employee ke `/employee`.

Guard API:

- Route API umumnya memakai `requireAuth` dari `apiGuard`.
- Response standar:
  - 401: `{ error: "Sesi Anda telah berakhir. Silakan login kembali." }` dan cookie session dihapus.
  - 403: `{ error: "Anda tidak memiliki akses untuk melakukan tindakan ini." }`.
  - 400 validasi: `{ error: "Data tidak valid", details: [...] }`.
  - 500: `{ error: "Terjadi kesalahan pada server. Silakan coba lagi." }`.
- Payload disanitasi dengan `sanitizeObject` sebelum validasi Zod.
- Rate limit in-memory dipakai untuk login, API umum, dan endpoint sensitif.

Permission helper:

- `canManageUsers`
- `canManageHr`
- `canManageGa`
- `canUseEmployeePortal`
- `canReadAssets`

## 6. Lapisan Service dan Utility

Pola umum:

- API route mengurus auth, permission, parsing request, validasi payload, dan response.
- Service mengurus query/mutasi Prisma dan aturan domain.
- Mapper mengubah tipe Prisma/Date/JSON menjadi DTO yang aman untuk UI.
- Utility dipakai lintas fitur untuk formatting, waktu, jarak, logging, dan keamanan.

Service utama:

- `analyticsService.ts`: data Employee 360 dan ringkasan HR.
- `attendanceService.ts`: CRUD absensi dan mapping JSON location/photo.
- `attendanceCorrectionService.ts`: submit, list, dan resolve koreksi absensi.
- `auditService.ts`: membuat audit log dari session atau system actor.
- `birthdayService.ts`: normalisasi dan grouping ulang tahun.
- `bpjsService.ts`: kalkulasi BPJS.
- `emailService.ts`: kirim email credential/password jika SMTP tersedia.
- `employeeDocumentService.ts`: upload/read/delete dokumen privat employee di storage.
- `employeePrivateService.ts`: apply dan serialize data privat employee, termasuk enkripsi/hash.
- `employeeService.ts`: visible employees, create, update, delete employee, relasi user, payroll, lokasi, dan private data.
- `employeeStatusService.ts`: overview dan perubahan status aktif/nonaktif employee.
- `holidayService.ts`: normalisasi data hari libur dari upstream.
- `leaveService.ts`: create/update cuti dan perhitungan hari kerja/cuti tahunan.
- `newsService.ts`: CRUD berita dan penghapusan media lama saat media diganti.
- `overtimeCalcService.ts`: kalkulasi lembur sesuai formula yang dipakai aplikasi.
- `overtimeService.ts`: create/update/delete lembur.
- `payslipService.ts`: create/get/delete payslip dan itemnya.
- `pph21Service.ts`: kalkulasi PPh 21 TER dan ringkasan tahunan.
- `shiftService.ts`: CRUD shift dan jadwal harian.
- `simCardService.ts`: CRUD SIM card.
- `todoService.ts`: CRUD todo karyawan.
- `userService.ts`: manajemen admin/user.
- `visitService.ts`: state machine kunjungan dan mapping DTO.
- `visitPhotoService.ts`: validasi, watermark, penyimpanan, pembacaan, dan cleanup foto kunjungan.
- `assetService.ts`: barrel export modul asset.
- `services/assets/*`: query, command, mapper, inspection, type, dan konstanta asset.
- `services/bulk-import/*`: parser, validator, executor, template, type import employee.

Utility penting:

- `timezone.ts`: helper tanggal/jam/hari berbasis WIB.
- `utils.ts`: `cn`, format tanggal Indonesia, dan `calculateDistance` Haversine.
- `gpsValidator.ts`: validasi geolocation client berdasarkan accuracy dan pergerakan.
- `faceRecognition.ts`: load model face-api, scan beberapa frame, average descriptor, compare Euclidean.
- `export.ts`: export Excel/PDF untuk browser dan PDF slip gaji.
- `webPush.ts`: setup lazy Web Push.
- `logger.ts`: Winston console dan file log production.
- `clientLogger.ts`: kirim warn/error client ke `/api/logs/client`.
- `security/pii.ts`: enkripsi, hash, mask, dan normalisasi employee ID.

## 7. Alur Kerja Utama

### Login dan routing portal

1. User login dari `/`.
2. API mengembalikan session dan landing path.
3. Client melakukan `router.push(landingPath)`.
4. `src/proxy.ts` menjaga akses halaman sesuai permission.
5. Layout portal (`dashboard/layout.tsx`, `ga/layout.tsx`, `employee/layout.tsx`) memanggil `/api/auth/me` untuk validasi client-side dan membangun navigasi.

### Pengelolaan karyawan HR

1. HR membuka `/dashboard/employees`.
2. Halaman memanggil `/api/employees?status=all` dan `/api/shifts`.
3. Create/edit memakai `EmployeeForm`.
4. `EmployeeForm` memuat master data: divisions, departments, positions, locations, shifts, payroll components, dan employee manager candidates.
5. Submit create/put ke `/api/employees`.
6. API melakukan validasi `employeeCreateSchema` atau `employeeUpdateSchema`.
7. `employeeService` memvalidasi master refs, manager, role employee user, employee ID normalized, tanggal kerja, payroll components, location, dan private data.
8. Data employee, private data, relasi lokasi, komponen payroll, dan user account disimpan melalui Prisma.
9. Untuk create employee, password awal bisa dikirim melalui `emailService`.
10. Audit dicatat melalui `auditService`.

### Import karyawan

1. HR membuka modal import di `/dashboard/employees`.
2. Client mengunggah file `.xlsx`.
3. Dry run dikirim ke `/api/employees/import`.
4. Parser membaca sheet pertama, mendeteksi header, alias kolom, format tanggal, dan mode update/create/upsert.
5. Validator memeriksa master references, duplikasi, konflik employee ID/email, manager, dan perubahan field.
6. Jika dieksekusi, executor membuat import job idempotent berdasarkan checksum dan options.
7. Executor membuat/update employee, private data, master optional, status, user account, dan email password sesuai opsi.

### Perubahan status karyawan

1. HR membuka `EmployeeStatusModal`.
2. UI memanggil `/api/employees/[id]/status` untuk overview.
3. PATCH mengirim status baru, alasan, tanggal efektif, dan optional manager pengganti.
4. Service memproses status employee, relasi subordinate jika diperlukan, push subscription, `sessionVersion`, status history, dan audit.

### Absensi karyawan

1. Karyawan membuka `/employee/attendance`.
2. Client mengambil session, status absensi hari ini, dan status face descriptor.
3. Browser mengambil GPS melalui `getValidatedPosition`.
4. Jika employee tidak `bypassLocation`, lokasi dibandingkan dengan lokasi kerja yang diperbolehkan dan radiusnya.
5. Kamera mengambil foto.
6. Client face recognition memuat model dari `public/models`, mendeteksi wajah, membuat descriptor, dan membandingkan dengan descriptor terdaftar.
7. Submit ke `/api/attendance` membawa lokasi dan foto.
8. Route memastikan jadwal shift, status hari, radius lokasi, dan clock in/out.
9. `AttendanceRecord` dibuat atau diperbarui untuk tanggal tersebut.
10. HR melihat data dari `/dashboard/attendance`; employee melihat riwayat dari `/employee/attendance-history`.

### Koreksi absensi

1. Employee mengajukan koreksi di `/employee/attendance/correction`.
2. Payload dikirim ke `/api/attendance/correction`.
3. Service membuat `AttendanceCorrection` dengan status `PENDING` dan assigned manager jika ada.
4. HR melihat dan memproses dari `/dashboard/attendance`.
5. Jika disetujui, service memperbarui atau membuat `AttendanceRecord` untuk target date.

### Cuti

1. Employee submit cuti dari `/employee/leave`.
2. API `/api/leave` memvalidasi type, date range, reason, attachment, dan aturan type tertentu.
3. `leaveService` menghitung hari kerja, memperhitungkan hari off shift, dan memproses kuota annual leave.
4. HR memproses approve/reject dari `/dashboard/leave`.
5. Perubahan status/date cuti annual menyesuaikan `usedLeave`.

### Lembur

1. Employee submit lembur dari `/employee/overtime`.
2. API `/api/overtime` menghitung durasi dari date/start/end, termasuk rollover lewat tengah malam.
3. `overtimeService` membuat request dengan status awal `pending`.
4. HR approve/reject di `/dashboard/overtime`, bisa mengisi `approvedHours` dan `isHoliday`.
5. Kalkulasi pay menggunakan `overtimeCalcService`.
6. Payroll bulk memakai lembur approved untuk periode terkait.

### Payroll dan slip gaji

1. HR membuka `/dashboard/payroll`.
2. UI memuat employees, payslips, master payroll components, departments, divisions, dan overtime.
3. Recap menghitung estimasi dari basic salary, komponen payroll employee/master, dan overtime approved.
4. HR bisa membuat payslip manual atau bulk generate ke `/api/payslips/bulk`.
5. `PayslipRecord` menyimpan basic salary, overtime, net salary, notes, period, dan item relational di `PayslipItem`.
6. Employee melihat slip di `/employee/payslip` dan bisa download PDF client-side.

### Kunjungan kerja

1. Employee membuka `/employee/visits`.
2. Employee membuat draft kunjungan dengan client, alamat, tujuan, target location, radius, dan notes.
3. Saat clock in, client memvalidasi posisi terhadap target radius dan meminta minimal 2 foto, maksimal 5 foto.
4. Route `/api/visits` action `clock_in` memvalidasi payload, service mengubah status menjadi `clocked_in`, dan `visitPhotoService` memproses foto.
5. Saat clock out, employee mengirim lokasi, foto, dan result; status menjadi `clocked_out`.
6. Foto original dan stamped disimpan di storage, metadata disimpan di `VisitPhoto`.
7. HR membuka `/dashboard/visits`, melihat detail dan evidence, lalu mengubah `hrChecked`.
8. Endpoint `/api/visits/photos/[photoId]` menyajikan varian stamped atau original sesuai akses.

### Berita

1. HR mengelola berita di `/dashboard/news`.
2. Media upload dikirim ke `/api/news/upload`.
3. CRUD berita memakai `/api/news`.
4. Employee membaca berita di `/employee/news` dan juga ringkasan di home employee.
5. Daftar berita diurutkan dengan pinned lebih dulu, lalu terbaru.

### Todo karyawan

1. Employee mengelola todo di `/employee/todos`.
2. API `/api/todos` membuat, memperbarui text/completed, menghapus, dan mengambil todo berdasarkan employee session.
3. UI menghitung progress dari jumlah todo completed.

### Surat karyawan

1. Employee membuka `/employee/documents`.
2. Employee submit letter request melalui `/api/letter-requests`.
3. HR mengelola request dari `/dashboard/letter-requests`.
4. Status yang dipakai: `PENDING`, `PROCESSING`, `READY`, `REJECTED`.
5. Tipe surat: `SK_KERJA`, `KET_PENGHASILAN`, `KET_MASIH_BEKERJA`, `BPJS`.

### Asset GA 

1. GA membuka `/ga`.
2. Dashboard memuat statistik aset dari `/api/assets/stats` dan sample aset available dari `/api/assets`.
3. GA mengelola kategori di `/ga/categories` dan data asset di `/ga/assets`.
4. Create/edit asset memakai `AssetForm`, kategori, holder type, assignment employee/team/pool/company, spesifikasi, finansial, dan garansi.
5. Mutasi asset dilakukan melalui `/api/assets`, `/api/assets/[id]`, `/api/assets/assign`, `/api/assets/[id]/retire`, `/api/assets/[id]/inspect`, dan `/api/assets/[id]/maintenance`.
6. Riwayat assignment/return/reassign/retire disimpan di `AssetHistory`.
7. Dokumen BAST upload/download/delete lewat `/api/assets/bast`.
8. QR aset dibuat via `/api/assets/qr` dan halaman publik terbatas tersedia di `/scan/[id]`.
9. Employee melihat asset pribadi dan membuat ticket di `/employee/assets`.
10. GA memproses ticket di `/ga/tickets`.

### SIM card

1. GA membuka `/ga/sim`.
2. UI memuat daftar dari `/api/sim-cards`.
3. `SimCardForm` mengisi provider, phoneNumber, expiredDate, assignedToId, dan notes.
4. Service `simCardService` membuat/update/delete `SimCard` dan mengatur `assignedAt` saat assignment berubah.

### Laporan dan ekspor

1. HR membuka `/dashboard/reports`.
2. UI memilih tipe report: attendance, visits, overtime, leave.
3. Filter meliputi periode, division, department, employee, dan opsi tampilan attendance.
4. API `/api/export` menghasilkan data Excel atau JSON.
5. Client memakai utilitas export untuk Excel/PDF pada halaman tertentu.

### Notification dan push

1. `PushNotificationManager` mendaftarkan service worker `/sw.js`.
2. Jika permission browser tersedia, subscription dikirim ke `/api/push/subscribe`.
3. HR notification center mengambil feed dari `/api/notifications` setiap interval.
4. Employee notification panel mengambil feed dari `/api/notifications/employee`.
5. Cron `/api/cron/daily-greeting` dapat mengirim push greeting harian berdasarkan subscription.

## 8. API Surface

### Auth

- `POST /api/auth/login`: login dan set cookie.
- `POST /api/auth/logout`: hapus session.
- `GET /api/auth/me`: session/current user.
- `GET/PUT /api/auth/profile`: profil employee self.
- `POST /api/auth/change-password`: ganti password dan increment session version.
- `POST /api/auth/send-password`: HR kirim/reset password employee.
- `GET/POST/DELETE /api/auth/face`: status, simpan, atau hapus face descriptor.

### HR employee dan user

- `GET/POST/PUT /api/employees`: list/create/update employee.
- `GET /api/employees/[id]`: detail employee HR termasuk data private DTO.
- `GET/PATCH /api/employees/[id]/status`: overview dan perubahan status.
- `GET/POST /api/employees/[id]/documents`: list/upload dokumen employee.
- `GET/DELETE /api/employees/[id]/documents/[documentId]`: download/delete dokumen employee.
- `GET /api/employees/assets`: assets by employee untuk HR/GA context.
- `GET /api/employees/birthdays`: ulang tahun employee.
- `POST /api/employees/import`: dry-run/execute import.
- `GET /api/employees/import/template`: download template import.
- `GET/POST/PATCH /api/users`: list/create/update/reset admin user.

### Master data

- `GET/POST/PUT/DELETE /api/master/divisions`
- `GET/POST/PUT/DELETE /api/master/departments`
- `GET/POST/PUT/DELETE /api/master/positions`
- `GET/POST/PUT/DELETE /api/master/locations`
- `GET/POST/PUT/DELETE /api/master/payroll-components`
- `GET/POST/PUT/DELETE /api/shifts`

### Operasional HR/employee

- `GET/POST /api/attendance`
- `GET/POST/PATCH /api/attendance/correction`
- `GET/POST/PUT /api/leave`
- `GET/POST/PUT/DELETE /api/overtime`
- `GET/POST/DELETE /api/payslips`
- `POST /api/payslips/bulk`
- `GET/POST/PUT/DELETE /api/todos`
- `GET/POST/PUT /api/letter-requests`
- `GET/POST/PUT/DELETE /api/news`
- `POST /api/news/upload`
- `POST /api/bpjs/calculate`
- `POST /api/pph21/calculate`

### Visits

- `GET/POST/PUT/DELETE /api/visits`: list, create draft, clock in, clock out, update draft, verify, delete draft.
- `GET /api/visits/photos/[photoId]`: ambil foto stamped/original sesuai akses.

### Asset dan GA

- `GET/POST /api/assets`
- `GET/PUT/DELETE /api/assets/[id]`
- `POST /api/assets/assign`
- `POST /api/assets/bulk`
- `GET/POST /api/assets/categories`
- `PUT/DELETE /api/assets/categories/[id]`
- `POST /api/assets/[id]/retire`
- `GET/POST /api/assets/[id]/inspect`
- `GET/POST /api/assets/[id]/maintenance`
- `GET/POST /api/assets/bast`
- `GET/DELETE /api/assets/bast/[id]`
- `GET /api/assets/export`
- `GET /api/assets/history`
- `GET /api/assets/qr`
- `GET /api/assets/stats`
- `GET /api/public/assets/[id]`
- `GET/POST /api/employee/assets`
- `GET/PUT /api/ga/tickets`
- `GET/POST /api/sim-cards`
- `GET/PUT/DELETE /api/sim-cards/[id]`

### Dashboard, export, cron, logs

- `GET /api/analytics`: ringkasan HR dashboard.
- `GET /api/audit`: audit log paginated.
- `GET /api/export`: export report.
- `GET /api/holidays`: hari libur berdasarkan tahun.
- `GET /api/notifications`: feed HR.
- `GET /api/notifications/employee`: feed employee.
- `POST/DELETE /api/push/subscribe`: kelola push subscription.
- `POST /api/logs/client`: logging warn/error client.
- `GET /api/cron/cleanup-photos`: cleanup foto absensi lama.
- `POST /api/cron/daily-greeting`: kirim push greeting.
- `GET /api/cron/generate-payroll`: generate payroll period.
- `GET /api/cron/reset-leave`: reset usedLeave.

## 9. Portal HR

Root portal HR: `/dashboard`.

Layout:

- `src/app/dashboard/layout.tsx` memakai `AppShell`.
- Mengecek `/api/auth/me`.
- Membutuhkan permission `hr.manage`.
- Menambahkan menu users jika user punya `user.manage`.
- Menu mencakup Dashboard, Attendance, Visits, Leave, Master Data, Payroll, Reports, Audit, News, Letter Requests, dan Asset monitoring.

Halaman utama:

- `/dashboard/page.tsx`: dashboard HR. Fetch employees, attendance, leave, news, analytics. Ada refresh interval saat tab visible. Komponen menampilkan stats, pending badge, quick menu, weekly chart, department stats, activity feed, pending leave, today attendance, dan leave calendar.

Employee:

- `/dashboard/employees`: list employee dengan filter status/search dan aksi create/edit/status/password/360/import.
- `/dashboard/employees/create`: create employee.
- `/dashboard/employees/[id]/edit`: edit employee.
- `/dashboard/employees/[id]/360-view`: Employee 360 view server-side.
- `EmployeeForm` adalah komponen sentral create/edit employee.
- Form employee dibagi menjadi section: identity, job, payroll, location, private data, dan dokumen.

Attendance:

- `/dashboard/attendance`: log absensi dan koreksi.
- Komponen: `AttendanceSummary`, `AttendanceFilters`, `AttendanceLogTab`, `AttendanceCorrectionTab`.
- Mendukung filter tanggal, status, division, department, search, pagination, export Excel/PDF, dan preview foto.

Leave:

- `/dashboard/leave`: list cuti, statistik status/type, search, detail modal, approve/reject, attachment viewer, dan informasi sisa cuti.

Overtime:

- `/dashboard/overtime`: list/filter/statistik lembur, detail modal, approve/reject, approved hours, holiday flag, dan display overtime pay.

Visits:

- `/dashboard/visits`: list kunjungan, statistik, filter, detail modal, verifikasi `hrChecked`, dan grid foto evidence.

Payroll:

- `/dashboard/payroll`: recap, create, history, bulk generate, export, detail slip, dan download PDF.
- `/dashboard/master-payroll`: CRUD master payroll component.

Master:

- `/dashboard/master-data`: tab divisions, departments, positions, locations.
- Location memakai map Leaflet, browser geolocation, dan Nominatim search.
- `/dashboard/shifts`: CRUD shift dan jadwal mingguan.

Admin/user:

- `/dashboard/users`: manajemen admin user berbasis `user.manage`. Mendukung standalone admin, promote employee, edit, activate/deactivate, dan reset password.

News dan surat:

- `/dashboard/news`: CRUD berita, pin, upload media.
- `/dashboard/letter-requests`: proses surat employee.

Audit/report/calculator:

- `/dashboard/audit`: audit log paginated dengan filter.
- `/dashboard/reports`: report attendance/visits/overtime/leave dan export.
- `/dashboard/pph21-calculator`, `/dashboard/bpjs-calculator`, `/dashboard/overtime-calculator`: kalkulator HR.

Asset monitoring HR:

- `/dashboard/assets`: HR melihat data asset secara baca. Data diambil dari endpoint asset yang juga dipakai GA, dengan batasan akses HR terhadap kategori/status tertentu sesuai route/service.

## 10. Portal GA

Root portal GA: `/ga`.

Layout:

- `src/app/ga/layout.tsx` memakai `AppShell`.
- Mengecek `/api/auth/me`.
- Membutuhkan permission `ga.manage`.
- Menu: Dashboard, Data Master/Kategori, Assets, QR scan/print, Ticketing Aset, dan SIM.

Dashboard:

- `/ga/page.tsx` mengambil `/api/assets/stats` dan sample asset available.
- Menampilkan total, available, in use, maintenance, retired, rusak, total nilai, breakdown category, warranty expiry, dan SIM expiry.

Assets:

- `/ga/assets`: table asset dengan search/filter/pagination/export/delete.
- `/ga/assets/create`: create asset.
- `/ga/assets/[id]/edit`: edit asset.
- `/ga/assets/[id]`: detail asset dengan tab spec, history, inspections, maintenance.
- `/ga/assets/[id]/assign`: assign/return/reassign asset.
- `/ga/assets/import`: bulk import asset dari CSV/XLS/XLSX, max 300 row.
- `/ga/assets/print`: print QR label A4.

AssetForm:

- Field identitas: category, code/name, kondisi, status.
- Field holder: `EMPLOYEE`, `FORMER_EMPLOYEE`, `TEAM`, `GA_POOL`, `COMPANY_OWNED`.
- Field spesifikasi: serial number, IMEI, manufacturer, model.
- Field finansial/garansi: purchase date, price, warranty expiry.

QR dan public scan:

- `/ga/scan`: scanner kamera memakai `html5-qrcode`, menerima URL `/scan/{id}` atau `/ga/assets/{id}`.
- `/scan/[id]`: halaman publik terbatas memakai `/api/public/assets/[id]`, menampilkan info asset terbatas dan form inspeksi jika user GA.

Kategori:

- `/ga/categories`: CRUD kategori asset.
- Kategori memiliki prefix untuk generate kode asset.

Ticket:

- `/ga/tickets`: list ticket employee asset, filter/search, update status dan response GA.

SIM:

- `/ga/sim`: list/filter/statistik SIM card.
- `/ga/sim/create`: create SIM card.
- `/ga/sim/[id]/edit`: edit SIM card.
- Form memakai `provider`, `phoneNumber`, `expiredDate`, `assignedToId`, dan `notes`.

## 11. Portal Karyawan

Root portal employee: `/employee`.

Layout:

- `src/app/employee/layout.tsx` memakai `AppShell`.
- Mengecek `/api/auth/me`.
- Membutuhkan permission `employee.self` dan employee terhubung.
- Menu: Home, Attendance, History, Correction, Visits, Overtime, Payslip, Leave, Documents, Assets, News, Todos, Profile, Settings.
- Menu Monitoring Tim muncul jika session punya `hasSubordinates`.
- Mobile bottom nav menempatkan Attendance sebagai aksi utama.

Home:

- `/employee/page.tsx`: greeting, quick actions, status absensi hari ini, leave balance, berita, dan push notification manager.

Attendance:

- `/employee/attendance`: clock in/out dengan GPS, kamera, dan face verification.
- `/employee/attendance-history`: riwayat absensi dengan filter hari/bulan/tahun dan ringkasan status.
- `/employee/attendance/correction`: form dan history koreksi absensi.

Leave/overtime/payslip:

- `/employee/leave`: submit dan lihat status cuti.
- `/employee/overtime`: submit dan lihat status lembur.
- `/employee/payslip`: daftar dan detail slip gaji, export PDF.

Visits:

- `/employee/visits`: create draft, clock in, clock out, list status, detail evidence.
- Komponen lokal mencakup modal draft, modal clock in/out, validator lokasi, multi-photo capture, dan detail modal.

Profile/settings:

- `/employee/profile`: update phone dan avatar; data pekerjaan ditampilkan read-only.
- `/employee/settings`: ganti password dan registrasi/hapus face descriptor.

Documents/letter:

- `/employee/documents`: self-service letter request.

Assets:

- `/employee/assets`: asset yang dipakai employee dan ticket request/damage.

News/todos:

- `/employee/news`: daftar dan detail berita.
- `/employee/todos`: CRUD todo pribadi.

Monitoring:

- `/employee/monitoring`: daftar subordinate aktif yang terlihat oleh manager.
- `/employee/monitoring/[id]`: Employee 360 view untuk subordinate yang boleh terlihat.

## 12. Validasi Data

Validasi utama ada di `src/lib/validations/validationSchemas.ts`.

Schema auth:

- `loginSchema`: employeeId, password, rememberMe optional.
- `changePasswordSchema`: current password dan password baru minimal 8 karakter, mengandung huruf besar, angka, dan simbol.
- `sendPasswordSchema`: employeeId.

Schema attendance:

- `locationSchema`: lat/lng dalam rentang valid, accuracy optional, acquiredAt optional ISO datetime.
- `attendanceSchema`: lokasi optional untuk bypassLocation dan foto wajib dengan batas ukuran base64.

Schema employee:

- Create/update employee meliputi data identitas, organisasi, gender, manager, join date, leave, shift, bypass location, locations, salary, payroll components, avatar, employment type, private fields, identity, address, emergency contact, bank, dan tax profile.
- Validasi tanggal memastikan employment end tidak sebelum start dan birth date tidak berada di masa depan.
- Employee update tidak memakai schema ini untuk mengubah role akun, password, faceDescriptor, atau employeeId.

Schema visit:

- Draft membutuhkan clientName, clientAddress, purpose, visitLocation, visitRadius 50-1000, notes optional.
- Clock in/out membutuhkan id, location, dan 2 sampai 5 foto.
- Foto bisa string legacy atau object dengan dataUrl, capturedAtDevice, category, dan caption.
- Verify memakai id dan `hrChecked`.

Schema lain:

- News create/update.
- Shift create/update dengan days 0-6.
- Todo create/update.
- Face descriptor harus array 128 angka.
- Master create/update.
- Payslip create.
- Attendance correction create/update.
- PPh 21 dan BPJS calculator punya schema inline di route masing-masing.

## 13. Pola State dan Data di Frontend

Tidak ada global state manager khusus seperti Redux/Zustand. Pola yang konsisten:

- Halaman client memakai `useState`, `useEffect`, `useMemo`, dan `useCallback`.
- Data diambil dengan `fetch` ke API internal.
- Status loading/error/success disimpan lokal per halaman atau komponen.
- Toast dipakai untuk feedback.
- Confirm modal/dialog dipakai untuk aksi konfirmasi.
- Filter UI biasanya disimpan di local state dan kadang disinkronkan dengan query string.
- Pagination sebagian besar client-side untuk list yang sudah diambil, atau server-side untuk asset.
- Theme diatur oleh `ThemeProvider` dan class `dark`.
- Sidebar collapsed state disimpan di `localStorage` per portal oleh `AppShell`.
- Notification read state di sisi employee disimpan lokal.
- File/photo di client sering diubah menjadi data URL sebelum dikirim ke API.

## 14. Pola Backend dan Data Mapping

Pola route API:

- Import `NextRequest`/`NextResponse`.
- Ambil session dengan `requireAuth` atau `getActiveSession`.
- Cek permission dengan helper dari `permissions.ts`.
- Validasi request body dengan Zod, biasanya melalui `validateBody`.
- Panggil service domain.
- Return JSON response.
- Pakai `serverErrorResponse` atau logger pada exception.

Pola Prisma/service:

- Query memakai `include`/`select` untuk membawa relasi yang dibutuhkan UI.
- DTO biasanya mengubah `Date` menjadi ISO string.
- Field JSON yang tersimpan sebagai string di database diparse sebelum dikirim ke UI.
- Mutasi kompleks memakai `prisma.$transaction`.
- Relasi many-to-many seperti employee locations diupdate dengan `set`.
- Child relational seperti shift days atau payslip items sering dihapus lalu dibuat ulang saat update.
- Data audit ditulis setelah aksi penting.
- Untuk data privat, service private memusatkan enkripsi, hash, serialize, dan apply update.

Pola naming:

- File page dan route mengikuti konvensi App Router: `page.tsx`, `layout.tsx`, `route.ts`.
- Komponen React memakai PascalCase.
- Service function memakai camelCase dan nama verba seperti `createEmployee`, `updateEmployee`, `getVisibleEmployees`.
- Model Prisma memakai PascalCase.
- Field database memakai camelCase di Prisma dan banyak yang di-map ke snake_case dengan `@map`.
- Enum database banyak memakai UPPER_CASE.
- Status workflow lama/non-enum di beberapa model memakai string lowercase seperti `pending`, `approved`, `draft`, `clocked_in`.
- API path memakai kebab-case atau nama resource plural.

## 15. Fitur dan Implementasi

### Dashboard analytics

- HR dashboard mengambil summary dari `/api/analytics`.
- Analytics menghitung karyawan aktif, absensi hari ini, cuti, kunjungan, lembur, weekly attendance, department stats, dan recent activity.
- Employee 360 memakai `analyticsService.getEmployee360Data(id)`.

### Face recognition

- Model face-api disimpan di `public/models`.
- Client memuat model dari path `/models`.
- Descriptor wajah panjangnya 128 angka.
- Registration mengambil beberapa frame, memilih/merata-rata descriptor yang valid, lalu simpan ke `/api/auth/face`.
- Attendance membandingkan descriptor kamera dengan descriptor employee.
- Threshold default berasal dari `NEXT_PUBLIC_FACE_THRESHOLD` dengan fallback di utility client.

### GPS dan lokasi

- Lokasi menggunakan browser geolocation high accuracy.
- Client memvalidasi accuracy dan sinyal lokasi lewat `gpsValidator`.
- Jarak dihitung dengan Haversine `calculateDistance`.
- Employee bisa memiliki banyak allowed locations.
- `bypassLocation` membuat lokasi tidak wajib untuk absensi.
- Visit memakai target location per draft dan radius default 300 meter.

### PWA

- `manifest.json` mengatur app name, display, orientation, colors, dan icons.
- `next-pwa` menghasilkan service worker.
- `worker/index.js` menambahkan handler push notification dan notification click.
- Push subscription dikelola via `/api/push/subscribe`.

### Export/import

- Employee import memakai Excel template di `public/templates`.
- Parser mendukung alias kolom dan mode create/update/upsert.
- Validator melakukan dry run sebelum eksekusi.
- Executor mencatat import job untuk idempotensi.
- Asset import menerima CSV/XLS/XLSX dari client dan mengirim payload bulk ke API.
- Export memakai ExcelJS/XLSX/PDF tergantung halaman.

### Dokumen privat employee

- HR upload dokumen employee melalui endpoint employee documents.
- File disimpan di storage privat, bukan public.
- Service membaca, validasi, dan menghapus dokumen.
- Metadata disimpan di `EmployeeDocument`.

### Visit photo evidence

- Foto kunjungan diproses server-side.
- `visitPhotoService` memvalidasi jumlah, MIME, ukuran, signature JPEG, metadata image, dan batas piksel.
- Foto original dan stamped disimpan terpisah.
- Metadata mencakup timestamp device/server/official, koordinat, akurasi, jarak ke target, SHA256, ukuran, dan dimensi.
- UI memakai `VisitPhotoGrid` untuk menampilkan stamped/original dan metadata.

### Payroll, BPJS, PPh 21

- Master payroll component dipakai sebagai default payroll.
- Employee payroll component menyimpan amount per employee.
- Bulk payslip mengambil employee active, komponen payroll employee, master fallback, approved overtime, dan menghitung net salary.
- BPJS calculator memakai konstanta di `bpjsConstants.ts`.
- PPh 21 calculator memakai TER/PMK/PP constants di `pph21Constants.ts`.

### Audit

- Audit log menyimpan actor dan detail JSON.
- Banyak aksi admin/GA/HR memanggil `auditService.logAction`.
- `/dashboard/audit` membaca audit paginated dengan filter action/entity/search.

### Role-based visibility employee

- HR bisa melihat employee aktif/nonaktif/all sesuai query status.
- GA melihat employee aktif untuk kebutuhan asset/SIM assignment.
- Employee melihat dirinya sendiri dan subordinate aktif secara rekursif bila menjadi manager.
- Employee monitoring memakai visibility dari `getVisibleEmployees`.

### Asset ownership visibility

- GA mengelola keseluruhan asset.
- HR punya endpoint baca asset untuk monitoring.
- Employee hanya melihat asset yang assigned ke dirinya dan ticket miliknya.
- Public scan hanya menyajikan info asset terbatas.

## 16. Ketergantungan Antar Bagian

Dependensi inti:

- Semua route DB bergantung pada `prisma`.
- Hampir semua route private bergantung pada `auth.ts`, `permissions.ts`, dan `apiGuard.ts`.
- Portal layout bergantung pada `/api/auth/me`.
- `employeeService` bergantung pada master data, RBAC employee user role, private service, payroll component, locations, manager hierarchy, dan user account.
- `employeePrivateService` bergantung pada `security/pii.ts`.
- `employeeStatusService` bergantung pada employee, user account, status history, audit, push subscription, dan manager reassignment.
- Attendance bergantung pada employee, shift, locations, face descriptor, dan date/time utility.
- Leave bergantung pada employee, shift day/off day, dan leave quota.
- Overtime bergantung pada employee basic salary dan overtime calculator.
- Payroll bergantung pada employee, payroll component, payslip items, dan approved overtime.
- Visit bergantung pada employee session, location utility, visit report, visit photo service, Sharp, and storage.
- Asset bergantung pada category, employee assignment, history, BAST, inspection, maintenance, ticket, QR, and audit.
- SIM card bergantung pada employee assignment.
- Notification bergantung pada workflow pending/resolved data dan push subscription.
- Cron route bergantung pada `CRON_SECRET` untuk pemanggilan terjadwal.

Ketergantungan frontend:

- HR, GA, dan Employee sama-sama memakai `AppShell`, theme, toast, confirm, dan notification/push components.
- Employee management memakai banyak endpoint master dan service employee.
- Asset UI GA memakai `features/ga` shared components.
- Visit UI employee dan HR sama-sama memakai tipe/komponen `VisitPhotoGrid`.
- Export UI memakai `src/lib/export.ts` dan endpoint `/api/export`.
- Calculator pages memakai endpoint masing-masing atau utility pure client.

## 17. Aturan Tidak Tertulis yang Konsisten

- API adalah satu-satunya jalur komunikasi UI ke database; komponen client tidak mengakses Prisma langsung.
- Permission dicek di API route walaupun halaman/layout sudah melakukan guard.
- Session principal dari `/api/auth/me` menjadi sumber kebenaran client untuk role, permission, employeeId, dan navigasi.
- Data employee yang sensitif dipisahkan ke service private dan model privat.
- Field terenkripsi tidak diproses langsung di UI selain melalui DTO service.
- Perubahan penting oleh HR/GA/admin dicatat ke audit log.
- Semua operasi create/update besar memakai validasi Zod atau validasi service sebelum Prisma mutate.
- Response error API dibuat dalam bahasa Indonesia.
- DTO yang dikirim ke client menghindari storage path privat; URL akses dibentuk lewat endpoint API.
- Status workflow memakai string yang sama antara UI, API, service, dan schema.
- `Date` dari database dikirim ke UI sebagai string ISO atau date string.
- Untuk workflow list, UI menampilkan stats ringkas, filter/search, dan detail modal.
- Form kompleks dipisahkan menjadi section kecil.
- Master data disediakan lewat endpoint `/api/master/...`.
- Role/permission lebih diprioritaskan daripada nama path ketika menentukan akses.
- Karyawan self-service selalu menggunakan `employeeId` dari session, bukan input bebas dari client.
- GA asset mutation selalu membuat atau memperbarui history ketika holder/status berubah melalui service command yang sesuai.
- Foto evidence tidak langsung dipercaya sebagai file final; server melakukan validasi dan pemrosesan ulang.
- PWA dan push notification dianggap bagian dari runtime web, bukan service eksternal terpisah.

## 18. Testing

Framework test:

- Vitest dengan environment `node`, globals aktif, timeout 30 detik, dan alias `@`.

Jenis test:

- Unit service:
  - BPJS calculation.
  - PPh 21 calculation.
  - Overtime calculation.
  - Holiday normalization.
  - Leave working days.
  - Birthday normalization/grouping.
  - PII encryption/hash/masking.
  - Face recognition utility.
  - Visit photo processing.
- Bulk import:
  - Parser alias/header/date/text preservation.
  - Validator missing refs, manager handling, duplicate counts.
  - Integration create/private encryption/login/duplicate job.
- API integration:
  - Auth login/me.
  - Attendance fetch.
  - Asset fetch/create cleanup.
  - Master division create/fetch/auth.
  - Users RBAC.
- Employee/admin integration:
  - Private data encryption and document privacy.
  - Employee status change, session revocation, push cleanup, audit/history.
  - Admin account create/update/reset/promote/protection.

Beberapa integration test memakai gating environment seperti `RUN_DB_INTEGRATION === "1"`.

Helper test API menggunakan base URL `http://localhost:3000/api` dan kredensial seed seperti `WIG001`, `WIG002`, dan employee demo.

## 19. Seed dan Data Awal

Seed RBAC:

- `seedRbac.ts` membuat permission dan role default.

Seed user:

- `seed.ts` membuat master HRGA/IT, Manager/Staff, RBAC, dan akun admin WIG001/WIG002 dengan password random yang ditampilkan saat seed.
- `seedHR.ts` membuat/memperbarui WIG001 dengan password `HRAdmin@123`.
- `seedGA.ts` membuat/memperbarui WIG002 dengan password `GAAdmin@123`.
- `seedDev.ts` mengatur WIG001/WIG002 untuk kebutuhan development dengan password `123`.
- `seedEmployee.ts` membuat employee demo `ID25999999` dengan password `123`, `bypassLocation: true`, dan role `EMPLOYEE_USER`.

Seed asset:

- `seedAssets.ts` membaca file JSON aset dari path `../dataPerusahaan/...` lalu membuat kategori, asset, SIM card, dan mapping holder.
- `[tidak yakin]` File sumber `../dataPerusahaan/...` tidak berada di daftar file root project yang dibaca, sehingga isinya tidak didokumentasikan di sini.

## 20. Storage, File, dan Aset Runtime

Public:

- Asset yang boleh diakses browser langsung berada di `public`.
- Model face recognition harus tetap tersedia di `public/models`.
- Upload berita berada di path public upload.
- Template import employee berada di public templates.

Private/runtime:

- Dokumen employee private memakai folder storage lewat `employeeDocumentService`.
- Foto visit original dan stamped memakai folder storage lewat `visitPhotoService`.
- BAST document asset disimpan sebagai blob database, bukan file public.
- Log runtime berada di `logs`.

## 21. Area yang Ditandai Tidak Pasti

- `[tidak yakin]` Isi file eksternal yang dipakai `prisma/seedAssets.ts` pada path `../dataPerusahaan/...` tidak termasuk dalam file project yang tersedia di root ini.
- `[tidak yakin]` Binary asset seperti `.png`, `.xlsx`, `.bin`, `.pdf`, dan generated worker dibaca sebagai keberadaan/fungsi file, bukan isi binary baris-per-baris.

## 22. Ringkasan Mental Model untuk AI Berikutnya

Jika perlu mengerjakan project ini, model utama yang harus diingat:

1. Ini adalah HRIS/PWA multi-portal: HR di `/dashboard`, GA di `/ga`, employee di `/employee`.
2. Auth berbasis `UserAccount` + JWT cookie `session` + `sessionVersion` + RBAC permission.
3. `Employee` adalah pusat domain, sedangkan data privat employee dipisahkan ke model private dan service khusus.
4. UI tidak langsung ke DB; semua data lewat API route.
5. API route mengecek auth/permission, validasi payload, lalu memanggil service.
6. Service memegang aturan domain dan Prisma access.
7. Workflow absensi menggabungkan session employee, shift, lokasi, foto, dan face descriptor.
8. Workflow visit memakai state `draft -> clocked_in -> clocked_out`, lokasi radius, dan evidence foto yang diproses server.
9. Workflow cuti/lembur/payroll saling terkait melalui employee, approved request, dan payslip period.
10. Workflow asset dikelola GA, dipantau HR, dan sebagian terlihat oleh employee/public scan.
11. Audit log dan push notification adalah fitur lintas domain.
12. Validasi Zod dan helper permission adalah pola yang perlu diikuti saat menambah endpoint.

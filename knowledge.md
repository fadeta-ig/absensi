# Knowledge Base - WIG HRIS & Asset Management System (Absensi WIG)

Dokumentasi ini adalah sumber kebenaran teknis komprehensif untuk proyek **WIG HRIS & Asset Management System** (repo: `absensi`). Dokumen ini disusun untuk membantu perekayasa perangkat lunak dan agen AI memahami seluruh sistem secara menyeluruh sebelum melakukan penambahan, perbaikan, maupun modifikasi fitur.

---

## 1. Project Overview

| Atribut | Deskripsi |
| :--- | :--- |
| **Nama Proyek** | WIG HRIS & Asset Management System (`absensi`) |
| **Tujuan Aplikasi** | Platform terpadu pengelolaan sumber daya manusia (HRIS), absensi kehadiran 3-faktor (validasi Wi-Fi kantor MikroTik, GPS geofencing, & foto selfie bukti), pelaporan kunjungan klien lapangan, kalkulasi penggajian & pajak/jaminan sosial regulasi Indonesia (PPh 21 TER, BPJS Kesehatan & Ketenagakerjaan), manajemen aset & inventaris General Affairs (GA) dengan QR code & BAST, serta Employee Self-Service (ESS). |
| **Domain Aplikasi** | Human Resource Information System (HRIS), Enterprise Asset Management (EAM), Payroll & Indonesian Tax/Labor Compliance, Field Force Tracking. |
| **Framework Utama** | Next.js 16.1.6 (App Router, Webpack engine, React 19.2.3). |
| **Bahasa Pemrograman** | TypeScript 5 (Strict Mode), SQL (via Prisma ORM 6.19.2). |
| **Target Lingkungan** | Node.js v20+, MySQL 8.0+ / MariaDB 10.4+, Progressive Web App (PWA) diakses via Desktop Browser & Mobile Browser. |
| **Struktur Deployment** | Next.js Server Runner (`next start -H 0.0.0.0 -p 3000`), Service Worker terdaftar via `@ducanh2912/next-pwa`, koneksi database terpusat via connection pool `mysql2`/Prisma. |

---

## 2. Technology Stack

### Frontend
- **Core & Routing:** Next.js 16.1.6 App Router (`src/app`), React 19.2.3, TypeScript 5.
- **Styling:** Tailwind CSS v3.4.19, PostCSS, `tailwindcss-animate`, `clsx`, `tailwind-merge`.
- **Theming:** `next-themes` (Dark Mode & Light Mode dengan CSS variables).
- **Design Tokens / Palette:** Maroon korporat (`#800020`), Gold Accent (`#D4A574`), Slate/Neutral tones.
- **Icons:** `lucide-react` (v0.563.0).
- **PWA & Mobile Capabilities:** `@ducanh2912/next-pwa` (v10.2.9), Custom Service Worker (`worker/index.js`), Web App Manifest (`public/manifest.json`).
- **Kamera & Validasi Jaringan:** HTML5 MediaDevices Canvas untuk foto selfie kehadiran instan, `networkValidator.ts` untuk verifikasi IP Wi-Fi kantor (`192.168.20.1`, `192.168.20.0/24`, `202.152.141.27`).
- **Pemetaan & Lokasi:** `leaflet` (v1.9.4), `react-leaflet` (v5.0.0), `leaflet-defaulticon-compatibility`.
- **Barcode & QR:** `html5-qrcode` (v2.3.8) untuk scanner kamera, `qrcode` & `react-qr-code` untuk rendering label QR.
- **Format & Dokumen:** `jspdf` (v4.1.0), `jspdf-autotable` (v5.0.7), `xlsx` (v0.18.5), `exceljs` (v4.4.0), `papaparse` (v5.5.3).
- **State Management & Form Handling:** React Hooks murni (`useState`, `useEffect`, `useCallback`, `useTransition`), custom hooks (`useFormDraft`, `useUnsavedChanges`), native form validation dengan Zod v4.
- **Client Telemetry:** `clientLogger.ts` & `clientErrors.ts` (silent di production console, mengirim error/warning secara async ke `/api/logs/client` dengan `keepalive: true`).
- **Cross-Tab Session Sync:** `authEvents.ts` (sinkronisasi multi-tab login/logout via `localStorage` event & CustomEvent).

### Backend
- **Runtime & API System:** Next.js Route Handlers (`route.ts`) berjalan di Node.js runtime.
- **Route Guarding:** Next.js 16 Proxy Middleware (`src/proxy.ts`) pada Edge/Request Runtime sebelum routing internal.
- **API Guarding & Input Security:** `src/lib/middleware/apiGuard.ts` (`requireAuth`, `validateBody`, `parseJsonBody`, `parseFormData`, `sanitizeObject`).
- **Rate Limiting:** `src/lib/middleware/rateLimit.ts` (Dual-tier in-memory sliding window: IP-based 30 req/min & Account-based 5 req/min pada login).
- **Autentikasi & Sesi:** JSON Web Token (JWT) stateless menggunakan `jose` (v6.1.3), cookie HTTP-Only `session`, enkripsi password `bcryptjs` (v3.0.3), session versioning invalidation di database.
- **Kriptografi & PII Protection:** Node.js native `crypto` (AES-256-GCM untuk enkripsi data sensitif identitas/bank/BPJS, HMAC-SHA256 untuk blind-indexing searching).
- **Image Processing & Watermarking:** `sharp` (v0.35.3) untuk kompresi dan dynamic SVG watermark stamping bukti kunjungan lapangan.
- **Logging & Telemetri:** `winston` (v3.19.0) untuk server-side structured logging (error, info, warn) + client telemetry ingestion.
- **Email Dispatcher:** `nodemailer` (v8.0.1) untuk pengiriman kredensial akun dan birthday notification.
- **Web Push:** `web-push` (v3.6.7) dengan standar VAPID keys.

### Database
- **Engine:** MySQL 8.0+ atau MariaDB 10.4+.
- **ORM:** Prisma ORM (`@prisma/client` & `prisma` CLI v6.19.2).
- **Driver:** Prisma native MySQL connector dengan pool management (`src/lib/prisma.ts`).
- **Migrations & Seeds:** Prisma Migrations (`prisma/migrations`), seeders khusus (`seed.ts`, `seedRbac.ts`, `seedDev.ts`, `seedHR.ts`, `seedGA.ts`, `seedEmployee.ts`, `seedAssets.ts`).

### Tooling & Automated Testing
- **Test Runner:** `vitest` (v4.1.4) dengan environment Node.js.
- **Coverage Engine:** `@vitest/coverage-v8` (v4.1.4).
- **TypeScript Runner:** `tsx` (v4.21.0) untuk mengeksekusi seed dan skrip migrasi TypeScript langsung tanpa kompilasi terpisah.
- **Linter & Formatter:** ESLint 9 (`eslint-config-next` v16.1.6).
- **Component Registry:** `shadcn` CLI (v3.8.4) style `new-york`.

### NPM Scripts Reference
| Command | Deskripsi |
| :--- | :--- |
| `npm run dev` | Menjalankan dev server Next.js dengan compiler Webpack (`next dev --webpack`). |
| `npm run dev:host` | Menjalankan dev server binding ke seluruh interface IP (`0.0.0.0`) untuk testing via LAN/HP. |
| `npm run build` | Melakukan build bundle produksi dengan Webpack (`next build --webpack`). |
| `npm run start` | Menjalankan build produksi secara lokal. |
| `npm run start:host` | Menjalankan build produksi pada host `0.0.0.0:3000`. |
| `npm run lint` | Menjalankan pemeriksaan kode menggunakan ESLint. |
| `npm run db:push` | Mendorong perubahan skema Prisma langsung ke database tanpa file migrasi. |
| `npm run db:seed` | Menjalankan seeder utama (`prisma/seed.ts`). |
| `npm run db:seed:dev` | Seeder khusus development lokal (menyiapkan akun `WIG001` & `WIG002` dengan password `123`). |
| `npm run db:seed:hr` | Seeder akun Admin HR. |
| `npm run db:seed:ga` | Seeder akun Admin GA. |
| `npm run db:seed:employee` | Seeder data karyawan percontohan. |
| `npm run db:seed:assets` | Seeder data aset inventaris dari data perusahaan. |
| `npm run db:reset` | Reset penuh database (`push --force-reset`) dan seed ulang. |
| `npm run db:reset:only` | Reset database kosong tanpa seed. |
| `npm run db:reset:dev` | Reset penuh database dan seed akun development. |
| `npm run db:studio` | Membuka GUI Prisma Studio pada browser. |
| `npm run test` | Menjalankan 23 test suite Vitest. |
| `npm run test:coverage` | Menjalankan test suite dan membuat laporan code coverage. |

---

## 3. Project Folder Structure

```text
hriswig/
├── .env                              # Konfigurasi environment lokal (rahasia)
├── .env.example                      # Template referensi variabel environment
├── components.json                   # Konfigurasi komponen shadcn UI
├── next.config.ts                    # Konfigurasi build Next.js, PWA, headers keamanan
├── package.json                      # Daftar dependensi & npm script
├── tailwind.config.js                # Konfigurasi styling Tailwind CSS & tema warna
├── tsconfig.json                     # Konfigurasi kompilasi TypeScript
├── vitest.config.ts                  # Konfigurasi automated unit/integration testing
├── worker/
│   └── index.js                      # Custom service worker listener (Web Push & Notification Click)
├── storage/                          # Direktori penyimpanan file privat di luar web root
│   ├── employee-documents/           # Berkas rahasia karyawan (KTP, KK, Ijazah, Kontrak)
│   └── visit-photos/                 # Arsip foto original & stamped hasil kunjungan klien
├── public/                           # Aset publik yang dapat diakses langsung oleh browser
│   ├── assets/                       # Logo perusahaan (Logo WIG.png, dll)
│   ├── icons/                        # PWA icons (192x192, 512x512)
│   └── manifest.json                 # Web App Manifest PWA
├── prisma/                           # Definisi schema database & script seeder
│   ├── schema.prisma                 # Definisi 49 model, relasi, indeks, dan 12 enum
│   ├── migrations/                   # Riwayat 10 migrasi skema database
│   ├── seed.ts                       # Seeder master entry point (admin accounts terpisah)
│   ├── seedRbac.ts                   # Inisialisasi Role & Permission default
│   ├── seedDev.ts                    # Inisialisasi akun dev lokal (WIG001 & WIG002 pw: 123)
│   ├── seedHR.ts                     # Inisialisasi data akun HR default
│   ├── seedGA.ts                     # Inisialisasi data akun GA default
│   ├── seedEmployee.ts               # Inisialisasi data karyawan percontohan
│   ├── seedAssets.ts                 # Inisialisasi kategori & data aset inventaris
│   ├── linkAssetEmployees.ts         # Script pengait relasi aset ke karyawan
│   └── migrate-json-to-relations.ts  # Script migrasi legacy JSON ke normalized tables
├── tests/                            # Pengujian otomatis (Vitest - 23 test suites)
│   ├── api/                          # Pengujian endpoint Route Handlers (assets, auth, attendance, users, master, birthdays)
│   ├── services/                     # Pengujian unit kalkulasi & service bisnis (bulk import, PII, leave, bpjs, birthdays, status)
│   └── utils/                        # Helper pengujian API (apiTestHelper.ts dengan auth cookie caching)
└── src/                              # Sumber kode aplikasi
    ├── proxy.ts                      # Next.js 16 edge route guard (proteksi URL /dashboard, /employee, /ga)
    ├── app/                          # App Router (56 Halaman & 77 API Routes)
    │   ├── layout.tsx                # Root layout (ThemeProvider, ToastProvider, Geist/Inter fonts)
    │   ├── page.tsx                  # Halaman Login Utama
    │   ├── globals.css               # Definisi utility CSS, CSS variables, & dark mode theme
    │   ├── scan/                     # Halaman publik pemindaian QR aset fisik
    │   │   └── [id]/page.tsx         # Detail aset publik & formulir inspeksi GA
    │   ├── dashboard/                # Portal HR Admin (/dashboard/* - 24 halaman)
    │   ├── employee/                 # Portal Karyawan / Employee Self-Service (/employee/* - 16 halaman)
    │   ├── ga/                       # Portal General Affairs (/ga/* - 14 halaman)
    │   └── api/                      # 77 Route Handlers backend (/api/*)
    ├── components/                   # Komponen React Reusable
    │   ├── ui/                       # Komponen atomik (Modal, Pagination, Skeleton, Toast, Action Bar, FeedbackMessage)
    │   ├── layout/                   # Komponen layout (AppShell, Navigation, Notification Panel)
    │   ├── dashboard/                # Komponen analitik & widget dashboard HR (ActivityFeed, QuickMenu, StatsGrid, etc.)
    │   ├── employee-form/            # Tab-tab formulir data karyawan:
    │   │   ├── IdentitySection.tsx   # Tab identitas personal dasar
    │   │   ├── JobSection.tsx        # Tab jabatan, divisi, departemen, shift, manager
    │   │   ├── LocationSection.tsx   # Tab penetapan lokasi kantor & bypass GPS
    │   │   ├── PayrollSection.tsx    # Tab gaji pokok & tunjangan/potongan
    │   │   ├── PrivateDataSection.tsx# Tab PII terenkripsi (KTP, KK, BPJS, Bank, PTKP)
    │   │   ├── EmployeeDocumentManager.tsx # Tab manajemen arsip dokumen fisik
    │   │   └── types.ts              # Tipe DTO formulir karyawan
    │   ├── Employee360View.tsx       # Tampilan komprehensif profil 360 derajat karyawan
    │   ├── BulkImportModal.tsx       # Modal wizard impor massal data karyawan via Excel
    │   ├── EmployeeForm.tsx          # Formulir utama tambah/ubah karyawan
    │   ├── EmployeeStatusModal.tsx   # Modal aktivasi/deaktivasi karyawan & transfer hierarki
    │   ├── FormDraftBanner.tsx       # Banner peringatan draft form tersimpan otomatis
    │   ├── LeaveCalendar.tsx         # Kalender interaktif pengajuan cuti
    │   ├── LocationMap.tsx           # Peta Leaflet untuk geofencing lokasi kantor
    │   ├── NotificationCenter.tsx    # Dropdown lonceng notifikasi HR
    │   ├── PushNotificationManager.tsx # Registrasi silent Web Push notification di browser
    │   ├── ThemeProvider.tsx         # Provider next-themes
    │   ├── ThemeToggle.tsx           # Tombol toggle dark/light mode
    │   ├── Toast.tsx                 # Floating toast notification system
    │   └── VisitPhotoGrid.tsx        # Grid penampil foto kunjungan dengan watermark preview
    ├── features/                     # Fitur modular terisolasi
    │   └── ga/                       # Modul khusus General Affairs
    │       ├── components/           # Komponen formulir aset, kartu statistik, & formulir SIM
    │       │   ├── AssetForm.tsx     # Formulir tambah/ubah aset
    │       │   ├── AssetStatCards.tsx# Kartu metrik sebaran aset
    │       │   ├── SimCardForm.tsx   # Formulir kartu SIM operasional
    │       │   └── badges/           # Badge kondisi & status aset
    │       └── styles/               # Styling khusus modul aset
    ├── hooks/                        # Custom React Hooks
    │   ├── useFormDraft.ts           # Auto-save draft formulir ke localStorage (debounce 500ms, maxAge 24h)
    │   └── useUnsavedChanges.ts      # Peringatan pencegahan navigasi saat form belum tersimpan (beforeunload)
    ├── lib/                          # Pustaka utilitas, layanan backend, & middleware
    │   ├── prisma.ts                 # Singleton Prisma client
    │   ├── auth.ts                   # Logika sesi, pembuatan JWT, verifikasi login, session versioning
    │   ├── authEvents.ts             # Broadcast event login/logout antar tab browser via storage event
    │   ├── authRedirectMessage.ts    # Penyimpanan pesan redirect sesi antar navigasi via sessionStorage
    │   ├── birthdayUtils.ts          # Utilitas kalkulasi metrik & tanggal ulang tahun
    │   ├── clientErrors.ts           # Standardisasi error handling client & pelaporan ke backend
    │   ├── clientLogger.ts           # Logger browser client (silent in prod, kirim error ke /api/logs/client)
    │   ├── env.ts                    # Validasi runtime environment variable (fail-fast via Zod)
    │   ├── export.ts                 # Export engine (Excel XLSX, PDF Table, Slip Gaji, BAST)
    │   ├── networkValidator.ts       # Validator IP Wi-Fi kantor (192.168.20.1, subnet lokal, & IP publik) & ekstraksi header IP
    │   ├── gpsValidator.ts           # Algoritma validasi GPS, deteksi fake GPS/mock-location & speed limit
    │   ├── logger.ts                 # Winston logger konfigurasi server-side
    │   ├── permissions.ts            # Definisi konstanta Role, Permission, & helper RBAC
    │   ├── timezone.ts               # Utilitas penanggalan zona waktu Indonesia Barat (WIB)
    │   ├── utils.ts                  # Helper umum (cn, toDateString, calculateDistance, formatting)
    │   ├── webPush.ts                # Wrapper Web Push notification
    │   ├── utils/                    # Utilitas tambahan:
    │   │   ├── excelTemplateGenerator.ts # Generator template Excel aset menggunakan ExcelJS
    │   │   └── formatters.ts         # Formatting text & numbers
    │   ├── types/                    # Kontrak tipe internal lib:
    │   │   └── asset.ts              # Definisi tipe domain aset GA
    │   ├── middleware/               # Middleware layer API:
    │   │   ├── apiGuard.ts           # Guard auth sesi, schema parsing, & error handler
    │   │   ├── rateLimit.ts          # In-memory sliding window rate limiter (IP & Account level)
    │   │   └── sanitize.ts           # Pembersih XSS / tag HTML input rekursif
    │   ├── security/                 # Modul keamanan data:
    │   │   └── pii.ts                # Enkripsi AES-256-GCM & HMAC hashing PII
    │   ├── validations/              # Definisi schema Zod terpusat:
    │   │   └── validationSchemas.ts  # Skema validasi data request API
    │   ├── constants/                # Tabel konstanta regulasi pemerintah:
    │   │   ├── bpjsConstants.ts      # Tarif & plafon BPJS Kesehatan & Ketenagakerjaan
    │   │   └── pph21Constants.ts     # Tarif TER PP 58/2023 & Tarif Progresif PPh 21
    │   └── services/                 # Lapisan logika bisnis (Business Service Layer):
    │       ├── employeeService.ts    # Layanan utama data karyawan & hierarki BFS
    │       ├── employeeStatusService.ts # Manajemen lifecycle status aktif/nonaktif & hand-off
    │       ├── employeePrivateService.ts # Layanan data privat terenkripsi (KTP, BPJS, Bank)
    │       ├── employeeDocumentService.ts # Layanan dokumen berkas fisik & validasi magic bytes
    │       ├── attendanceService.ts  # Layanan absensi harian & validasi kehadiran
    │       ├── attendanceCorrectionService.ts # Layanan pengajuan & persetujuan koreksi absensi
    │       ├── visitService.ts       # Layanan pelaporan kunjungan klien luar kantor
    │       ├── visitPhotoService.ts  # Layanan kompresi, hashing SHA-256, & watermarking Sharp
    │       ├── leaveService.ts       # Layanan cuti, saldo cuti, & perhitungan hari kerja
    │       ├── overtimeService.ts    # Layanan pengajuan & persetujuan lembur
    │       ├── overtimeCalcService.ts # Kalkulasi upah lembur sesuai PP 35/2021 (rumus 1/173)
    │       ├── payslipService.ts     # Layanan slip gaji karyawan
    │       ├── pph21Service.ts       # Engine kalkulator pajak PPh 21 TER PMK 168/2023
    │       ├── bpjsService.ts        # Engine kalkulator jaminan sosial BPJS
    │       ├── birthdayService.ts    # Layanan kalender ulang tahun & persiapan kado
    │       ├── emailService.ts       # Layanan pengiriman email SMTP
    │       ├── auditService.ts       # Pencatatan riwayat audit trail (AuditLog)
    │       ├── userService.ts        # Manajemen akun pengguna & penetapan RBAC
    │       ├── simCardService.ts     # Layanan inventaris kartu SIM operasional
    │       ├── shiftService.ts       # Manajemen jadwal jam kerja & shift harian
    │       ├── newsService.ts        # Layanan pengumuman & berita internal perusahaan
    │       ├── todoService.ts        # Layanan to-do list pribadi karyawan
    │       ├── analyticsService.ts   # Agregasi data analitik & profil 360 karyawan
    │       ├── assets/               # Sub-service aset GA (commands, queries, inspections, mappers)
    │       └── bulk-import/          # Sub-service impor massal Excel karyawan (parser, validator, executor)
    └── types/                        # Definisi kontrak tipe TypeScript aplikasi
        ├── index.ts                  # Interface & Tipe domain utama
        └── next-pwa.d.ts             # Deklarasi modul PWA
```

---

## 4. Application Architecture

Arsitektur aplikasi menerapkan pola **Layered Architecture** dengan pemisahan tanggung jawab yang tegas:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE / CLIENT                         │
│   (React 19 Server/Client Components, Tailwind CSS, PWA, Canvas/Cam)   │
│   - useFormDraft (Auto-save draft localStorage)                        │
│   - useUnsavedChanges (Prevent accidental tab close)                   │
│   - authEvents (Cross-tab broadcast logout/login)                      │
│   - clientLogger (Silent prod telemetry beacon to server)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP Request / Cookies
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     EDGE / ROUTE GUARD (proxy.ts)                      │
│   - Memeriksa JWT Cookie "session" di Edge Runtime                     │
│   - Mengarahkan /dashboard -> HR, /ga -> GA, /employee -> Employee     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Allowed
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   API ROUTE HANDLERS (src/app/api/*)                   │
│   - apiGuard: requireAuth() -> Cek DB sessionVersion & status aktif    │
│   - rateLimit: Dual-tier rate limiting (IP & Account level)            │
│   - sanitizeObject: Pembersihan tag HTML rekursif dari request body    │
│   - validateBody: Validasi skema Zod terpusat                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Validated Payload & Session
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  BUSINESS SERVICE LAYER (src/lib/services/*)           │
│   - Aturan bisnis, kalkulasi regulasi (PPh 21, BPJS, Overtime)         │
│   - Logika penelusuran hierarki hierarki BFS (subordinates)            │
│   - Pengolahan citra (Sharp watermark, SHA256 photo fingerprint)       │
│   - PII Encryption / Decryption (AES-256-GCM & HMAC Blind Index)       │
│   - Audit Trail logging (auditService.logAction)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Structured DB Queries
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     DATA ACCESS LAYER (Prisma ORM)                     │
│   - Singleton PrismaClient, Connection Pooling                         │
│   - Prisma Transactions ($transaction) untuk atomisitas ACID           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ TCP / SQL
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   DATABASE (MySQL 8.0+ / MariaDB 10.4+)                │
│   - 49 Tabel relasional, Foreign Keys, Indexing, Unique Hashes         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Database Knowledge

Database dirancang secara ternormalisasi dalam **49 tabel relasional** dengan **12 Enum**.

### Riwayat Migrasi Database (Database Migrations Timeline)
Arsitektur database berevolusi melalui 10 tahapan migrasi terstruktur:
1. `20260216040737_init_new_schema`: Inisialisasi skema normalisasi awal (karyawan, absensi, cuti, lembur, aset).
2. `20260216043505_add_location_restriction`: Penambahan batasan geofencing lokasi kantor & bypass location.
3. `20260410074900_catchup_schema_sync`: Sinkronisasi skema & penyesuaian tipe kolom.
4. `20260410080500_add_asset_employee_fk`: Penambahan foreign key eksplisit antara aset GA dan tabel karyawan.
5. `20260716090000_add_employee_status_management`: Penambahan pelacakan status aktif/non-aktif karyawan (`EmployeeStatusHistory`), pemindahan hierarki bawahan, dan checklist hand-off aset.
6. `20260716183000_separate_user_accounts_rbac`: Pemisahan total akun login ke tabel `UserAccount` dengan RBAC penuh (`Role`, `Permission`, `UserRoleAssignment`, `RolePermission`) dan counter `sessionVersion`.
7. `20260716200000_preserve_real_admin_employee_links`: Pengawetan relasi akun administrator yang juga merupakan karyawan riil.
8. `20260718120000_expand_employee_master_import_v2`: Ekspansi master data karyawan V2 (profil privat, identitas ber-enkripsi AES-256-GCM, nomor rekening bank, kontak darurat, profil pajak PTKP, arsip dokumen berkas fisik, dan job impor massal Excel).
9. `20260720143000_add_visit_photo_evidence`: Penambahan tabel `VisitPhoto` untuk bukti foto kunjungan lapangan ber-watermark dengan hash SHA-256 dan metadata koordinat presisi.
10. `20260908100000_add_birthday_management_system`: Penambahan sistem manajemen ulang tahun (`BirthdayReminderSetting`, `BirthdayPreparationStatus`, `EmployeeBirthdayPreparation`).

### Daftar 49 Model & Fungsinya

#### 1. Kepegawaian & Struktur Organisasi
- **`Employee` (`employees`):** Tabel entitas utama karyawan. Menyimpan NIK internal (`employeeId`), NIK ternormalisasi (`employeeIdNormalized`), nama, gelar akademik, nama panggilan, email, no HP, no HP alternatif, jenis kelamin, tipe ikatan kerja (`EmploymentType`), jabatan, departemen, divisi, manager langsung (`managerId`), tanggal bergabung, tanggal mulai/akhir kontrak, akhir probation, hak cuti tahunan, hak akses bypass lokasi GPS, gaji pokok dasar, dan vektor biometrik wajah (`faceDescriptor`).
- **`Department` (`departments`):** Data master departemen kerja (e.g., IT, Finance, Marketing), berelasi ke divisi induknya.
- **`Division` (`divisions`):** Data master divisi kerja tingkat atas perusahaan.
- **`Position` (`positions`):** Data master jabatan/posisi kerja (e.g., Software Engineer, HR Manager).
- **`Location` (`locations`):** Titik geofencing kantor fisik (koordinat latitude, longitude, dan radius toleransi dalam meter). Berelasi *many-to-many* dengan `Employee`.
- **`WorkShift` (`work_shifts`):** Konfigurasi jadwal jam kerja shift (toleransi masuk cepat/lambat, pulang cepat/lambat).
- **`WorkShiftDay` (`work_shift_days`):** Rincian jam masuk, jam pulang, dan status libur (`isOff`) per hari dalam seminggu (0=Minggu .. 6=Sabtu) untuk shift terkait.

#### 2. Autentikasi & Keamanan (RBAC)
- **`UserAccount` (`user_accounts`):** Akun login pengguna terpisah dari profil karyawan. Menyimpan `username`, `displayName`, `email`, `passwordHash` (bcrypt), `sessionVersion` (integer counter untuk invalidasi sesi instan saat revoke/reset password), status aktif, relasi opsional 1:1 ke `Employee`, dan timestamp login.
- **`Role` (`roles`):** Definisi peran akses (`SUPER_ADMIN`, `HR_ADMIN`, `GA_ADMIN`, `EMPLOYEE_USER`).
- **`Permission` (`permissions`):** Hak akses granular (`user.manage`, `hr.manage`, `ga.manage`, `employee.self`, `asset.read`).
- **`UserRoleAssignment` (`user_role_assignments`):** Pemetaan *many-to-many* antara akun pengguna dan peran.
- **`RolePermission` (`role_permissions`):** Pemetaan *many-to-many* antara peran dan hak akses.
- **`EmployeeStatusHistory` (`employee_status_histories`):** Log histori perubahan status aktif/non-aktif karyawan, alasan penonaktifan, tanggal efektif, dan aktor yang melakukan perubahan.
- **`AuditLog` (`audit_logs`):** Jejak audit kekal semua mutasi data penting (siapa, peran apa, aksi apa, entitas mana, waktu, dan rincian perubahan dalam JSON).
- **`PushSubscription` (`push_subscriptions`):** Registrasi endpoint Web Push browser karyawan untuk notifikasi PWA.

#### 3. Absensi & Operasional Lapangan
- **`AttendanceRecord` (`attendance_records`):** Rekaman kehadiran harian per karyawan (`employeeId` + `date` berindeks unik). Menyimpan waktu clock-in & clock-out, koordinat GPS JSON, foto kamera, status kehadiran (`present`, `late`, `absent`, `leave`), dan catatan.
- **`AttendanceCorrection` (`attendance_corrections`):** Pengajuan koreksi jam absensi jika karyawan lupa clock-in/out atau terkendala teknis. Memerlukan persetujuan manager/HR (`AssessmentStatus`).
- **`VisitReport` (`visit_reports`):** Pelaporan kunjungan klien lapangan oleh sales/teknisi. Mencakup nama klien, alamat, tujuan, koordinat target, koordinat riil perangkat saat clock-in/out, radius, hasil kunjungan, status verifikasi HR, dan relasi ke berkas foto.
- **`VisitPhoto` (`visit_photos`):** Bukti foto kunjungan terverifikasi. Menyimpan metadata resolusi, koordinat GPS presisi, akurasi, jarak ke target, hash SHA-256 berkas asli, path foto original, dan path foto yang telah di-watermark (`stampedPath`).

#### 4. Penggajian & Kompensasi
- **`PayrollComponent` (`payroll_components`):** Master komponen tunjangan (`earning`) atau potongan (`deduction`).
- **`EmployeePayrollComponent` (`employee_payroll_components`):** Nilai spesifik tunjangan/potongan yang ditetapkan untuk karyawan tertentu.
- **`PayslipRecord` (`payslip_records`):** Rekaman slip gaji bulanan per karyawan per periode (`employeeId` + `period` unik). Menyimpan gaji pokok, total lembur, gaji bersih, dan tanggal cetak.
- **`PayslipItem` (`payslip_items`):** Rincian item tunjangan (`ALLOWANCE`) dan potongan (`DEDUCTION`) pada slip gaji terkait.
- **`OvertimeRequest` (`overtime_requests`):** Pengajuan jam lembur kerja dengan jam mulai, jam selesai, durasi terhitung, durasi disetujui, indikator hari libur, estimasi upah lembur regulasi, dan status persetujuan.
- **`LeaveRequest` (`leave_requests`):** Pengajuan cuti (tahunan, sakit, izin khusus, melahirkan) dengan tanggal mulai, tanggal selesai, alasan, lampiran surat dokter/bukti, dan status persetujuan.

#### 5. Manajemen Aset & Inventaris GA
- **`AssetCategory` (`asset_categories`):** Kategori aset inventaris (e.g., LAPTOP, HANDPHONE, NOMOR_HP) beserta prefix kode penomoran otomatis.
- **`Asset` (`assets`):** Data fisik aset inventaris perusahaan. Menyimpan kode unik aset (`assetCode`), nomor seri, IMEI, brand, model, harga beli, masa garansi, kondisi (`AssetKondisi`: `BAIK`, `KURANG_BAIK`, `RUSAK`), status pemakaian (`AssetStatus`: `AVAILABLE`, `IN_USE`, `MAINTENANCE`, `RETIRED`, `COMPANY_OWNED`), tipe pemegang (`HolderType`), dan identitas pemegang aktif.
- **`AssetHistory` (`asset_histories`):** Riwayat siklus hidup perpindahan aset (serah terima, mutasi antar karyawan, pengembalian ke GA pool, pengiriman servis ke vendor).
- **`AssetBastDocument` (`asset_bast_documents`):** Berita Acara Serah Terima (BAST) bertanda tangan dalam format binary (`MediumBlob`) yang diunggah saat serah terima aset.
- **`AssetInspection` (`asset_inspections`):** Hasil audit inspeksi berkala kondisi fisik aset oleh tim GA.
- **`InspectionChecklistItem` (`inspection_checklist_items`):** Item detail checklist pemeriksaan fisik aset (layar, keyboard, baterai, audio, charging) dengan status pass/fail.
- **`AssetMaintenance` (`asset_maintenances`):** Log riwayat servis aset ke pihak ketiga (nama vendor, estimasi selesai, biaya perbaikan, nota invoice).
- **`AssetTicket` (`asset_tickets`):** Tiket permohonan aset baru atau pelaporan kerusakan aset yang diajukan oleh karyawan kepada tim GA.
- **`SimCard` (`sim_cards`):** Manajemen nomor kartu SIM operasional perusahaan yang dipinjamkan kepada staf.

#### 6. Data Pribadi Karyawan (Encrypted PII) & Dokumen
- **`EmployeePrivateProfile` (`employee_private_profiles`):** Tempat lahir, tanggal lahir, status pernikahan, golongan darah, agama, dan pendidikan terakhir.
- **`EmployeeIdentity` (`employee_identities`):** NIK KTP, No Kartu Keluarga, No BPJS Ketenagakerjaan, No BPJS Kesehatan. Semua disimpan dalam format terenkripsi (`AES-256-GCM`) bersama hash unik (`HMAC-SHA256`) untuk keperluan pencarian identitas tanpa dekripsi massal.
- **`EmployeeAddress` (`employee_addresses`):** Alamat KTP (`ID_CARD`) dan alamat domisili (`DOMICILE`) karyawan saat ini.
- **`EmployeeEmergencyContact` (`employee_emergency_contacts`):** Kontak darurat keluarga karyawan beserta hubungan dan indikator kontak utama (`isPrimary`).
- **`EmployeeBankAccount` (`employee_bank_accounts`):** Nama bank, nomor rekening (terenkripsi + hash), nama pemilik rekening, dan indikator rekening utama.
- **`EmployeeTaxProfile` (`employee_tax_profiles`):** Status PTKP aktif karyawan (TK, K/0, K/1, dst.) beserta tanggal berlakunya.
- **`EmployeeTaxHistory` (`employee_tax_histories`):** Riwayat perubahan status PTKP karyawan dari waktu ke waktu.
- **`EmployeeImportJob` (`employee_import_jobs`):** Log status, checksum file, hash opsi, jumlah baris berhasil/gagal, dan payload hasil dari proses impor massal Excel karyawan.
- **`EmployeeDocument` (`employee_documents`):** Berkas fisik arsip karyawan (KTP, NPWP, BPJS, Ijazah, Kontrak Kerja) yang disimpan secara aman di folder storage internal dengan verifikasi signature format file.

#### 7. Fitur Tambahan & Engagement
- **`BirthdayReminderSetting` (`birthday_reminder_settings`):** Konfigurasi pengingat email otomatis untuk perayaan ulang tahun karyawan (pilihan interval H-30, H-14, H-7 dan email penerima HR).
- **`BirthdayPreparationStatus` (`birthday_preparation_statuses`):** Status pipeline persiapan perayaan ulang tahun (e.g., Pesan Kue, Siapkan Kado, Kirim Ucapan) lengkap dengan warna badge dan urutan langkah.
- **`EmployeeBirthdayPreparation` (`employee_birthday_preparations`):** Pelacakan status persiapan ulang tahun per karyawan per tahun kalender.
- **`LetterRequest` (`letter_requests`):** Pengajuan surat resmi ke HR oleh karyawan (Surat Keterangan Kerja, Keterangan Penghasilan, Keterangan Masih Bekerja, Formulir BPJS).
- **`NewsItem` (`news_items`):** Papan pengumuman dan berita resmi perusahaan.
- **`TodoItem` (`todo_items`):** Catatan tugas pribadi karyawan.

### 12 Database Enums
1. `EmploymentType`: `PERMANENT`, `CONTRACT`, `PROBATION`, `INTERN`.
2. `PayslipItemType`: `ALLOWANCE`, `DEDUCTION`.
3. `AssessmentStatus`: `PENDING`, `APPROVED`, `REJECTED`.
4. `AssetKondisi`: `BAIK`, `KURANG_BAIK`, `RUSAK`.
5. `AssetStatus`: `AVAILABLE`, `IN_USE`, `MAINTENANCE`, `RETIRED`, `COMPANY_OWNED`.
6. `HolderType`: `EMPLOYEE`, `FORMER_EMPLOYEE`, `TEAM`, `GA_POOL`, `COMPANY_OWNED`.
7. `LetterType`: `SK_KERJA`, `KET_PENGHASILAN`, `KET_MASIH_BEKERJA`, `BPJS`.
8. `LetterStatus`: `PENDING`, `PROCESSING`, `READY`, `REJECTED`.
9. `TicketType`: `NEW_REQUEST`, `DAMAGE_REPORT`.
10. `TicketStatus`: `PENDING`, `IN_PROGRESS`, `APPROVED`, `REJECTED`, `RESOLVED`.
11. `EmployeeAddressType`: `ID_CARD`, `DOMICILE`.
12. `DocumentType`: `KTP`, `NPWP`, `BPJS_KES`, `BPJS_TK`, `IJAZAH`, `KARTU_KELUARGA`, `KONTRAK`, `OTHER`.

---

## 6. API & Data Flow Knowledge

Semua endpoint API berlokasi di bawah direktori `src/app/api/` (77 Route Handlers):

### 1. Autentikasi & Akun (`/api/auth/*`)
- **`POST /api/auth/login`:** Verifikasi login dengan proteksi rate limit ganda (IP & akun). Menerbitkan JWT HTTP-Only cookie `session`.
- **`POST /api/auth/logout`:** Menghapus cookie `session` dan membroadcast event logout antar-tab.
- **`GET /api/auth/me`:** Mengembalikan data sesi user aktif yang diverifikasi langsung ke database `UserAccount` & `sessionVersion`.
- **`POST /api/auth/change-password`:** Mengubah password pribadi user dan menaikkan `sessionVersion` untuk membatalkan sesi lama.
- **`POST /api/auth/send-password`:** Menghasilkan password acak baru dan mengirimkannya via email SMTP.
- **`GET /api/auth/profile`:** Mengambil data profil akun pengguna yang sedang login.

### 2. Karyawan & Master Data (`/api/employees/*`, `/api/master/*`)
- **`GET /api/employees`:** Mengambil daftar karyawan (mematuhi hierarki BFS untuk non-HR).
- **`POST /api/employees`:** Mendaftarkan karyawan baru (termasuk komponen payroll, rekening, dan data pribadi terenkripsi).
- **`GET /api/employees/[id]`:** Mengambil data komprehensif profil karyawan.
- **`PUT /api/employees/[id]`:** Memperbarui data karyawan.
- **`POST /api/employees/[id]/status`:** Mengubah status aktif/non-aktif karyawan, memvalidasi dependensi (aset peminjaman, tiket pending, subordinat langsung), dan melakukan pemindahan manager bawahan secara atomik.
- **`GET /api/employees/[id]/documents` & `POST ...`:** Mengunggah dan mengunduh arsip dokumen fisik karyawan (validasi signature magic bytes).
- **`DELETE /api/employees/[id]/documents/[documentId]`:** Menghapus arsip dokumen fisik karyawan.
- **`POST /api/employees/import`:** Impor massal data karyawan via file Excel (two-phase: prepare & execute).
- **`GET /api/employees/import/template`:** Mengunduh template Excel resmi impor karyawan.
- **`GET /api/employees/assets`:** Mengambil daftar aset yang sedang dipinjam oleh karyawan tertentu.
- **`GET /api/employees/birthdays`:** Mengambil data ulang tahun karyawan untuk bulan tertentu.
- **`GET /api/master/departments` & `POST ...`:** Master data departemen.
- **`GET /api/master/divisions` & `POST ...`:** Master data divisi.
- **`GET /api/master/positions` & `POST ...`:** Master data jabatan.
- **`GET /api/master/locations` & `POST ...`:** Master data titik geofencing kantor.
- **`GET /api/master/payroll-components` & `POST ...`:** Master komponen tunjangan dan potongan gaji.

### 3. Absensi & Koreksi (`/api/attendance/*`)
- **`GET /api/attendance`:** Mengambil rekaman log kehadiran (filter per karyawan / tanggal).
- **`GET /api/attendance/network`:** Mendeteksi status koneksi Wi-Fi kantor (`192.168.20.1`) secara real-time untuk validasi sebelum submit.
- **`POST /api/attendance`:** Melakukan clock-in atau clock-out dengan validasi IP Wi-Fi kantor (192.168.20.1), GPS geofencing Haversine, deteksi mock-location, penyimpanan foto selfie terkompresi downsampling 480px (~30KB), serta penyematan audit metadata jaringan (`clientIp`, `isOfficeWifi`, `networkName`) ke dalam JSON lokasi.
- **`GET /api/attendance/correction` & `POST ...` & `PUT ...`:** Pengajuan koreksi jam absensi oleh karyawan dan persetujuan/penolakan oleh Manager/HR.

### 4. Kunjungan Klien Lapangan (`/api/visits/*`)
- **`GET /api/visits`:** Mengambil daftar laporan kunjungan lapangan.
- **`POST /api/visits`:** Membuat draft kunjungan baru.
- **`PUT /api/visits`:** Melakukan check-in dan check-out kunjungan disertai pengunggahan 2-5 foto bukti bergeotag. Server otomatis memvalidasi Base64 JPEG, menghitung SHA-256 berkas asli, menerapkan dynamic SVG watermark menggunakan Sharp, dan menyimpan foto ke storage privat.
- **`GET /api/visits/photos/[photoId]`:** Mengambil stream citra foto kunjungan (`?variant=stamped` atau `?variant=original`) dengan otorisasi berbasis sesi.

### 5. Cuti & Lembur (`/api/leave/*`, `/api/overtime/*`)
- **`GET /api/leave` & `POST /api/leave`:** Pengajuan cuti (validasi otomatis saldo cuti tahunan dan penghitungan hari kerja riil mematuhi shift kerja & kalender hari libur nasional).
- **`PUT /api/leave`:** Persetujuan atau penolakan cuti oleh HR (otomatis memotong `usedLeave` jika disetujui).
- **`GET /api/overtime` & `POST /api/overtime` & `PUT /api/overtime`:** Pengajuan lembur, perhitungan upah estimasi otomatis sesuai regulasi Depnaker PP 35/2021, dan persetujuan HR.

### 6. Penggajian & Pajak (`/api/payslips/*`, `/api/pph21/*`, `/api/bpjs/*`)
- **`GET /api/payslips` & `POST /api/payslips`:** Pembuatan dan peninjauan slip gaji bulanan karyawan.
- **`POST /api/payslips/bulk`:** Pembuatan slip gaji massal satu periode untuk semua karyawan aktif.
- **`POST /api/pph21/calculate`:** Simulasi kalkulasi PPh 21 bulanan metode TER (Kategori A, B, C) serta perhitungan masa pajak Desember tarif progresif Pasal 17.
- **`POST /api/bpjs/calculate`:** Simulasi kalkulasi iuran BPJS Kesehatan dan BPJS Ketenagakerjaan.

### 7. Manajemen Aset General Affairs (`/api/assets/*`, `/api/ga/*`, `/api/sim-cards/*`)
- **`GET /api/assets` & `POST /api/assets`:** Inventarisasi aset fisik dengan penomoran kode otomatis berbasis prefix kategori.
- **`GET /api/assets/[id]` & `PUT ...` & `DELETE ...`:** Detail dan pengubahan data aset.
- **`POST /api/assets/assign`:** Penyerahan atau pengembalian aset antara GA Pool dan karyawan/tim beserta pencatatan riwayat (`AssetHistory`) dan upload BAST PDF.
- **`POST /api/assets/[id]/inspect`:** Pencatatan hasil inspeksi checklist fisik aset.
- **`POST /api/assets/[id]/maintenance`:** Pencatatan servis vendor aset.
- **`POST /api/assets/[id]/retire`:** Pengafkiran aset yang rusak total.
- **`GET /api/assets/categories` & `POST ...`:** Manajemen kategori aset dan prefix kode.
- **`GET /api/assets/export`:** Ekspor data inventaris aset ke format Excel.
- **`GET /api/assets/history`:** Riwayat mutasi dan sirkulasi aset.
- **`GET /api/assets/stats`:** Agregasi statistik aset berdasarkan status dan kategori.
- **`GET /api/assets/qr`:** Generator QR code massal aset untuk cetak label.
- **`POST /api/assets/bulk`:** Impor massal aset dari template Excel.
- **`GET /api/assets/bast/[id]`:** Mengambil berkas dokumen BAST binary.
- **`GET /api/public/assets/[id]`:** Endpoint publik untuk pemindaian label QR aset tanpa login wajib.
- **`GET /api/ga/tickets` & `POST ...` & `PUT ...`:** Helpdesk tiket permohonan dan pelaporan kerusakan aset.
- **`GET /api/sim-cards` & `POST ...` & `PUT /api/sim-cards/[id]`:** Manajemen kartu SIM operasional perusahaan.

### 8. Ulang Tahun & Notifikasi (`/api/birthdays/*`, `/api/notifications/*`, `/api/push/*`)
- **`GET /api/birthdays`:** Ringkasan kalender ulang tahun karyawan aktif.
- **`POST /api/birthdays/preparation`:** Memperbarui status persiapan ulang tahun per karyawan per tahun.
- **`GET /api/birthdays/settings` & `PUT ...`:** Pengaturan pengingat email otomatis ulang tahun (interval H-30, H-14, H-7).
- **`GET /api/birthdays/statuses` & `POST ...` & `PUT /api/birthdays/statuses/[id]`:** Master status pipeline persiapan perayaan ulang tahun.
- **`POST /api/birthdays/test-email`:** Mengirim email uji coba notifikasi ulang tahun ke HR.
- **`GET /api/notifications`:** Notifikasi operasional untuk HR (cuti, lembur, kunjungan, karyawan alpha, surat).
- **`GET /api/notifications/employee`:** Notifikasi personal untuk karyawan (status cuti/lembur diupdate, koreksi absensi disetujui/ditolak, berita baru, surat siap diambil).
- **`POST /api/push/subscribe`:** Mendaftarkan langganan Web Push notification browser.

### 9. Telemetri, Audit, & Cron Background Jobs (`/api/logs/*`, `/api/audit/*`, `/api/cron/*`)
- **`POST /api/logs/client`:** Endpoint penampung log peringatan dan error dari browser client yang dituliskan ke Winston logger.
- **`GET /api/audit`:** Mengambil data log audit trail sistem.
- **`POST /api/cron/daily-greeting`:** Cron 07:00 WIB untuk Web Push notification harian ke seluruh karyawan aktif.
- **`POST /api/cron/birthday-reminder`:** Cron 08:00 WIB untuk memeriksa ulang tahun mendatang dan mengirim email rekap ke HR.
- **`GET /api/cron/cleanup-photos`:** Pembersihan foto absensi lama (>90 hari).
- **`GET /api/cron/reset-leave`:** Reset saldo cuti terpakai pada 1 Januari.
- **`GET /api/cron/generate-payroll`:** Otomasi kompilasi slip gaji bulanan.

---

## 7. Authentication & User Flow

### 1. Mekanisme Autentikasi
Aplikasi menggunakan sistem **Stateless JWT dengan Server-Side State Verification**:
1. User memasukkan ID Karyawan (`employeeId` atau `username`) dan password di halaman login (`/`).
2. Proteksi rate limit ganda diterapkan (`rateLimit.ts`):
   - IP-based: maksimal 30 request / menit.
   - Account-based: maksimal 5 request / menit pada `login:account:${identifier}`.
3. Server mencari akun di tabel `UserAccount` (terhubung ke `Employee`). Menggunakan `timing-equalizer` hashing untuk mencegah *timing attack* jika akun tidak ditemukan.
4. Password dicocokkan menggunakan `bcrypt.compare`.
5. Jika valid, server menerbitkan JWT terenkripsi HS256 yang memuat: `userId`, `username`, `employeeId`, `roles`, `permissions`, `sessionVersion`, dll.
6. Token disimpan di Cookie browser bernama `session` dengan atribut: `httpOnly: true`, `secure: production`, `sameSite: "strict"`, `path: "/"`.
7. Durasi sesi: 8 jam (standar) atau 30 hari jika opsi "Ingat Saya" dicentang.

### 2. Dual-Layer Verification
- **Layer 1 (Edge Middleware - `src/proxy.ts`):** Memverifikasi signature JWT sebelum Next.js merender halaman atau memproses rute. Mencegah akses liar ke prefix `/dashboard/*`, `/ga/*`, dan `/employee/*`.
- **Layer 2 (API Handlers - `src/lib/auth.ts` -> `getActiveSession()`):** Mengambil session payload, lalu memvalidasi secara langsung ke database tabel `UserAccount`:
  - Akun user harus `isActive: true`.
  - Jika akun terhubung ke data karyawan, karyawan harus `isActive: true`.
  - Field `sessionVersion` pada JWT harus persis sama dengan yang ada di database. Jika administrator melakukan "Revoke Session" atau password diubah, nilai di database dinaikkan sehingga sesi lama langsung gugur tanpa menunggu JWT expired.

### 3. Cross-Tab Session Synchronization (`src/lib/authEvents.ts`)
Aplikasi menyelaraskan status sesi di seluruh tab browser yang terbuka:
- Saat user login atau logout, fungsi `notifyAuthChanged()` menuliskan payload event ke `localStorage` (`wig:auth-changed`) dan memancarkan `CustomEvent`.
- Seluruh tab lain mendengarkan event via `subscribeAuthChanged()`:
  - Jika terjadi logout di tab A, tab B otomatis menghapus sesi lokal dan me-redirect ke halaman login (`/`).
  - Jika terjadi login di tab A, tab B otomatis memperbarui data pengguna tanpa perlu refresh manual.

### 4. Role & Permission Mapping

| Role (`SystemRole`) | Default Permission Codes | Hak Akses Portal Utama |
| :--- | :--- | :--- |
| **`SUPER_ADMIN`** | `user.manage`, `hr.manage`, `ga.manage`, `employee.self`, `asset.read` | Akses penuh ke Portal HR (`/dashboard`), Portal GA (`/ga`), dan User Management (`/dashboard/users`). |
| **`HR_ADMIN`** | `hr.manage`, `employee.self`, `asset.read` | Akses penuh ke seluruh fitur HR (`/dashboard/*`) kecuali manajemen user sistem. |
| **`GA_ADMIN`** | `ga.manage`, `employee.self`, `asset.read` | Akses operasional inventaris General Affairs (`/ga/*`). |
| **`EMPLOYEE_USER`** | `employee.self`, `asset.read` | Akses portal mandiri karyawan (`/employee/*`). Jika memiliki bawahan, menu Monitoring Tim aktif. |

### 5. Hierarki Pengawasan Karyawan (Manager Access)
Sistem menerapkan traversal graf **Breadth-First Search (BFS)** pada relasi `Employee.managerId`. Karyawan dengan posisi Supervisor/Manager dapat memantau kehadiran, cuti, dan kinerja seluruh subordinat langsung maupun subordinat di bawahnya (level 1 sampai N), dilengkapi mekanisme deteksi siklus (`visitedIds`) untuk mencegah *infinite loop*.

---

## 8. Page & Route Map

Total terdapat **56 rute halaman tampilan** (`page.tsx`):

### Public Entry (2 Halaman)
| Route | Tujuan | Komponen Utama | Data Source | Akses |
| :--- | :--- | :--- | :--- | :--- |
| `/` | Halaman login tunggal seluruh sistem. | `LoginPage` | `POST /api/auth/login` | Publik |
| `/scan/[id]` | Peninjauan detail publik aset dari scan label QR fisik & formulir inspeksi GA instan. | `ScanPage` | `GET /api/public/assets/[id]`, `POST /api/assets/[id]/inspect` | Publik (Inspeksi memerlukan auth GA) |

### HR Portal (`/dashboard/*` - 24 Halaman)
| Route | Tujuan | Komponen Utama | Data Source | Akses |
| :--- | :--- | :--- | :--- | :--- |
| `/dashboard` | Dashboard analitik HR (statistik absensi hari ini, cuti pending, aktivitas terbaru). | `DashboardPage` | `/api/analytics`, `/api/attendance`, `/api/leave` | HR Admin |
| `/dashboard/attendance` | Monitoring rekaman absensi seluruh karyawan, audit verifikasi Wi-Fi kantor & IP, live status, & ekspor Excel. | `AttendancePage` | `/api/attendance` | HR Admin |
| `/dashboard/attendance/correction` | Verifikasi & persetujuan koreksi absensi. | `AttendanceCorrectionPage` | `/api/attendance/correction` | HR Admin |
| `/dashboard/visits` | Monitoring laporan kunjungan klien & verifikasi foto lapangan ber-watermark. | `VisitsPage` | `/api/visits` | HR Admin |
| `/dashboard/leave` | Manajemen permohonan cuti tahunan, sakit, & izin. | `LeavePage` | `/api/leave` | HR Admin |
| `/dashboard/birthdays` | Kalender ulang tahun karyawan & pelacakan persiapan kado/kue. | `BirthdaysPage` | `/api/birthdays`, `/api/birthdays/preparation` | HR Admin |
| `/dashboard/employees` | Tabel direktori master karyawan, filter status, ekspor data. | `EmployeesPage` | `/api/employees` | HR Admin |
| `/dashboard/employees/create` | Formulir multi-langkah registrasi karyawan baru. | `EmployeeCreatePage` | `/api/employees`, `/api/master/*` | HR Admin |
| `/dashboard/employees/[id]/360-view` | Tampilan komprehensif profil 360 karyawan (karir, absensi, slip gaji, aset). | `Employee360Page` | `/api/employees/[id]`, `/api/analytics` | HR Admin |
| `/dashboard/employees/[id]/edit` | Formulir pengubahan data karyawan. | `EmployeeEditPage` | `/api/employees/[id]` | HR Admin |
| `/dashboard/shifts` | Konfigurasi jam kerja shift harian dan toleransi waktu. | `ShiftsPage` | `/api/shifts` | HR Admin |
| `/dashboard/master-data` | Konfigurasi master Departemen, Divisi, Posisi, & Titik Lokasi Geofencing. | `MasterDataPage` | `/api/master/*` | HR Admin |
| `/dashboard/overtime` | Persetujuan jam lembur & rekapitulasi biaya lembur. | `OvertimePage` | `/api/overtime` | HR Admin |
| `/dashboard/payroll` | Pembuatan slip gaji bulanan, rekap gaji, & status terbit. | `PayrollPage` | `/api/payslips` | HR Admin |
| `/dashboard/master-payroll` | Konfigurasi master komponen tunjangan & potongan payroll. | `MasterPayrollPage` | `/api/master/payroll-components` | HR Admin |
| `/dashboard/pph21-calculator` | Alat simulasi kalkulasi PPh 21 TER (PP 58/2023) & Pasal 17. | `Pph21CalculatorPage` | `/api/pph21/calculate` | HR Admin |
| `/dashboard/bpjs-calculator` | Alat simulasi kalkulasi iuran BPJS Kesehatan & BPJS Ketenagakerjaan. | `BpjsCalculatorPage` | `/api/bpjs/calculate` | HR Admin |
| `/dashboard/overtime-calculator` | Alat simulasi upah lembur regulasi Depnaker (PP 35/2021). | `OvertimeCalculatorPage`| `overtimeCalcService` | HR Admin |
| `/dashboard/reports` | Pusat unduh laporan berkala (Excel & PDF) absensi, cuti, lembur, kunjungan. | `ReportsPage` | `/api/export` | HR Admin |
| `/dashboard/audit` | Catatan audit trail seluruh aktivitas mutasi data dalam sistem. | `AuditPage` | `/api/audit` | HR Admin |
| `/dashboard/news` | Manajemen penerbitan berita & pengumuman internal perusahaan. | `NewsPage` | `/api/news` | HR Admin |
| `/dashboard/letter-requests` | Pemrosesan permohonan surat keterangan kerja resmi karyawan. | `LetterRequestsPage` | `/api/letter-requests` | HR Admin |
| `/dashboard/users` | Manajemen akun login, reset session counter, dan penetapan role RBAC. | `UsersPage` | `/api/users` | Super Admin |
| `/dashboard/assets` | Peninjauan aset inventaris dari sudut pandang HR (read-only). | `HrAssetsPage` | `/api/assets` | HR Admin |

### Employee Portal (`/employee/*` - 16 Halaman)
| Route | Tujuan | Komponen Utama | Data Source | Akses |
| :--- | :--- | :--- | :--- | :--- |
| `/employee` | Dashboard beranda karyawan (jam kerja hari ini, shortcut cepat, status clock-in).| `EmployeeDashboard` | `/api/attendance`, `/api/notifications/employee` | Karyawan |
| `/employee/attendance` | Absensi 3-faktor: verifikasi Wi-Fi kantor (192.168.20.1), validasi GPS geofencing, foto selfie terkompresi 480px, toggle kamera depan/belakang, & cek ulang jaringan instan. | `AttendanceCameraPage`| `/api/attendance/network`, `/api/attendance` | Karyawan |
| `/employee/attendance-history` | Riwayat log kehadiran pribadi & ringkasan kehadiran bulanan. | `AttendanceHistory` | `/api/attendance` | Karyawan |
| `/employee/attendance/correction`| Formulir pengajuan koreksi jam absensi. | `AttendanceCorrection` | `/api/attendance/correction` | Karyawan |
| `/employee/visits` | Pelaporan kunjungan klien luar kantor (check-in, check-out, multi-photo). | `EmployeeVisitsPage` | `/api/visits` | Karyawan |
| `/employee/overtime` | Pengajuan lembur mandiri & riwayat status persetujuan. | `EmployeeOvertimePage` | `/api/overtime` | Karyawan |
| `/employee/payslip` | Peninjauan & pengunduhan PDF slip gaji pribadi bulanan. | `EmployeePayslipPage` | `/api/payslips` | Karyawan |
| `/employee/leave` | Pengajuan cuti tahunan/sakit & informasi sisa kuota cuti. | `EmployeeLeavePage` | `/api/leave` | Karyawan |
| `/employee/documents` | Unggah & tinjau arsip dokumen pribadi (KTP, NPWP, BPJS, Ijazah). | `EmployeeDocumentsPage`| `/api/employees/[id]/documents` | Karyawan |
| `/employee/assets` | Daftar aset inventaris yang sedang dipinjam & form lapor kerusakan. | `EmployeeAssetsPage` | `/api/employee/assets`, `/api/ga/tickets`| Karyawan |
| `/employee/monitoring` | Pemantauan absensi tim subordinat langsung (untuk manager/supervisor). | `TeamMonitoringPage` | `/api/employees`, `/api/attendance` | Karyawan (Manager) |
| `/employee/monitoring/[id]` | Rincian histori kehadiran satu anggota tim subordinat. | `SubordinateDetailPage`| `/api/employees/[id]`, `/api/attendance`| Karyawan (Manager) |
| `/employee/news` | Papan berita & artikel resmi dari manajemen. | `EmployeeNewsPage` | `/api/news` | Karyawan |
| `/employee/todos` | Pengingat daftar tugas pribadi harian. | `EmployeeTodosPage` | `/api/todos` | Karyawan |
| `/employee/profile` | Tinjau profil & kontak darurat karyawan. | `EmployeeProfilePage` | `/api/auth/me` | Karyawan |
| `/employee/settings` | Pengubahan password akun & preferensi notifikasi web push. | `EmployeeSettingsPage` | `/api/auth/change-password`, `/api/push/subscribe` | Karyawan |

### GA Portal (`/ga/*` - 14 Halaman)
| Route | Tujuan | Komponen Utama | Data Source | Akses |
| :--- | :--- | :--- | :--- | :--- |
| `/ga` | Dashboard inventaris General Affairs (sebaran status, kategori aset, tiket). | `GaDashboardPage` | `/api/assets/stats`, `/api/ga/tickets` | GA Admin |
| `/ga/assets` | Manajemen data master seluruh aset fisik perusahaan. | `GaAssetsPage` | `/api/assets` | GA Admin |
| `/ga/assets/create` | Pendaftaran unit aset fisik baru. | `GaAssetCreatePage` | `/api/assets`, `/api/assets/categories` | GA Admin |
| `/ga/assets/import` | Impor massal data aset dari spreadsheet Excel. | `GaAssetImportPage` | `/api/assets/bulk` | GA Admin |
| `/ga/assets/print` | Halaman siap cetak label stiker QR code aset (ukuran grid stiker). | `GaAssetPrintPage` | `/api/assets/qr` | GA Admin |
| `/ga/assets/[id]` | Peninjauan detail riwayat mutasi aset, dokumen BAST, & riwayat servis. | `GaAssetDetailPage` | `/api/assets/[id]` | GA Admin |
| `/ga/assets/[id]/assign` | Form serah terima aset ke karyawan/tim, handover, dan upload BAST. | `GaAssetAssignPage` | `/api/assets/assign`, `/api/employees` | GA Admin |
| `/ga/assets/[id]/edit` | Pengubahan data spesifikasi aset. | `GaAssetEditPage` | `/api/assets/[id]` | GA Admin |
| `/ga/categories` | Manajemen kategori aset & pengaturan kode prefix otomatis. | `GaCategoriesPage` | `/api/assets/categories` | GA Admin |
| `/ga/scan` | Scanner kamera QR internal untuk audit fisik cepat inventaris kantor. | `GaScanPage` | `html5-qrcode`, `/api/assets/[id]` | GA Admin |
| `/ga/sim` | Manajemen inventaris kartu SIM operasional perusahaan. | `GaSimPage` | `/api/sim-cards` | GA Admin |
| `/ga/sim/create` | Penambahan data nomor kartu SIM baru. | `GaSimCreatePage` | `/api/sim-cards` | GA Admin |
| `/ga/sim/[id]/edit` | Pengubahan alokasi kartu SIM ke karyawan. | `GaSimEditPage` | `/api/sim-cards/[id]` | GA Admin |
| `/ga/tickets` | Helpdesk tiket permohonan aset baru & perbaikan barang rusak dari staf. | `GaTicketsPage` | `/api/ga/tickets` | GA Admin |

---

## 9. Component & UI Pattern Knowledge

### 1. AppShell Architecture (`src/components/layout/AppShell.tsx`)
Struktur shell layout terpusat yang digunakan bersama oleh Dashboard HR, Portal Karyawan, dan Portal GA:
- **Desktop Sidebar:** Kolapsibel (`storageKey` tersimpan di `localStorage`), navigasi bertingkat (`subItems`), penanda rute aktif berbasis pencocokan `pathname` dan `searchParams`, profil user di bagian footer, dan tombol tema (`ThemeToggle`).
- **Mobile Header:** Brand title ringkas, tombol hamburger penampil drawer menu, dan slot header kanan (`mobileHeaderRight`) untuk lonceng notifikasi.
- **Mobile Bottom Bar (`MobileBottomNav`):** Khusus portal karyawan, navigation bar melayang (*glassmorphism*) dengan tombol absensi tengah yang menonjol dan berkilau (*ambient glow button*).

### 2. Form Auto-Drafting & Unsaved Changes Protection
- **`useFormDraft` (`src/hooks/useFormDraft.ts`):** Hook yang secara otomatis menyimpan isian form ke `localStorage` dengan debounce 500ms dan masa berlaku 24 jam. Jika form di-reload atau tab tertutup tidak sengaja, data form dipulihkan secara instan.
- **`FormDraftBanner` (`src/components/FormDraftBanner.tsx`):** Komponen banner animasi yang menampilkan timestamp draft tersimpan dan tombol "Hapus Draft & Reset" untuk membersihkan draft.
- **`useUnsavedChanges` (`src/hooks/useUnsavedChanges.ts`):** Memasang listener `beforeunload` untuk mencegah navigasi keluar yang tidak disengaja ketika formulir dalam status kotor (`isDirty: true`).

### 3. Arsitektur Formulir Karyawan Terpisah (`src/components/employee-form/*`)
Formulir master karyawan dipecah menjadi modul-modul tab terpisah untuk kemudahan perawatan:
- `IdentitySection`: Data dasar, gelar akademik, panggilan, gender.
- `JobSection`: Penugasan departemen, divisi, jabatan, shift kerja, manager langsung, status kontrak.
- `LocationSection`: Pemilihan kantor geofencing dan opsi bypass lokasi GPS.
- `PayrollSection`: Pengaturan gaji pokok dan komponen tunjangan/potongan.
- `PrivateDataSection`: Data PII terenkripsi (KTP, KK, BPJS, Rekening Bank, PTKP, data kelahiran, kontak darurat).
- `EmployeeDocumentManager`: Pengelolaan berkas fisik arsip (KTP, NPWP, BPJS, Ijazah).

### 4. Push Notification Auto-Registration (`PushNotificationManager.tsx`)
Komponen tak kasat mata yang terpasang di portal karyawan untuk mendaftarkan Web Push notification:
- Memeriksa ketersediaan Service Worker & PushManager.
- Mengonversi VAPID public key base64 URL menjadi `Uint8Array` (`urlBase64ToUint8Array`).
- Mendaftarkan subscription ke browser dan mengirimkan endpoint ke backend `/api/push/subscribe`.

### 5. Notification Panels (HR vs Employee)
- **HR (`NotificationCenter.tsx`):** Dropdown lonceng pada desktop/mobile header yang memantau pengajuan menunggu persetujuan (cuti, lembur, kunjungan, surat, karyawan mangkir).
- **Employee (`EmployeeNotificationPanel.tsx`):** Slide-over panel khusus karyawan yang menampilkan status pengajuan yang telah disetujui/ditolak, berita baru, dan surat kerja yang telah selesai diproses.

---

## 10. Business Feature Knowledge

### 1. Absensi 3-Faktor (Wi-Fi Kantor, GPS Geofencing, & Foto Selfie Cepat)
- **Verifikasi Wi-Fi Kantor Resmi (Network Whitelist):**
  - Menggunakan `src/lib/networkValidator.ts` yang membaca header `x-forwarded-for` dan `x-real-ip` dari Nginx.
  - Memvalidasi koneksi terhadap IP Gateway Hairpin NAT MikroTik RB4011 (`192.168.20.1`), subnet kantor (`192.168.20.0/24`), atau IP publik statis Citranet (`202.152.141.27`).
  - Seluruh IP di luar jaringan kantor (seluler Telkomsel, Indosat, XL, Tri, Smartfren, Wi-Fi rumah/cafe, VPN) otomatis ditolak dengan pesan informatif.
  - Karyawan dengan konfigurasi `bypassLocation: true` (direksi/remote) dikecualikan dari batasan ini.
- **Geofencing & Anti-Spoofing:**
  - Pengecekan jarak koordinat pengguna terhadap titik kantor (`Office WIG` & `Office MKI`) menggunakan formula **Haversine** (`calculateDistance`, toleransi radius 100 meter).
  - `gpsValidator.ts` memeriksa integritas data lokasi: mendeteksi akurasi yang terlalu rendah (>100m), akurasi palsu/mock (<1m atau 0m), dan anomali kecepatan gerak tidak wajar (>14 m/s atau 50 km/jam).
- **Foto Selfie Cepat & Downsampling Ringan:**
  - Pengambilan foto selfie cepat menggunakan HTML5 MediaDevices Canvas tanpa beban pemindaian neural network yang lambat.
  - **Downsampling Canvas:** Resolusi dibatasi maksimal lebar `480px` pada kualitas JPEG `0.72`, mereduksi ukuran Base64 dari ~400 KB menjadi hanya **~25–35 KB per foto (hemat 92%)**. Untuk 70 karyawan, konsumsi storage VPS hanya bertambah ~105 MB / bulan.
  - **Toggle Kamera Depan / Belakang:** Fitur pembalik kamera (`facingMode: "user"` vs `"environment"`) berikon `SwitchCamera` dengan penyesuaian cermin (*mirroring*) otomatis.
- **Audit Trail Jaringan di Dashboard HR:**
  - Metadata jaringan (`clientIp`, `isOfficeWifi`, `networkName`) disematkan ke dalam JSON kolom `clockInLocation` dan `clockOutLocation` tanpa perlu migrasi skema database.
  - Tabel absensi HR ([`/dashboard/attendance`](file:///c:/Users/ITSupportWIG/Desktop/hriswig/src/app/dashboard/attendance/page.tsx)) menampilkan kolom **Verifikasi** dengan badge visual: 🟢 **Wi-Fi WIG** (dengan hover tooltip menampilkan IP perangkat karyawan), 🟡 **Bypass**, dan 🔘 **GPS**.
  - Ekspor laporan Excel otomatis menyertakan kolom "Verifikasi Jaringan".

### 2. Pelaporan Kunjungan Lapangan (Field Visits) & Watermarking
- Staf lapangan (sales/teknisi) membuat draft kunjungan ke klien.
- Saat berada di lokasi, staf melakukan clock-in dan mengambil 2 hingga 5 foto bukti dokumentasi.
- Server (`visitPhotoService.ts`) memproses foto menggunakan pustaka `sharp`:
  - Validasi magic byte JPEG (mencegah penyamaran berkas skrip).
  - Menghitung checksum SHA-256 berkas asli untuk jaminan keaslian hukum.
  - Merender overlay SVG dinamis di atas foto yang mencantumkan: Nama Karyawan, Nama Klien, Kategori Foto (LOKASI, AKTIVITAS, HASIL, DOKUMEN), Waktu Resmi Server (WIB), dan Koordinat GPS.
  - Menyimpan foto asli dan foto ber-watermark di direktori aman `storage/visit-photos/`.

### 3. Regulasi Penggajian & Pajak Indonesia
- **PPh 21 TER (PP 58/2023 & PMK 168/2023):**
  - Masa Pajak Januari–November: Tarif Efektif Rata-Rata (TER) Kategori A, B, atau C ditentukan berdasarkan status PTKP (TK/0, K/1, dst.) dan penghasilan bruto bulanan.
  - Masa Pajak Desember: Menghitung penghasilan neto setahun, dikurangi biaya jabatan (5% maks Rp6.000.000/tahun), dikurangi PTKP tahunan untuk menghasilkan PKP, kemudian dikenakan tarif progresif Pasal 17 UU HPP (5%, 15%, 25%, 30%, 35%), lalu dikurangi total PPh 21 yang telah dipotong Jan–Nov.
- **BPJS Kesehatan & Ketenagakerjaan:**
  - BPJS Kesehatan: 4% ditanggung perusahaan, 1% ditanggung karyawan (batas upah maks Rp12.000.000).
  - JHT: 3.7% perusahaan, 2% karyawan.
  - JKK: Tarif perusahaan 0.24% – 1.74% berdasarkan tingkat risiko lingkungan kerja (Tingkat 1 s/d 5).
  - JKM: 0.3% perusahaan.
  - JP: 2% perusahaan, 1% karyawan (dengan batas plafon upah berkala).
- **Upah Lembur (PP 35/2021):**
  - Upah sejam = `1 / 173 × (Gaji Pokok + Tunjangan Tetap)`.
  - Hari kerja: jam pertama 1.5×, jam berikutnya 2.0×.
  - Hari libur: skema berjenjang 2×, 3×, dan 4× upah sejam.

### 4. Manajemen Siklus Hidup Aset (GA Asset Lifecycle)
- Setiap aset memiliki kode unik terstruktur (contoh: `LP-001`, `HP-012`) yang dihitung otomatis berdasarkan counter kategori.
- Siklus kepemilikan aset bergerak antara: `GA_POOL` (Tersedia) ──► `EMPLOYEE` / `TEAM` (Digunakan) ──► `MAINTENANCE` (Perbaikan Vendor) ──► `RETIRED` (Afkir).
- Penyerahan aset wajib disertai pembuatan dokumen BAST PDF dengan tanda tangan dan log riwayat mutasi tanpa jeda.
- Label aset memiliki QR code yang mengarah ke `/scan/[id]` untuk audit inventaris fisik secara instan.
- Generator template impor aset (`excelTemplateGenerator.ts`) menggunakan `exceljs` untuk menghasilkan template dengan kolom wajib berwarna khusus, baris contoh, dan sheet panduan.

### 5. Impor Massal Data Karyawan Dua Fase (`bulk-import/`)
- **Fase 1 (Prepare):** Parsing file Excel (`parseExcel`), validasi skema baris per baris, pencocokan referensi divisi/departemen/posisi/manager, identifikasi baris konflik/gagal, deteksi kolom angka berbahaya (`unsafeNumericFields` e.g., NIK terformat eksponensial di Excel), dan pembentukan rencana eksekusi (`CREATE`, `UPDATE`, `UNCHANGED`).
- **Fitur Khusus Update:** Teks penanda `[HAPUS]` dapat digunakan di sel Excel untuk mereset kolom database menjadi `null`.
- **Fase 2 (Execute):** Menjalankan pembaruan dalam transaksi atomik Prisma, membuat akun login baru otomatis jika belum ada, mengenkripsi PII, dan mencatat log eksekusi ke `EmployeeImportJob`.

### 6. Keamanan Data Pribadi (PII Protection)
- NIK KTP, No KK, No BPJS, dan No Rekening Bank dienkripsi sebelum masuk database menggunakan algoritma `AES-256-GCM` dengan random IV 12-byte dan auth tag (`enc:v1:iv:tag:data`).
- Untuk keperluan pencarian pencocokan unik tanpa dekripsi (blind index), sistem membuat hash deterministik menggunakan `HMAC-SHA256` (`hashPii()`).
- Data sensitif yang ditampilkan ke antarmuka non-privileged secara default disamarkan (`maskPii()`, e.g., `************1234`).

### 7. Client-Side Telemetry Logging Pipeline
- Pustaka `clientLogger.ts` membungkus logging di browser:
  - Dalam mode produksi, console browser dijaga tetap bersih (*silent*).
  - Log level `warn` dan `error` otomatis dikirimkan secara asinkron ke endpoint `/api/logs/client` menggunakan API `fetch` dengan flag `keepalive: true`.
  - Endpoint `/api/logs/client` memvalidasi payload via Zod, menambahkan metadata user/sesi, dan menuliskannya ke log Winston server.

---

## 11. Coding Convention

### 1. Penamaan File & Direktori
- **API Routes:** Mengikuti konvensi Next.js App Router: `src/app/api/<fitur>/route.ts` atau `src/app/api/<fitur>/[id]/route.ts`.
- **Halaman:** `src/app/<portal>/<fitur>/page.tsx`.
- **Komponen React:** PascalCase (e.g., `EmployeeForm.tsx`, `AppShell.tsx`, `LeaveCalendar.tsx`).
- **Service & Utility:** camelCase (e.g., `employeeService.ts`, `pph21Service.ts`, `gpsValidator.ts`).
- **Skema Validasi:** `validationSchemas.ts` (penamaan skema berakhiran `Schema`, e.g., `leaveRequestSchema`, `employeeCreateSchema`).

### 2. Standar Pembuatan Endpoint API (Route Handler)
Setiap route handler wajib mengikuti struktur terstandarisasi berikut:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, validateBody, forbiddenResponse, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { logAction, actorFromSession } from "@/lib/services/auditService";
import { myFeatureSchema } from "@/lib/validations/validationSchemas";
import { executeMyFeature } from "@/lib/services/myService";

export async function POST(request: NextRequest) {
    try {
        // 1. Verifikasi Autentikasi Sesi
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();

        // 2. Verifikasi Otorisasi Role / Permission
        if (!canManageHr(session)) return forbiddenResponse();

        // 3. Validasi & Sanitasi Body dengan Zod
        const parsed = await validateBody(request, myFeatureSchema);
        if ("error" in parsed) return parsed.error;

        // 4. Panggil Business Logic Service
        const result = await executeMyFeature(parsed.data, session);

        // 5. Catat Audit Log
        await logAction("CREATE_FEATURE", "MyEntity", actorFromSession(session), result.id, { name: parsed.data.name });

        // 6. Kembalikan Response Terstruktur
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        return serverErrorResponse("MyFeature:POST", error);
    }
}
```

### 3. Standar Penanganan Waktu & Tanggal
- **DILARANG** mengandalkan `new Date().toISOString().slice(0, 10)` secara sembarangan untuk tanggal bisnis, karena waktu UTC akan bergeser 1 hari lebih lambat pada pukul 00:00 - 06:59 WIB.
- **GUNAKAN SELALU** pustaka utilitas yang telah disediakan:
  - `toWIBDateString(date)` untuk mendapatkan string `"YYYY-MM-DD"` di zona Asia/Jakarta.
  - `toDateString(d)` dari `src/lib/utils.ts` untuk konversi aman dari Date database.
  - `toTimeString(d)` untuk format jam `"HH:MM"`.

### 4. Standar Database & Query Prisma
- Gunakan `src/lib/prisma.ts` (jangan membuat instance `new PrismaClient()` baru).
- Selalu gunakan `Prisma.$transaction` jika melibatkan mutasi lebih dari satu tabel yang saling bergantung.
- Pastikan kueri membaca relasi yang dibutuhkan menggunakan `include` atau `select` terdefinisi.

### 5. Standar Telemetri & Penanganan Error Client
- Gunakan `reportClientError(module, message, error, meta)` dari `src/lib/clientErrors.ts` untuk menangkap exception di komponen React.
- Gunakan `getResponseErrorMessage(res, fallback)` untuk membaca pesan error ramah pengguna dari response API.

---

## 12. Feature Development Guide

Panduan bagi pengembang berikutnya jika ingin menambahkan fitur baru ke dalam proyek:

### Langkah 1: Pahami Lokasi & Desain Data
1. Tentukan apakah fitur memerlukan tabel baru atau penambahan kolom pada `prisma/schema.prisma`.
2. Jika mengubah skema, jalankan migrasi database:
   ```bash
   npx prisma db push
   ```
3. Definisikan tipe antarmuka data pada `src/types/index.ts`.

### Langkah 2: Buat Skema Validasi
1. Buka `src/lib/validations/validationSchemas.ts`.
2. Definisikan Zod schema untuk payload create (`xxxCreateSchema`) dan update (`xxxUpdateSchema`).
3. Terapkan sanitasi teks menggunakan helper `optionalNullableText` jika field bersifat opsional.

### Langkah 3: Implementasikan Service Layer
1. Buat file baru di `src/lib/services/<namaFitur>Service.ts`.
2. Tuliskan fungsi logika bisnis murni yang memanggil database via `prisma`.
3. Tambahkan pemanggilan `logAction` dari `src/lib/services/auditService.ts` untuk setiap mutasi data (CREATE, UPDATE, DELETE).

### Langkah 4: Buat Route Handler (API)
1. Buat file `src/app/api/<nama-fitur>/route.ts`.
2. Terapkan `requireAuth()`, pemeriksaan permission dari `src/lib/permissions.ts`, dan `validateBody()`.
3. Tangani exception dengan `serverErrorResponse()`.

### Langkah 5: Bangun Tampilan Frontend
1. Tentukan portal mana yang memuat fitur (`/dashboard` untuk HR, `/employee` untuk Karyawan, `/ga` untuk General Affairs).
2. Tambahkan rute navigasi baru pada array `navItems` di layout portal terkait (e.g., `src/app/dashboard/layout.tsx`).
3. Buat halaman pada `src/app/<portal>/<fitur>/page.tsx`.
4. Manfaatkan komponen UI yang sudah tersedia:
   - Gunakan `useFormDraft` dan `FormDraftBanner` jika formulir memiliki banyak isian.
   - Gunakan `useUnsavedChanges` jika formulir perlu perlindungan navigasi.
   - Gunakan `DataTablePagination` untuk tabel berpaginasi.
   - Gunakan `AccessibleModal` atau `ConfirmModal` untuk aksi dialog.
   - Gunakan `useToast` untuk notifikasi umpan balik aksi pengguna.
   - Gunakan `Skeleton` saat status pemuatan data berlangsung.

### Langkah 6: Tuliskan Automated Test
1. Buat test file di `tests/api/<fitur>.test.ts` atau `tests/services/<fitur>Service.test.ts`.
2. Gunakan helper `apiTestHelper.ts` (`fetchWithAuth`, `getAuthCookie("hr")`).
3. Jalankan pengujian via `npm run test`.

---

## 13. Important Files Reference

| Kategori | File Path | Alasan Penting |
| :--- | :--- | :--- |
| **Config & Env** | `src/lib/env.ts` | Validasi fail-fast environment variables saat server booting. |
| **Config & Build** | `next.config.ts` | Konfigurasi PWA & headers keamanan. |
| **Routing Security**| `src/proxy.ts` | Edge middleware proteksi akses URL berbasis peran di Next.js 16. |
| **Authentication** | `src/lib/auth.ts` | Sumber kebenaran verifikasi login, JWT session, & invalidasi versi sesi. |
| **Auth Events** | `src/lib/authEvents.ts` | Mekanisme sinkronisasi sesi login/logout antar-tab browser. |
| **Authorization** | `src/lib/permissions.ts` | Definisi konstanta role & permission RBAC seluruh aplikasi. |
| **API Middleware** | `src/lib/middleware/apiGuard.ts` | Guard autentikasi, validasi schema Zod, dan sanitasi input API. |
| **Rate Limiter** | `src/lib/middleware/rateLimit.ts` | In-memory sliding window rate limiter proteksi brute force login. |
| **Client Logging** | `src/lib/clientLogger.ts` & `clientErrors.ts`| Telemetri error client browser yang diteruskan ke Winston logger. |
| **Form Draft Hook** | `src/hooks/useFormDraft.ts` | Auto-save draft form lokal untuk mencegah kehilangan input pengguna. |
| **PII Cryptography**| `src/lib/security/pii.ts` | Enkripsi AES-256-GCM data sensitif dan blind-indexing HMAC-SHA256. |
| **Database Skema** | `prisma/schema.prisma` | Definisi 49 model tabel, relasi, indeks, dan 12 enum basis data. |
| **Layout Shell** | `src/components/layout/AppShell.tsx` | Kerangka layout utama aplikasi (sidebar, mobile nav, theming). |
| **Network Validator**| `src/lib/networkValidator.ts` | Validasi IP Wi-Fi kantor MikroTik (192.168.20.1), subnet, & ekstraksi header proxy. |
| **Photo Watermark**| `src/lib/services/visitPhotoService.ts`| Stamping SVG watermark koordinat & waktu resmi pada foto kunjungan via Sharp. |
| **Employee Service**| `src/lib/services/employeeService.ts` | Layanan direktori karyawan & traversal hierarki bawahan BFS. |
| **Bulk Import** | `src/lib/services/bulk-import/` | Engine validasi & eksekusi impor massal karyawan via Excel. |
| **Payroll Engine** | `src/lib/services/pph21Service.ts` & `bpjsService.ts` | Kalkulator pajak PPh 21 TER dan jaminan sosial BPJS regulasi Indonesia. |
| **Date Presets** | `src/lib/datePresets.ts` | Standarisasi preset rentang tanggal (Hari Ini, Kemarin, Minggu Ini, Bulan Ini) & filter memori. |
| **Test Helper** | `tests/utils/apiTestHelper.ts` | Utilitas autentikasi dan HTTP fetch otomatis untuk testing Vitest. |

---

## 14. Complete Knowledge Summary

- **Project Understanding:** Sistem informasi komprehensif PT Wijaya Inovasi Gemilang (WIG) yang mengintegrasikan absensi kehadiran 3-faktor (Wi-Fi kantor MikroTik, GPS geofencing, & foto selfie bukti), pemantauan kunjungan lapangan ber-watermark, kalkulasi payroll pajak Indonesia, siklus hidup aset GA dengan QR code & BAST, serta layanan mandiri karyawan (ESS).
- **Architecture:** Next.js 16 App Router dengan pemisahan tegas antara Edge Proxy guard (`src/proxy.ts`), Route Handlers (`src/app/api/*`), Service Layer (`src/lib/services/*`), Prisma ORM, dan database MySQL/MariaDB.
- **Database:** 49 tabel ternormalisasi dan 12 enum di `prisma/schema.prisma` (10 migrasi bertahap) yang mencakup kepegawaian, autentikasi RBAC, absensi, slip gaji, aset GA, data pribadi terenkripsi (PII AES-256-GCM), dan log audit trail kekal.
- **Frontend:** React 19 dengan Tailwind CSS, dark mode via `next-themes`, palet warna Maroon korporat (`#800020`), Progressive Web App (PWA) yang dapat diinstall di smartphone, komponen terpadu `AppShell`, auto-save draft (`useFormDraft`), dan perlindungan form kotor (`useUnsavedChanges`).
- **Backend:** Mengutamakan keamanan berlapis: validasi token JWT dengan pengecekan database `sessionVersion`, proteksi brute force rate limiting ganda (IP & akun), sanitasi XSS input, telemetri error client, dan pencatatan audit log otomatis pada setiap mutasi data.
- **Important Rules:** Seluruh kalkulasi tanggal wajib berpatokan pada zona waktu Indonesia Barat (`Asia/Jakarta` / WIB); data identitas sensitif (KTP/Bank/BPJS) wajib terenkripsi; aset inventaris wajib memiliki rekam jejak riwayat mutasi dan BAST; berkas foto kunjungan wajib divalidasi keaslian hash SHA-256 dan distamp watermark sebelum diarsipkan.
- **How To Extend:** Buat model di Prisma jika diperlukan ➔ tambahkan skema validasi Zod di `validationSchemas.ts` ➔ implementasikan logika di `src/lib/services/` ➔ buat route handler di `src/app/api/` dengan `requireAuth` & `validateBody` ➔ bangun halaman di `src/app/<portal>/` menggunakan komponen `AppShell` dan atomik UI yang ada ➔ lengkapi dengan automated test di `tests/`.

---

## 15. Standardized HR UI/UX Filter Architecture (New 2026)

Untuk memastikan pengalaman pengguna HR konsisten, cepat, dan intuitif di seluruh modul portal HR (`/dashboard/*`, tidak mencakup GA):
1. **Quick Date Presets:**
   - Menyediakan tombol pintas 1-klik: `Semua`, `Hari Ini`, `Kemarin`, `Minggu Ini`, `Bulan Ini`, `Bulan Lalu`.
   - Menggunakan kalkulator terpusat di `src/lib/datePresets.ts` (`getToday()`, `getYesterday()`, `getThisWeekRange()`, `getThisMonthRange()`, `getLastMonthRange()`, `isDateInRange()`).
2. **Cascading Dropdowns (Division ➔ Department):**
   - Pemilihan Divisi secara otomatis memfilter opsi Departemen yang relevan.
   - Saat Divisi diubah atau di-reset, filter Departemen otomatis di-reset ke nilai default (`all`/`""`), mencegah anomali data kombinasi divisi-departemen yang tidak valid.
3. **1-Click Reset Filter & Active Filter Counter:**
   - Setiap bilah filter dilengkapi tombol **Reset Filter** (ikon `RotateCcw`) yang membersihkan semua parameter filter secara instan tanpa perlu me-reload browser.
   - Indikator badge `X filter aktif` tampil dinamis memberikan kejelasan visual kepada HR kapan data sedang tersegmentasi.
4. **Zero-Database Risk:**
   - Seluruh filtering beroperasi murni pada *client-side reactive state* (`useMemo`) dan/atau parameter query HTTP `GET` read-only.
   - Tidak ada mutasi, skema, tabel, maupun data production database yang disentuh.


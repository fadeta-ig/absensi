# Codebase Map — Absensi & HRIS WIG

> **Purpose**: Peta repository dan lokasi implementation penting.  
> **Source of Truth**: Struktur file dan direktori aktual repository.  
> **Last Verified**: 2026-09-10  

Dokumen ini menyediakan peta mental komprehensif mengenai struktur repository, batas-batas modul, tanggung jawab layer, dan lokasi file implementasi penting bagi AI agent dan pengembang.

---

## 1. Overview Struktur Direktori

```text
hriswig/
├── prisma/                    # Schema database Prisma & script seeding
├── public/                    # Aset statis browser (icons, manifest, logo, uploads)
├── scripts/                   # Script otomasi dan utilitas deployment
├── src/                       # Kode sumber aplikasi utama
│   ├── app/                   # Next.js 16 App Router (halaman, layout, & API routes)
│   │   ├── (auth)/            # Alur autentikasi dan login
│   │   ├── api/               # Endpoint backend API RESTful
│   │   ├── dashboard/         # Portal manajemen HR & Super Admin
│   │   ├── employee/          # Portal mandiri karyawan (Employee Self-Service)
│   │   ├── ga/                # Portal operasional General Affairs & Aset
│   │   ├── scan/              # Scanner kamera QR/Barcode aset
│   │   ├── layout.tsx         # Root layout aplikasi (HTML shell, ThemeProvider, Toast)
│   │   └── page.tsx           # Entry point halaman depan / redirection
│   ├── components/            # Komponen antarmuka React
│   │   ├── dashboard/         # Komponen spesifik portal HR & GA
│   │   ├── employee-form/     # Form multi-step profil dan data karyawan
│   │   ├── layout/            # Komponen shell (Sidebar, Navbar, MobileNav)
│   │   └── ui/                # UI primitives (Radix UI / Tailwind styled)
│   ├── features/              # Modul fitur khusus yang diisolasi (fitur GA, dsb.)
│   ├── hooks/                 # Custom React hooks (auth, geolocation, network, dsb.)
│   ├── lib/                   # Utilitas backend, middleware guard, keamanan, & services
│   │   ├── constants/         # Nilai konstan aplikasi & sistem
│   │   ├── middleware/        # Helper otentikasi dan handler API guard (`apiGuard.ts`)
│   │   ├── security/          # Enkripsi PII, hashing, timing safe comparison
│   │   ├── services/          # Layer logika bisnis dan domain database
│   │   ├── auth.ts            # Logika JWT session Node runtime & pencabutan sesi
│   │   ├── permissions.ts     # Definisi permission atomik dan role RBAC
│   │   ├── prisma.ts          # Singleton PrismaClient database client
│   │   ├── networkValidator.ts# Validasi IP Citranet dan subnet Wi-Fi kantor
│   │   ├── gpsValidator.ts    # Validasi koordinat dan geofencing Haversine
│   │   └── timezone.ts        # Utilitas normalisasi tanggal & zona waktu WIB
│   ├── proxy.ts               # Next.js 16 Edge Runtime Route Guard
│   └── types/                 # Definisi TypeScript global & deklarasi modul
├── storage/                   # Penyimpanan file lokal (foto kunjungan, BAST)
└── tests/                     # Suite pengujian otomatis Vitest
    ├── api/                   # Integration tests endpoint API
    ├── services/              # Unit tests service logika bisnis
    └── utils/                 # Helper pengujian dan mock data
```

---

## 2. Application Entry Points

### A. Edge Runtime Route Guard
- **File**: `src/proxy.ts`
- **Purpose**: Menjaga seluruh rute halaman sebelum request mencapai React Server Component.
- **Responsibility**: Mengekstrak cookie `session`, memverifikasi tanda tangan JWT via library `jose`, memeriksa kecocokan permission/role rute, dan mengarahkan pengguna yang tidak berhak ke halaman login atau unauthorized.
- **Relationships**: Dipanggil oleh engine Next.js 16 pada setiap request halaman publik/terproteksi.

### B. Root Layout & UI Shell
- **Files**: `src/app/layout.tsx`, `src/app/page.tsx`
- **Purpose**: Membungkus seluruh aplikasi web Next.js.
- **Responsibility**: Mengatur HTML shell, viewport PWA, metadata judul, font, dan context providers (Theme, Auth, Alert).

---

## 3. UI & Application Layers

### A. Portal Manajemen HR (`src/app/dashboard/`)
- **Purpose**: Panel kendali untuk Super Admin dan Admin HR.
- **Responsibility**: Pengelolaan data master pegawai, persetujuan cuti & lembur, monitoring presensi harian, kalkulator penggajian (payroll), penghitungan pajak PPh 21 TER, rekapitulasi iuran BPJS, dan manajemen akun pengguna.
- **Important Files**:
  - `src/app/dashboard/employees/page.tsx`: Katalog dan tabel direktori karyawan.
  - `src/app/dashboard/attendance/page.tsx`: Monitoring absensi harian dan rekap kehadiran.
  - `src/app/dashboard/payroll/page.tsx`: Pemrosesan dan penerbitan slip gaji bulanan.
  - `src/app/dashboard/users/page.tsx`: Manajemen akun login sistem dan role RBAC.

### B. Portal Mandiri Karyawan (`src/app/employee/`)
- **Purpose**: Aplikasi antarmuka responsif (PWA) untuk staf dan karyawan umum.
- **Responsibility**: Presensi harian 3-faktor (Wi-Fi/GPS/Selfie), pengajuan cuti, pengajuan koreksi absensi, pelaporan kunjungan dinas luar (visit), akses slip gaji mandiri, dan monitoring tim subordinat.
- **Important Files**:
  - `src/app/employee/attendance/page.tsx`: Halaman clock-in / clock-out terpadu dengan kamera selfie.
  - `src/app/employee/visits/page.tsx`: Formulir pelaporan kunjungan klien dan unggah foto bukti.
  - `src/app/employee/leaves/page.tsx`: Pengajuan dan riwayat saldo cuti tahunan.
  - `src/app/employee/payslips/page.tsx`: Daftar dan unduh slip gaji terenkripsi.

### C. Portal General Affairs (`src/app/ga/`)
- **Purpose**: Panel operasional tim GA untuk pengelolaan aset korporat.
- **Responsibility**: Registrasi aset baru, pelacakan mutasi penyerahan/pengembalian, pencatatan dokumen BAST, checklist inspeksi fisik, servis vendor, dan tiket perbaikan perangkat.
- **Important Files**:
  - `src/app/ga/assets/page.tsx`: Katalog seluruh aset korporat dengan filter kategori & status.
  - `src/app/ga/tickets/page.tsx`: Manajemen tiket keluhan kerusakan dari karyawan.
  - `src/app/ga/scan/page.tsx`: Scanner kamera web untuk membaca barcode/QR inventaris.

---

## 4. API Layer (`src/app/api/`)

- **Purpose**: Menyediakan RESTful API endpoints untuk portal web, PWA mobile, dan script cron.
- **Responsibility**: Validasi format payload, autentikasi sesi, verifikasi permission RBAC via `apiGuard.ts`, pemanggilan service bisnis, dan pengembalian respons JSON standar.
- **Important Files**:
  - `src/app/api/auth/[...]/route.ts`: Login, logout, me, refresh profil, dan reset password.
  - `src/app/api/attendance/route.ts`: Handler presensi harian (clock-in & clock-out).
  - `src/app/api/visits/route.ts`: Pelaporan dan verifikasi foto kunjungan lapangan.
  - `src/app/api/payslips/route.ts`: Handler penerbitan slip gaji bulanan.
  - `src/app/api/cron/[...]/route.ts`: 5 endpoint terjadwal yang diamankan dengan header `Bearer CRON_SECRET`.

---

## 5. Service & Business Logic Layer (`src/lib/services/`)

- **Purpose**: Mengisolasi aturan bisnis dari HTTP transport layer (Next.js Route Handlers).
- **Responsibility**: Perhitungan rumus domain (overtime PP 35/2021, TER PPh 21, BPJS), manipulasi data di database, pemrosesan citra (Sharp), dan orkestrasi integrasi email/notifikasi.
- **Important Files**:
  - `attendanceService.ts`: Validasi presensi 3-faktor dan persistensi `AttendanceRecord`.
  - `overtimeCalcService.ts` & `overtimeService.ts`: Perhitungan jam lembur dan nominal upah.
  - `pph21Service.ts`: Perhitungan pajak bulanan berbasis tabel TER Kategori A, B, C.
  - `bpjsService.ts`: Perhitungan pemotongan iuran BPJS Kesehatan dan Ketenagakerjaan.
  - `assetService.ts`: Siklus hidup aset, mutasi, inspeksi, dan dokumen BAST.
  - `visitService.ts` & `visitPhotoService.ts`: Audit trail kunjungan dan watermarking citra via Sharp.
  - `emailService.ts`: Pengiriman email transaksional kredensial dan pengingat via SMTP Nodemailer.

---

## 6. Data Layer (`prisma/`)

- **Purpose**: Definisi skema basis data relasional dan koneksi ORM.
- **Responsibility**: Menentukan 47 model entitas, indeks unik, foreign keys, serta penyediaan singleton client database.
- **Important Files**:
  - `prisma/schema.prisma`: Skema canonical untuk MariaDB 10.11 / MySQL.
  - `src/lib/prisma.ts`: Inisialisasi singleton `PrismaClient` dengan manajemen pool koneksi.
  - `prisma/seed.ts` & `prisma/seed-dev.ts`: Script pengisian data master awal (roles, permissions, divisi, departemen, admin).

---

## 7. Shared Libraries & Security (`src/lib/`)

- **Purpose**: Utilitas transversal yang digunakan di seluruh aplikasi.
- **Important Files**:
  - `src/lib/middleware/apiGuard.ts`: Wrapper sentral pengamanan endpoint API dengan penegakan permission atomik.
  - `src/lib/security/pii.ts`: Enkripsi data sensitif (NIK, Rekening) menggunakan AES-256-GCM dan Blind Index HMAC-SHA256.
  - `src/lib/security/timingSafe.ts`: Perbandingan hash tahan timing attack.
  - `src/lib/networkValidator.ts`: Helper pengecekan IP subnet lokal dan IP publik Citranet.
  - `src/lib/gpsValidator.ts`: Formula Haversine penghitung deviasi meter lokasi fisik.
  - `src/lib/timezone.ts`: Utilitas normalisasi tanggal dan waktu ke zona WIB (UTC+7).

---

## 8. Testing Suite (`tests/`)

- **Purpose**: Verifikasi otomatis kebenaran kode dan pencegahan regresi.
- **Responsibility**: Menjalankan pengujian endpoint API dan fungsi service bisnis melalui framework Vitest.
- **Important Files**:
  - `tests/services/`: Unit test service bisnis (overtime, BPJS, PPh 21, timezone).
  - `tests/api/`: Integration test endpoint API yang melakukan HTTP fetch ke server lokal.
  - `tests/utils/apiTestHelper.ts`: Helper autentikasi pengujian dan penyediaan header sesi.

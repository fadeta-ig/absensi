# Architecture — Absensi & HRIS WIG

> **Purpose**: How the system is structured.  
> **Source of Truth**: Repository implementation, `src/`, `next.config.ts`, and runtime components.  
> **Last Verified**: 2026-09-10  

## 1. High-Level Architecture Overview


Aplikasi ini dibangun menggunakan arsitektur monolitik modern berbasis **Next.js 16 (App Router)** dengan TypeScript, berjalan di atas runtime Node.js dan Edge Runtime untuk lapisan filter rute (*route guard*).

Arsitektur sistem dibagi menjadi beberapa layer yang terisolasi dengan baik:

```mermaid
graph TD
    Client[Browser / Mobile PWA] -->|HTTPS Requests| EdgeProxy[Next.js 16 Edge Proxy (src/proxy.ts)]
    
    subgraph Frontend Portals
        EdgeProxy -->|/dashboard/*| HRPortal[HR Admin Dashboard]
        EdgeProxy -->|/ga/*| GAPortal[General Affairs Portal]
        EdgeProxy -->|/employee/*| EmployeePortal[Mobile-First Employee PWA]
        EdgeProxy -->|/| LoginPage[Login Page]
    end

    subgraph Backend API Layer
        Client -->|/api/*| APIGuards[API Middleware Guards (src/lib/middleware/apiGuard.ts)]
        APIGuards -->|requireAuth / RBAC| Controllers[API Route Handlers (src/app/api/*)]
        Controllers -->|Sanitize & Validate| ZodValidators[Zod Schema Validation]
    end

    subgraph Business Logic & Services Layer
        Controllers --> Services[Domain Services Layer (src/lib/services/*)]
        Services --> PIISecurity[PII AES-256-GCM / Blind Index]
        Services --> PhotoEngine[Sharp Visit Photo Watermarker]
        Services --> Mailer[Nodemailer SMTP Gateway]
    end

    subgraph Data Access Layer
        Services --> PrismaClient[Prisma ORM Client (src/lib/prisma.ts)]
        PrismaClient --> Database[(MariaDB 10.11 / MySQL)]
        PhotoEngine --> LocalStorage[(Local Disk Storage: /storage/visit-photos)]
    end
```

---

## 2. Major Components & Responsibilities

### A. Edge Route Guard (`src/proxy.ts`)
- **Runtime**: Next.js 16 Edge Runtime.
- **Tanggung Jawab**:
  - Berjalan sebelum halaman atau route handler dieksekusi.
  - Memverifikasi cookie `session` menggunakan library `jose` (HS256).
  - Melakukan isolasi portal: pengguna non-HR dilarang membuka `/dashboard`, non-GA dilarang membuka `/ga`, dan pengguna tanpa akun karyawan terhubung dilarang membuka `/employee`.
  - Mengarahkan request root `/` ke portal yang sesuai jika sesi pengguna masih aktif.

### B. API Middleware & Guard Layer (`src/lib/middleware/apiGuard.ts`)
- **Tanggung Jawab**:
  - Autentikasi sesi aktif di tingkat API (`requireAuth()`) dengan memeriksa versi sesi di database (`sessionVersion`).
  - Pembersihan input HTML otomatis (`sanitizeObject()`) untuk mencegah serangan Cross-Site Scripting (XSS).
  - Validasi ketat request body menggunakan skema Zod (`validateBody()`).
  - Standardisasi format error (400 Bad Request, 401 Unauthorized, 403 Forbidden, 500 Internal Server Error) dan serialisasi log terpusat via Winston.

### C. Domain Services Layer (`src/lib/services/*`)
- **Tanggung Jawab**:
  - Mengisolasi logika bisnis dari controller route Next.js.
  - Memastikan konsistensi transaksi database saat memproses data penting (misal: bulk employee import, kalkulasi PPh 21 dan slip gaji, alur status kepegawaian).
  - Contoh service spesifik:
    - `attendanceService.ts`: Alur pencatatan jam kerja dan validasi lokasi.
    - `visitPhotoService.ts`: Pembuatan watermark stempel foto dan validasi hash anti-pemalsuan.
    - `employeePrivateService.ts`: Pengelolaan data privat terenkripsi.

### D. Security & Encryption Layer (`src/lib/security/pii.ts`)
- **Tanggung Jawab**:
  - Menyediakan fungsi enkripsi dua arah berbasis `AES-256-GCM` untuk data sensitif karyawan.
  - Menghasilkan blind index HMAC-SHA256 agar database dapat memverifikasi keunikan (misal: NIK atau nomor rekening) tanpa menyimpan plaintext.

### E. Data Access Layer (`src/lib/prisma.ts`)
- **Tanggung Jawab**:
  - Singleton instance `@prisma/client`.
  - Mengelola koneksi pooling ke MariaDB/MySQL.

---

## 3. Core Dependencies & Versions

- **Framework**: `next` 16.1.6 (menggunakan flag `--webpack`), `react` 19.2.3, `react-dom` 19.2.3
- **Database & ORM**: `prisma` 6.19.2, `@prisma/client` 6.19.2, driver `mysql2` 3.17.0
- **Security & Token**: `jose` 6.1.3, `bcryptjs` 3.0.3, `zod` 4.3.6
- **Styling & UI**: `tailwindcss` 3.4.19, `radix-ui` 1.4.3, `lucide-react` 0.563.0
- **Image Processing**: `sharp` 0.35.3
- **Logging**: `winston` 3.19.0
- **PWA & Web Push**: `@ducanh2912/next-pwa` 10.2.9, `web-push` 3.6.7
- **Exports & Documents**: `exceljs` 4.4.0, `jspdf` 4.1.0, `jspdf-autotable` 5.0.7
- **Testing**: `vitest` 4.1.4, `@vitest/coverage-v8` 4.1.4

---

## 4. Important Data Flows

### Alur Presensi Karyawan (Attendance Flow)
1. Karyawan membuka `/employee/attendance` pada browser/PWA.
2. Browser meminta izin lokasi GPS dan akses kamera depan.
3. Klien mengambil koordinat GPS dan foto selfie yang dikompresi.
4. Klien mengirimkan payload ke `POST /api/attendance`.
5. Server mengekstrak IP klien dari `x-forwarded-for` / `x-real-ip`.
6. Server memverifikasi apakah IP berada dalam subnet Wi-Fi kantor WIG atau apakah pegawai memiliki izin `bypassLocation`.
7. Server memverifikasi koordinat GPS terhadap tabel `Location` yang ditugaskan ke pegawai.
8. Server mencatat `AttendanceRecord` ke database MariaDB dan mencatat log aktivitas via Winston.

### Alur Pelaporan Kunjungan Klien (Field Visit Flow)
1. Pegawai melakukan clock-in kunjungan di `/employee/visits`.
2. Pegawai mengambil foto dokumentasi di lokasi klien.
3. Server memproses foto melalui `visitPhotoService.ts`:
   - Menghitung digest `sha256Original` dari gambar mentah.
   - Menghitung jarak GPS perangkat terhadap titik koordinat target klien.
   - Menggunakan `sharp` untuk menyematkan stempel visual (watermark) berisi waktu resmi, koordinat, dan status deviasi jarak.
   - Menyimpan file gambar asli dan hasil stempel ke direktori disk `/storage/visit-photos/`.
   - Menyimpan entitas `VisitPhoto` di MariaDB dengan referensi ke path file dan metadata audit.

---

## 5. Architectural Boundaries

- **Edge vs Node Runtime**: `src/proxy.ts` berjalan di Edge Runtime. File ini *tidak boleh* mengimpor module bawaan Node seperti `crypto`, `fs`, atau `@/lib/prisma`. Tipe data sesi diduplikasi secara lokal untuk menjamin kompatibilitas Edge.
- **Client vs Server Components**: Halaman interaktif yang menggunakan state atau peta Leaflet ditandai dengan `"use client"`. Komponen pemanggil data server memuat data secara langsung atau via API routes terproteksi.
- **PWA Service Worker Boundary**: Service worker utama digenerate oleh `@ducanh2912/next-pwa` ke direktori `public/sw.js` dengan menyertakan custom script dari `worker/index.js`.

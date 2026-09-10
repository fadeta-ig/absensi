# Workflows & Operational Commands — Absensi & HRIS WIG

> **Purpose**: Development, build, test, and deployment procedures.  
> **Source of Truth**: `package.json` scripts, dev environment, and testing tools.  
> **Last Verified**: 2026-09-10  

Dokumen ini memuat panduan langkah demi langkah untuk instalasi, pengembangan lokal, sinkronisasi basis data, testing, build, dan deployment.


---

## 1. Local Development Setup

### Prasyarat Sistem
- **Node.js**: v20.x atau lebih tinggi
- **Database**: MariaDB 10.11+ atau MySQL 8.0+ (dapat menggunakan instalasi lokal, Docker container, atau stack lingkungan seperti Laragon)
- **Package Manager**: `npm`


### Langkah Instalasi Awal
1. **Clone repository dan install dependensi**:
   ```bash
   git clone https://github.com/fadeta-ig/absensi.git
   cd absensi
   npm install
   ```

2. **Konfigurasi Environment**:
   Salin `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   Pastikan minimal mengisi:
   - `DATABASE_URL`: URI koneksi basis data (contoh: `mysql://root@localhost:3306/hris_local`).
   - `JWT_SECRET`: String acak minimal 16 karakter (disarankan 32+ karakter).

3. **Inisialisasi & Sinkronisasi Skema Basis Data**:
   ```bash
   npm run db:push
   ```

4. **Seeding Data Awal (Master Data & Akun Admin)**:
   ```bash
   npm run db:seed
   ```
   *Catatan: Script ini akan menghasilkan akun admin sistem `WIG001` (Super Admin HR) dan `WIG002` (GA Admin) serta mencetak kata sandi acak sementara di konsol.*

   Untuk environment pengujian lokal/development yang menyertakan data karyawan dummy:
   ```bash
   npm run db:seed:dev
   ```

5. **Menjalankan Server Pengembangan**:
   ```bash
   npm run dev
   ```
   Aplikasi akan berjalan di `http://localhost:3000`.

---

## 2. Important NPM Commands Reference

Berikut daftar perintah yang terkonfigurasi pada `package.json`:

| Perintah | Deskripsi |
|---|---|
| `npm run dev` | Menjalankan server pengembangan Next.js dengan Webpack (`next dev --webpack`) |
| `npm run dev:host` | Menjalankan server dev dengan binding ke `0.0.0.0` agar dapat diakses dari smartphone dalam satu LAN |
| `npm run build` | Melakukan kompilasi bundle produksi Next.js dengan Webpack |
| `npm run start` | Menjalankan server produksi lokal di port 3000 |
| `npm run start:host` | Menjalankan server produksi terikat ke `0.0.0.0` pada port 3000 |
| `npm run lint` | Menjalankan pemeriksaan ESLint 9 |
| `npm run db:push` | Mendorong perubahan skema `prisma/schema.prisma` langsung ke MariaDB |
| `npm run db:seed` | Menjalankan script seed utama `prisma/seed.ts` (master data + akun admin) |
| `npm run db:seed:dev` | Menjalankan seed dev dengan dataset karyawan (`prisma/seedDev.ts`) |
| `npm run db:seed:hr` | Menjalankan seed khusus master data HR (`prisma/seedHR.ts`) |
| `npm run db:seed:ga` | Menjalankan seed khusus master data GA & aset (`prisma/seedGA.ts`) |
| `npm run db:seed:employee`| Menjalankan seed khusus profil karyawan (`prisma/seedEmployee.ts`) |
| `npm run db:seed:assets` | Menjalankan seed khusus aset fisik (`prisma/seedAssets.ts`) |
| `npm run db:reset` | Mereset paksa database dan mengeksekusi seed utama (`prisma db push --force-reset && npm run db:seed`) |
| `npm run db:reset:only` | Hanya mereset tabel database tanpa menjalankan seed |
| `npm run db:reset:dev` | Mereset paksa database dan mengeksekusi seed dev (`prisma db push --force-reset && npm run db:seed:dev`) |
| `npm run db:studio` | Membuka antarmuka grafis Prisma Studio pada browser |
| `npm test` | Menjalankan test suite menggunakan Vitest |
| `npm run test:coverage` | Menjalankan test suite dengan laporan coverage kode |

---

## 3. Testing Workflows

1. **Menjalankan Seluruh Test Suite**:
   ```bash
   npm test -- --run
   ```
2. **Menjalankan Test Khusus Service / Unit (Tanpa Kebutuhan Server HTTP)**:
   ```bash
   npx vitest run tests/services/
   ```
3. **Menjalankan Test API Endpoint (`tests/api/`)**:
   > [!IMPORTANT]
   > Test suite di `tests/api/*.test.ts` melakukan panggilan HTTP `fetch` ke `http://localhost:3000/api`. Pastikan server Next.js aktif pada terminal terpisah (`npm run dev` atau `npm start`) sebelum mengeksekusi test API.

---

## 4. Production Build & Deployment Workflow

1. **Pemeriksaan Linting & Type-Check**:
   ```bash
   npm run lint
   npx tsc --noEmit
   ```
2. **Build Bundle Produksi**:
   ```bash
   npm run build
   ```
   Proses ini akan mengompilasi rute Next.js, mengoptimasi aset, dan men-generate berkas PWA (`public/sw.js`).

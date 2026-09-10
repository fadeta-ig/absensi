# Testing Strategy & Configuration — Absensi & HRIS WIG

> **Purpose**: Testing strategy and procedures.  
> **Source of Truth**: `vitest.config.ts` and test suites in `tests/`.  
> **Last Verified**: 2026-09-10  

Dokumen ini memuat arsitektur pengujian, framework, struktur folder, perintah eksekusi, dan konvensi pengujian pada codebase ini.


---

## 1. Test Framework & Configuration

- **Framework**: **Vitest 4.1.4**
- **Coverage Engine**: `@vitest/coverage-v8`
- **Konfigurasi (`vitest.config.ts`)**:
  ```typescript
  import { defineConfig } from "vitest/config";
  import path from "path";

  export default defineConfig({
      test: {
          globals: true,
          environment: "node",
          hookTimeout: 30_000,
          testTimeout: 30_000,
      },
      resolve: {
          alias: {
              "@": path.resolve(__dirname, "./src"),
          },
      },
  });
  ```

---

## 2. Test Suite Structure

Pengujian dikelompokkan ke dalam direktori `tests/`:

```
tests/
├── api/                      # Integration test endpoint HTTP (membutuhkan server berjalan di port 3000)
│   ├── assets.test.ts        # Endpoint aset GA
│   ├── attendance.test.ts    # Endpoint presensi
│   ├── auth.test.ts          # Endpoint login, logout, verifikasi sesi
│   ├── birthdaysDirect.test.ts # Endpoint modul ulang tahun
│   ├── master.test.ts        # Endpoint master data (divisi, departemen, jabatan)
│   └── users.test.ts         # Endpoint manajemen pengguna & RBAC
├── services/                 # Unit & integration test service layer (berjalan langsung di Node)
│   ├── birthdayService.test.ts
│   ├── bpjsService.test.ts
│   ├── bulkImport.integration.test.ts
│   ├── bulkImportParser.test.ts
│   ├── bulkImportValidator.test.ts
│   ├── employeeMasterV2.integration.test.ts
│   ├── employeeStatus.integration.test.ts
│   ├── employeeStatusService.test.ts
│   ├── holidayService.test.ts
│   ├── leaveService.test.ts
│   ├── pii.test.ts
│   ├── userManagement.integration.test.ts
│   └── visitPhotoService.test.ts
└── utils/                    # Helper dan pengujian utilitas
    ├── apiTestHelper.ts      # Helper login dan ekstraksi cookie untuk test API
    ├── datePresets.test.ts   # Pengujian helper tanggal dan filter
    └── networkValidator.test.ts # Pengujian subnet IP Wi-Fi kantor
```

---

## 3. Test Execution Commands

| Target Pengujian | Perintah | Catatan |
|---|---|---|
| **Semua Test (One-shot)** | `npm test -- --run` | Menjalankan seluruh test suite dan keluar |
| **Service Layer Saja** | `npx vitest run tests/services/` | Menguji logika bisnis langsung tanpa butuh server aktif |
| **Utilitas Saja** | `npx vitest run tests/utils/` | Menguji modul utilitas (pii, tanggal, ip validator) |
| **API Endpoints Saja** | `npx vitest run tests/api/` | **Wajib**: Jalankan server `npm run dev` di terminal lain terlebih dahulu |
| **Watch Mode (Dev)** | `npm test` | Menjalankan Vitest dalam mode interaktif watch |
| **Laporan Coverage** | `npm run test:coverage` | Menghasilkan laporan coverage berbasis v8 |

---

## 4. Testing Conventions

1. **Gunakan Alias `@/`**: Selalu gunakan alias path root `@/` untuk mengimpor modul aplikasi (contoh: `import { prisma } from "@/lib/prisma";`).
2. **Timeout Toleransi Tinggi**: Pengujian basis data atau enkripsi diatur dengan batas waktu `30_000` ms (30 detik).
3. **Database State dalam Integration Tests**: Integration test di `tests/services/` berinteraksi dengan database nyata (`DATABASE_URL`). Pastikan tidak menghapus data esensial produksi saat menjalankan pengujian. Gunakan transaksi atau rollback jika memungkinkan.

---

## 5. Known Coverage Gaps & Limitations

- **Ketergantungan Port 3000**: Test suite di `tests/api/` tidak menggunakan mock HTTP handler internal (seperti Supertest atau Next.js test runner in-process), melainkan `fetch` nyata ke port 3000. Akibatnya, test ini tidak dapat berjalan di CI/CD yang terisolasi tanpa langkah `npm start &` terlebih dahulu.
- **Frontend Component Tests**: Belum ada framework pengujian komponen React berbasis DOM (seperti React Testing Library / Playwright / Cypress) yang terpasang di repositori. Seluruh pengujian saat ini fokus pada backend (API, Services, dan Security Utils).

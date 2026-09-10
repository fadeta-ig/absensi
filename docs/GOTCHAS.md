# Gotchas & Pitfalls — Absensi & HRIS WIG

> **Purpose**: Things that are easy to get wrong or surprising.  
> **Source of Truth**: Verified technical gotchas, Edge runtime peculiarities, and historical migration artifacts.  
> **Last Verified**: 2026-09-10  

Dokumen ini mencatat perilaku tidak terduga, kesalahan umum, area rentan (*fragile areas*), dan hal-hal yang wajib dihindari oleh developer maupun AI agent saat memodifikasi codebase ini.


---

## 1. Next.js 16 Proxy Route Guard (`src/proxy.ts` vs `middleware.ts`)

- **Gotcha**: Di Next.js 16, route guard sistem ini didefinisikan di `src/proxy.ts` yang mengekspor fungsi `proxy(request: NextRequest)`. Jangan mengubah nama file ini menjadi `middleware.ts` atau memindahkan fungsinya ke file middleware biasa, karena routing guard akan berhenti berfungsi.
- **Edge Runtime Pitfall**: `src/proxy.ts` berjalan di Edge Runtime. Mengimpor pustaka Node.js murni (seperti `crypto`, `fs`, `bcryptjs`, atau `@/lib/prisma`) di dalam `proxy.ts` akan menyebabkan error kompilasi fatal di build Next.js.

---

## 2. Face Recognition Legacy Artifacts

- **Gotcha**: Fitur pengenalan wajah (*face recognition*) telah resmi dihapus dari alur presensi pada komit `65d125e` dan digantikan oleh validasi 3-faktor (Wi-Fi + GPS + Selfie).
- **Pitfall**:
  - Kolom `faceDescriptor` masih ada di tabel `employees` di `prisma/schema.prisma`.
  - Variabel `NEXT_PUBLIC_FACE_THRESHOLD` masih tercantum di `.env.example`.
- **Perhatian untuk AI Agent**: Jangan mencoba membangun kembali atau menambahkan pemanggilan model deteksi wajah client-side tanpa instruksi eksplisit dari user.

---

## 3. Database Push vs Migrations (`_prisma_migrations`)

- **Gotcha**: Codebase menggunakan workflow `prisma db push` (`npm run db:push`). Tabel internal `_prisma_migrations` tidak ada pada database lokal saat ini (`ERROR 1146`).
- **Pitfall**:
  - Menjalankan `prisma migrate deploy` di environment yang menggunakan `db:push` dapat memicu konflik atau kegagalan migrasi karena Prisma mengira database masih kosong dari migrasi.
  - Jangan menghapus folder `prisma/migrations/` karena folder tersebut memuat rekam jejak evolusi skema sebelumnya.

---

## 4. Prasyarat Pengujian API (`tests/api/`)

- **Gotcha**: Menjalankan `npm test` saat server lokal offline akan menyebabkan 5 suite test di `tests/api/*.test.ts` gagal dengan error `ECONNREFUSED ::1:3000`.
- **Alasan**: File `tests/utils/apiTestHelper.ts` melakukan panggilan `fetch()` ke `http://localhost:3000/api`.
- **Solusi**: Jika ingin menjalankan seluruh test suite termasuk API, pastikan server dev `npm run dev` sudah aktif di port 3000 terlebih dahulu. Untuk unit test backend tanpa server, jalankan `npx vitest run tests/services/`.

---

## 5. Password Random Seeding vs Test Helper Hardcoded Password

- **Gotcha**: Script `prisma/seed.ts` menghasilkan kata sandi acak `randomBytes(12).toString("base64url")` untuk akun `WIG001` dan `WIG002`.
- **Pitfall**: File pengujian `tests/utils/apiTestHelper.ts` mengasumsikan kata sandi pengujian dev tetap. Jika database di-reset dengan `npm run db:reset`, test API akan gagal login (401) kecuali akun diisi menggunakan `npm run db:seed:dev` yang menyediakan kredensial pengujian deterministik.

---

## 6. Parsing Tanggal & Serialisasi Prisma DateTime

- **Gotcha**: Pada versi awal sistem, kolom tanggal (`date`, `clockIn`, `clockOut`) disimpan sebagai string. Setelah migrasi, kolom tersebut diubah menjadi `DateTime` di Prisma.
- **Pitfall**: Query pencarian kehadiran satu hari harus menggunakan range jam (`dayRange(dateString)` di `attendanceService.ts`), bukan perbandingan string langsung `where: { date: "2026-09-10" }` karena pergeseran zona waktu UTC/WIB.
- Selalu gunakan helper dari `@/lib/timezone` (`toWIBDateString`, `getWIBHoursMinutes`) untuk memanipulasi tanggal presensi.

---

## 7. Pencarian Data PII yang Terenkripsi

- **Gotcha**: Kolom identitas `nationalId` (NIK), `familyCardNumber` (No KK), `bpjsEmploymentNumber`, `bpjsHealthNumber`, dan `accountNumber` dienkripsi dengan format `enc:v1:...`.
- **Pitfall**:
  - Menjalankan query SQL atau Prisma `where: { nationalId: { contains: "123" } }` akan gagal karena ciphertext selalu berbeda (menggunakan IV acak 12-byte).
  - Untuk pencarian eksak, *wajib* menggunakan kolom hash yang sesuai: `where: { nationalIdHash: hashPii(input) }`.

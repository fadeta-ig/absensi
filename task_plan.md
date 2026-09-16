# Task Plan: Perbaikan Masalah Preview PDF & 404 pada `/uploads/news/...`

## Goal
Menyelesaikan dua kendala pada pratinjau dan akses berkas PDF:
1. Menghilangkan pesan `localhost refused to connect` pada iframe dengan mengonfigurasi `X-Frame-Options: SAMEORIGIN` di `next.config.ts`.
2. Menghilangkan 404 pada URL `/uploads/news/...` dengan membuat dynamic Route Handler `src/app/uploads/[...path]/route.ts` yang menyajikan file uploads langsung dari disk dengan MIME type dan header `inline` yang tepat.

## Current Phase
Complete (Diagnosed, Fixed, Verified, and Documented)

## Constraints & Principles
1. **Security**:
   - `X-Frame-Options: SAMEORIGIN` tetap memblokir embedding dari situs luar (anti-clickjacking).
   - Sanitasi path pada route handler `uploads/[...path]` untuk mencegah serangan path traversal (`..`).
2. **Zero Schema Modification**:
   - Skema database `prisma/schema.prisma` tetap utuh 100%.
3. **No Unprompted Git**:
   - Dilarang menjalankan git commit/push tanpa perintah eksplisit dari pengguna.

---

## Planned Phases

### Phase 1 — Root Cause Analysis & Planning
- [x] Temukan penyebab iframe error `localhost refused to connect`: header `X-Frame-Options: DENY` di `next.config.ts`.
- [x] Temukan penyebab 404: Next.js dev server tidak auto-index file runtime di `public/` tanpa route handler.
- [x] Tuliskan laporan analisis detail di `findings.md`.
- **Status:** complete

### Phase 2 — Implementation of Fixes
- [x] Ubah `X-Frame-Options: DENY` menjadi `X-Frame-Options: SAMEORIGIN` di `next.config.ts`.
- [x] Buat Route Handler `src/app/uploads/[...path]/route.ts` yang aman (dengan pencegahan directory traversal) untuk melayani berkas `/uploads/*` secara dinamis dengan MIME type yang tepat (`application/pdf`, `image/*`, dsb.).
- **Status:** complete

### Phase 3 — Verification & Diagnostics
- [x] Jalankan ESLint dan `npx tsc --noEmit` (0 error).
- [x] Jalankan Vitest test suite (52 passed).
- [x] Uji pengambilan file `2349b742-f9bf-411c-8ac6-d53b3a64d9cf.pdf` via script (Status 200, Content-Type application/pdf, X-Frame-Options SAMEORIGIN).
- [x] Uji proteksi path traversal (Status 403).
- **Status:** complete

### Phase 4 — Delivery & Explanation to User
- [x] Jelaskan mengapa di lokal pengguna terjadi `localhost refused to connect` dan 404.
- [x] Berikan petunjuk verifikasi di browser pengguna.
- **Status:** complete

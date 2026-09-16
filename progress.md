# Progress: Perbaikan Masalah Preview PDF & 404 pada `/uploads/news/...`

## Current Status
Investigasi akar masalah, perbaikan konfigurasi header, dan penambahan dynamic file serving route handler telah selesai 100% dan terverifikasi bersih.
Tidak ada git commit/push yang dilakukan (sesuai SOP).

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Complete & Verified (Ready to report) |
| Where am I going? | Deliver detailed diagnostic explanation to user |
| What's the goal? | Fix PDF preview "refused to connect" and "404" errors in local environment |
| What have I learned? | `X-Frame-Options: DENY` blocks same-origin iframes; Next.js dev server does not auto-index runtime-uploaded files without a dynamic `/uploads/[...path]` route handler |
| What have I done? | Changed `X-Frame-Options` to `SAMEORIGIN` in `next.config.ts`, created secure `src/app/uploads/[...path]/route.ts` with directory traversal protection, verified 200 response & headers |

## Verified Fixes
- `next.config.ts`: `X-Frame-Options: SAMEORIGIN` (mengizinkan iframe internal aplikasi sendiri, tetap memblokir embedding situs luar).
- `src/app/uploads/[...path]/route.ts`: Menyajikan berkas `/uploads/*` secara dinamis dengan header `Content-Type`, `Content-Disposition: inline`, dan `X-Frame-Options: SAMEORIGIN`.
- Uji baca `2349b742-f9bf-411c-8ac6-d53b3a64d9cf.pdf`: HTTP Status 200, 578.970 bytes, MIME `application/pdf`.
- Uji pencegahan traversal: HTTP Status 403 Forbidden.
- ESLint: 0 errors, TypeScript: 0 errors, Vitest: 52 passed.

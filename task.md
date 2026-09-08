# Task Checklist: Migrasi Absensi Wi-Fi Kantor + GPS + Selfie (Pembersihan Total Face Recognition)

## Tahap 1: Backend & Network Validation
- [x] Buat library `src/lib/networkValidator.ts` untuk validasi IP Wi-Fi kantor (`192.168.20.1`, subnet `192.168.20.0/24`, dan IP publik `202.152.141.27`).
- [x] Buat route `GET /api/attendance/network` untuk deteksi status IP Wi-Fi kantor secara real-time.
- [x] Perbarui `src/app/api/attendance/route.ts`:
  - [x] Tambahkan ekstraksi header `x-forwarded-for` dan `x-real-ip`.
  - [x] Validasi IP pengirim terhadap whitelist jaringan kantor WIG.
  - [x] Izinkan bypass jaringan jika karyawan memiliki hak `bypassLocation = true`.
  - [x] Hapus komentar lama dan ketergantungan model biometrik.
- [x] Hapus API route pendaftaran biometrik `src/app/api/auth/face/route.ts`.
- [x] Bersihkan `src/lib/validations/validationSchemas.ts` dari `faceDescriptorSchema` dan sesuaikan pesan foto absensi.

## Tahap 2: Frontend & UI Refresh (Portal Karyawan)
- [x] Perbarui antarmuka `src/app/employee/attendance/page.tsx`:
  - [x] Hapus pemanggilan `face-api.js`, loop pemindaian CPU, dan timeout biometrik.
  - [x] Tambahkan panel indikator status real-time (Wi-Fi Kantor `192.168.20.1` + GPS Geofencing radius kantor).
  - [x] Pasang kamera selfie HTML5 ringan dengan tombol jepret cepat & preview foto.
  - [x] Pasang proteksi tombol: hanya aktif jika Wi-Fi & GPS kantor valid (atau bypass).
- [x] Perbarui `src/app/employee/settings/page.tsx`:
  - [x] Hapus pemanggilan `<FaceRegistrationCard />`.
- [x] Hapus file komponen `src/app/employee/settings/components/FaceRegistrationCard.tsx`.

## Tahap 3: Pembersihan Total (Zero Dead Code & Asset Purge)
- [x] Hapus library wrapper `src/lib/faceRecognition.ts`.
- [x] Hapus file test `src/lib/__tests__/faceRecognition.test.ts`.
- [x] Hapus file bobot model machine learning di folder `public/models/` (menghemat ~12MB aset publik).
- [x] Bersihkan konfigurasi webpack fallbacks & externals `face-api.js` di `next.config.ts`.
- [x] Hapus dependensi `face-api.js` dari `package.json`.
- [x] Bersihkan `.env` lokal dari parameter `NEXT_PUBLIC_FACE_THRESHOLD`.

## Tahap 4: Testing & Verifikasi
- [x] Buat automated unit tests di `tests/utils/networkValidator.test.ts` (7/7 tests passing).
- [x] Perbarui automated tests di `tests/api/attendance.test.ts` untuk endpoint `/api/attendance/network`.
- [x] Jalankan automated test suite `npm run test` (seluruh service test lulus 100%).
- [x] Jalankan TypeScript compiler check `npx tsc --noEmit` (0 error).
- [x] Jalankan production build `npm run build` (113 routes terkompilasi 100% sukses).
- [x] Verifikasi database via VPS audit: 58 data karyawan (53 aktif) dan 51 rekam absensi tetap utuh 100%.

## Tahap 5: Dokumentasi
- [x] Perbarui `knowledge.md` mencakup arsitektur absensi 3-faktor dan menghapus dokumentasi `face-api.js`.
- [x] Siapkan panduan langkah deploy aman ke server VPS tanpa downtime dan tanpa resiko data hilang.

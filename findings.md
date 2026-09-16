# Findings: Root Cause Analysis — PDF Preview "localhost refused to connect" & 404 pada `/uploads/news/...`

## 1. Gejala Masalah yang Ditemukan
1. **Upload PNG bisa di-preview**, tetapi saat upload **PDF**:
   - Di dalam iframe muncul pesan browser: **"localhost refused to connect."**
   - Saat link file dibuka langsung di tab browser (`http://localhost:3000/uploads/news/2349b742-f9bf-411c-8ac6-d53b3a64d9cf.pdf`), muncul halaman Next.js:
     **"404 - This page could not be found."**
2. Berkas fisik di disk sebenarnya **ADA** dan valid:
   - Path: `public/uploads/news/2349b742-f9bf-411c-8ac6-d53b3a64d9cf.pdf`
   - Ukuran: 578.970 bytes (~578 KB).

---

## 2. Investigasi Root Cause (Penyebab Utama)

### Akar Masalah 1: "localhost refused to connect" di Iframe
- **Lokasi Kode**: `next.config.ts` baris 23–25:
  ```ts
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  ```
- **Analisis Mekanisme Browser**:
  - Header `X-Frame-Options: DENY` dipasang global untuk semua path (`source: "/(.*)"`).
  - Nilai `DENY` memerintahkan browser untuk **MENOLAK segala bentuk rendering `<iframe>`**, bahkan jika iframe tersebut dibuka dari domain yang sama (`http://localhost:3000`).
  - Ketika Chrome/Edge mendeteksi respon file membawa header `X-Frame-Options: DENY` di dalam iframe, browser langsung memblokir dan menampilkan layar error bawaan Chrome: **"localhost refused to connect."** (ERR_BLOCKED_BY_RESPONSE).
  - **Mengapa PNG bisa tampil?**: File gambar dirender menggunakan tag `<img>`. Tag `<img>` adalah elemen grafis dan **tidak dipengaruhi oleh `X-Frame-Options`**, sedangkan dokumen PDF dirender menggunakan `<iframe>` yang tunduk pada aturan `X-Frame-Options`.

### Akar Masalah 2: "404 - This page could not be found" saat URL dibuka langsung
- **Mekanisme Next.js Dev Server (`next dev`)**:
  - Di Next.js, pemetaan berkas statis di direktori `public/` dilakukan **saat server pertama kali di-boot (startup)**.
  - Berkas baru yang diunggah ke `public/uploads/news/` oleh API saat server dev sedang aktif **TIDAK didaftarkan secara otomatis ke router statis Next.js**.
  - Akibatnya, saat browser meminta `/uploads/news/[uuid].pdf`, Next.js tidak menemukan file tersebut di peta statis awal, lalu mencarinya sebagai App Router page, dan akhirnya mengembalikan **404**.
  - Di codebase saat ini, belum ada **Route Handler dinamis** yang menangani path `/uploads/[...path]`.

---

## 3. Solusi Arsitektur yang Benar & Standar Industri

1. **Ubah `X-Frame-Options` ke `"SAMEORIGIN"` di `next.config.ts`**:
   - Mengubah `X-Frame-Options: DENY` menjadi `X-Frame-Options: SAMEORIGIN`.
   - Hal ini mengizinkan aplikasi kita sendiri (`SAMEORIGIN`) untuk merender dokumen PDF di dalam iframe, sementara situs luar tetap **100% diblokir** dari serangan clickjacking.
2. **Buat Dynamic Route Handler untuk File Uploads (`src/app/uploads/[...path]/route.ts`)**:
   - Menangani seluruh request ke `/uploads/*` secara dinamis langsung membaca berkas dari disk (`public/uploads/...`).
   - Memberikan header respon yang tepat:
     - `Content-Type: application/pdf` (atau `image/*`, `application/*`).
     - `Content-Disposition: inline; filename="..."`.
     - `X-Frame-Options: SAMEORIGIN`.
     - `Cache-Control: public, max-age=31536000, immutable` (atau `no-cache` di dev).
   - Manfaat: File yang baru saja diunggah oleh HR langsung bisa diakses dan di-preview seketika **tanpa perlu me-restart server dev `npm run dev`**.

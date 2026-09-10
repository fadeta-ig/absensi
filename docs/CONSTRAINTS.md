# Technical & Business Constraints — Absensi & HRIS WIG

> **Purpose**: What must or must not be done.  
> **Source of Truth**: Framework constraints, Edge runtime, security policies, and business rules.  
> **Last Verified**: 2026-09-10  

Dokumen ini mendefinisikan batasan teknis, aturan bisnis, batas kompatibilitas, keamanan, dan deployment yang terbukti aktif dalam codebase ini.


---

## 1. Technical Constraints

- **Edge Runtime Isolation (`src/proxy.ts`)**:
  - Route guard berjalan pada Edge Runtime. Dilarang mengimpor modul bawaan Node.js seperti `crypto`, `fs`, `path`, `os`, atau client `@/lib/prisma`.
  - Pustaka kriptografi yang diperbolehkan di Edge hanya yang berbasis Web Crypto API standar (seperti `jose`).
- **Next.js Webpack Bundler Mandate**:
  - Script build dan dev harus menggunakan flag `--webpack` (`next dev --webpack`, `next build --webpack`).
  - Pemaksaan Webpack disebabkan modul `@ducanh2912/next-pwa` dan dependensi native backend seperti `sharp` tidak sepenuhnya kompatibel dengan Turbopack pada Next.js 16.
- **Penyimpanan Berkas di Disk Lokal**:
  - Berkas foto kunjungan disimpan secara lokal di filesystem server (`storage/visit-photos/`), dan file unggahan umum di `public/uploads/`.
  - Sistem saat ini belum menggunakan object storage cloud (seperti S3 atau GCS), sehingga arsitektur scaling horizontal multi-instance memerlukan shared NFS atau modifikasi storage driver.
- **Batasan Ukuran Berkas**:
  - Dokumen BAST disimpan langsung ke database dalam bentuk `MediumBlob` (maksimal 16MB per file).
  - Berkas log Winston dirotasi pada batas 5MB (`logs/error.log`) dan 10MB (`logs/combined.log`) dengan retensi maksimal 5 berkas.

---

## 2. Business & Domain Constraints

- **Aturan Presensi 3-Faktor**:
  - Karyawan tidak dapat melakukan clock-in jika tidak terhubung ke subnet Wi-Fi kantor WIG atau jika perangkat berada di luar radius lokasi GPS kantor yang ditugaskan, *kecuali* profil pegawai memiliki atribut `bypassLocation: true`.
- **Koreksi Kehadiran Bertingkat**:
  - Karyawan tidak dapat mengubah catatan kehadiran secara sepihak. Koreksi kehadiran berstatus `PENDING` dan hanya dapat disetujui (`APPROVED`) oleh atasan langsung (`assignedManagerId`) atau Admin HR.
- **Indonesian Labor Regulations**:
  - Perhitungan lembur wajib mengacu pada formula Kepmenak / PP No. 35 Tahun 2021.
  - Perhitungan pajak penghasilan wajib mematuhi skema Tarif Efektif Rata-rata (TER) PPh 21 tahun 2024 dan penggolongan status PTKP.
  - Pemotongan BPJS Kesehatan dibatasi plafon upah tertinggi sesuai peraturan perundang-undangan.

---

## 3. Compatibility Constraints

- **Versi Node.js & TypeScript**:
  - Memerlukan Node.js LTS (v20+) dan TypeScript 5+.
- **Database Engine**:
  - Memerlukan MariaDB versi 10.5+ atau MySQL versi 8.0+ yang mendukung tipe data `JSON`, `MediumBlob`, dan `FULLTEXT` index pada tabel `assets`.
- **PWA Mobile Browser Support**:
  - Fitur kamera dan geolokasi mengharuskan protokol aman HTTPS pada environment produksi (atau `localhost` pada development).
  - Fitur Web Push Notifications bergantung pada dukungan browser terhadap Service Worker dan Push API (iOS Safari 16.4+ / Android Chrome).

---

## 4. Security Constraints

- **Kerahasiaan Kunci JWT & PII**:
  - `JWT_SECRET` wajib memiliki panjang minimal 16 karakter (sangat disarankan 32+ karakter acak). Jika tidak ada atau kurang dari 16 karakter, aplikasi akan melempar error saat booting dan menolak semua sesi.
- **Revokasi Sesi Seketika**:
  - Setiap perubahan kredensial atau penonaktifan user akan menaikkan `sessionVersion` di database. Sesi aktif pengguna akan langsung tidak valid pada request berikutnya tanpa menunggu masa kedaluwarsa JWT berakhir.
- **Sanitasi Tag HTML (Anti-XSS)**:
  - Seluruh payload request yang dikirim melalui `validateBody()` wajib dibersihkan dari tag HTML menggunakan `sanitizeObject()`.
- **Proteksi Cron Endpoint**:
  - Endpoint di `/api/cron/*` tidak boleh dapat diakses publik tanpa header `Authorization: Bearer <CRON_SECRET>` atau sesi aktif dengan izin `hr.manage`.

---

## 5. Deployment Constraints

- **Proses Tunggal Node.js**:
  - Aplikasi dirancang untuk dijalankan melalui Node process (`npm run start` atau `npm run start:host -p 3000`).
  - Tidak ada konfigurasi containerisasi Docker (`Dockerfile` / `docker-compose.yml`) di dalam repositori.
- **Sinkronisasi Skema Basis Data**:
  - Skema saat ini disinkronkan melalui `prisma db push`. Jika di-deploy ke production dengan migrasi formal, harus diperhatikan bahwa tabel `_prisma_migrations` belum terinisialisasi pada database lokal saat ini.

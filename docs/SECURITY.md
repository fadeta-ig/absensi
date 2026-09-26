# Security Architecture & Rules — Presensi & HRIS WIG

> **Purpose**: Security architecture and rules.  
> **Source of Truth**: Authentication, authorization, PII encryption, and security middleware in `src/lib/`.  
> **Last Verified**: 2026-09-26

Dokumen ini mendokumentasikan mekanisme keamanan, autentikasi, otorisasi, penanganan rahasia (*secrets handling*), dan praktik yang dilarang pada sistem **Presensi & HRIS WIG**.


---

## 1. Authentication Architecture

- **Token Engine**: Berbasis JSON Web Token (JWT) yang diimplementasikan menggunakan library `jose` (HS256).
- **Penyimpanan Sesi Klien**:
  - Token JWT disimpan di cookie browser bernama `session`.
  - Atribut cookie:
    - `httpOnly: true` (mencegah pencurian token melalui serangan script XSS di browser).
    - `secure: process.env.NODE_ENV === "production"` (hanya ditransmisikan melalui kanal terenkripsi HTTPS di produksi).
    - `sameSite: "strict"` (memitigasi serangan Cross-Site Request Forgery / CSRF).
    - `path: "/"`
  - Masa berlaku token: 8 jam (standar), atau 30 hari jika opsi *Remember Me* dicentang.
- **Revokasi Sesi Seketika (Database Session Versioning)**:
  - Model `UserAccount` memiliki kolom integer `sessionVersion`.
  - Fungsi `getActiveSession()` membandingkan klaim `sessionVersion` di JWT dengan nilai aktif di basis data.
  - Jika pengguna mengganti kata sandi, dinonaktifkan (`isActive: false`), atau sesi dicabut oleh admin, nilai `sessionVersion` dinaikkan, sehingga token yang beredar otomatis tertolak tanpa menunggu masa kedaluwarsa.
- **Proteksi Terhadap Timing Attack**:
  - Pada saat proses login (`verifyLogin` di `src/lib/auth.ts`), jika username tidak ditemukan, sistem mengeksekusi `await bcrypt.hash("timing-equalizer", 10)` untuk menyamakan waktu respons server dan mencegah enumerasi username.

---

## 2. Authorization (Granular RBAC)

Aplikasi mengadopsi kontrol akses berbasis peran (*Role-Based Access Control* / RBAC):

- **Struktur Tabel**: `UserAccount` ── `UserRoleAssignment` ── `Role` ── `RolePermission` ── `Permission`.
- **Peran Sistem Utama**:
  - `SUPER_ADMIN`: Seluruh hak akses (`user.manage`, `hr.manage`, `ga.manage`, `employee.self`, `asset.read`).
  - `HR_ADMIN`: Hak akses HR, portal mandiri, dan baca aset (`hr.manage`, `employee.self`, `asset.read`).
  - `GA_ADMIN`: Hak akses GA, portal mandiri, dan baca aset (`ga.manage`, `employee.self`, `asset.read`).
  - `EMPLOYEE_USER`: Hak akses portal karyawan mandiri (`employee.self`).
  - `CLEANING_WORKER`: Hak akses operasional inspeksi (`cleaning.execute`). Role ini dikelola otomatis berdasarkan penetapan yang belum berakhir pada tanggal WIB berjalan; periode tanggal pada assignment tetap menjadi pemeriksaan akses ruangan aktual.
- **Pemeriksaan Izin API**:
  - API handler memeriksa keberadaan kode izin spesifik: `session.permissions.includes("hr.manage")`.
  - Bidang `session.role` (string "hr" | "ga" | "employee") telah ditandai `@deprecated` dan hanya dipertahankan untuk kompatibilitas ke belakang (*backward compatibility*).
- **Boundary Green Meeting**:
  - Kepemilikan operasional berada pada General Affairs; `picRole` dikunci ke `GA` dan tidak ada workflow transfer PIC.
  - Endpoint baca `/api/green-meeting/*` memerlukan autentikasi dan mendukung transparansi internal bagi GA, HR, dan karyawan.
  - Endpoint mutasi memanggil `canManageGreenMeeting()` dan hanya menerima permission `ga.manage`, role `GA_ADMIN`, atau override role `SUPER_ADMIN`.
  - Portal `/dashboard/green-meeting` dan `/employee/green-meeting` tidak menyediakan kontrol mutasi; seluruh pengelolaan operasional ada pada portal GA multi-page.
- **Boundary Inspeksi Harian (Core Cleaning Loop)**:
  - Portal `/cleaning` memerlukan permission `cleaning.execute` melalui route guard di `proxy.ts` dan pemeriksaan `requireAuth()` di setiap API route.
  - Petugas hanya dapat melihat ruangan dengan penetapan aktif dan mengubah item hanya pada tanggal WIB hari ini. Pencabutan penetapan segera menghilangkan akses termasuk riwayat.
  - Administrasi di `/ga/cleaning/*` memerlukan username `WIG002` DAN permission `ga.manage`. Tidak ada fallback role atau akun lain.
  - Akun outsource dibuat tanpa relasi employee, wajib menggunakan password 8–128 karakter, tidak memperoleh role saat pembuatan, dan hanya dapat didaftarkan atau ditugaskan oleh akun WIG002 yang membuatnya (`createdByUserId`).
  - Penetapan petugas (`CleaningWorkerAssignment`) menjadi satu-satunya sumber role `CLEANING_WORKER`; penambahan/penghapusan role terjadi secara transaksional bersama mutasi assignment. Assignment terjadwal dapat memberikan role lebih awal, tetapi service petugas tetap menolak ruangan sebelum `startsOnWibDate` efektif.
  - `proxy.ts` menduplikasi string literal `"cleaning.execute"` karena berjalan di Edge Runtime dan tidak dapat mengimpor dari modul server.

---

## 3. Sensitive Data Protection & PII Encryption

- **Standar Enkripsi**: `AES-256-GCM` dua arah dengan authenticated encryption.
- **Format Payload**: `enc:v1:{iv}:{authTag}:{ciphertext}` (seluruh komponen di-encode menggunakan `base64url`).
- **Derivasi Kunci**: Menggunakan SHA-256 dari string rahasia: `hris-pii-encryption:v1:${PII_ENCRYPTION_KEY ?? JWT_SECRET}`.
- **Blind Index Hashing**:
  - Data identitas sensitif (NIK, No KK, BPJS Kesehatan, BPJS Ketenagakerjaan, Nomor Rekening Bank) memiliki kolom pasangan hash deterministik (`*_hash`).
  - Dihasilkan via `HMAC-SHA256` dari teks yang dinormalisasi (huruf kapital, spasi dihilangkan).
  - Memungkinkan penegakan constraint unik (`@unique`) dan pencarian data tanpa harus mendekripsi seluruh basis data.
- **Penyuntingan / Masking Tampilan**:
  - Fungsi `maskPii()` menyembunyikan sebagian besar karakter dan hanya menampilkan 4 digit terakhir (contoh: `************1234`).

---

## 4. Anti-Fraud & Foto Kunjungan Dinas

- Foto pelaporan kunjungan klien diproses langsung di backend melalui `visitPhotoService.ts`:
  1. Hash SHA-256 dihitung dari berkas asli mentah (`sha256Original`).
  2. Server menghitung jarak antara koordinat GPS perangkat dengan titik lokasi target kunjungan.
  3. Menggunakan library `sharp` untuk menempelkan watermark permanen (stempel resmi bertuliskan tanggal server, koordinat, dan deviasi jarak).
  4. Berkas stempel (`stampedPath`) disimpan ke disk server yang tidak dapat dimanipulasi oleh klien.

---

## 5. Network Security & HTTP Headers

File `next.config.ts` menerapkan header keamanan HTTP standar industri pada seluruh rute:
- `X-Content-Type-Options: nosniff` (mencegah MIME-sniffing)
- `X-Frame-Options: DENY` (mencegah serangan clickjacking)
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=*, geolocation=*, microphone=()` (mengizinkan kamera dan GPS untuk presensi, memblokir mikrofon)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (HSTS)

---

## 6. Prohibited Practices (Praktik yang Dilarang Keras)

1. **Dilarang Menyimpan Secrets**: Jangan pernah melakukan commit file `.env` asli atau menuliskan kata sandi, token JWT, VAPID key, atau connection string riil ke dalam file repositori atau dokumentasi.
2. **Dilarang Bypass Sanitasi Input**: Jangan pernah memproses request body langsung tanpa melalui `validateBody()` atau `sanitizeObject()` untuk mencegah injeksi script XSS.
3. **Dilarang Mengekspos Plaintext Error ke Client**: Jangan mengirimkan objek exception mentah atau stack trace database ke respons HTTP klien; selalu gunakan `serverErrorResponse()` yang mengisolasi detail error ke logger Winston internal.
4. **Dilarang Menyimpan Kredensial Asli Tanpa Hashing**: Kata sandi wajib selalu di-hash menggunakan `bcryptjs` dengan salt rounds minimal 12 sebelum disimpan ke `user_accounts`.

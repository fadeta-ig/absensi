# Architectural Decisions — Absensi & HRIS WIG

> **Purpose**: Why important architectural decisions were made.  
> **Source of Truth**: Architectural Decision Records verified via commit history and codebase.  
> **Last Verified**: 2026-09-10  

Dokumen ini mencatat keputusan arsitektural penting (Architectural Decision Records / ADR) yang dapat dibuktikan dari evidence kode sumber dan riwayat git repository ini.


---

## ADR-001: Pemisahan Entitas `UserAccount` dan `Employee`

- **Decision**: Memisahkan entitas kredensial login (`UserAccount`) dari profil biodata kepegawaian (`Employee`).
- **Context**: Pada versi awal sistem, login terikat langsung ke tabel pegawai. Hal ini menimbulkan kendala bagi admin sistem (seperti Super Admin HR dan Admin GA) yang tidak terdaftar sebagai karyawan biasa atau tidak memiliki struktur departemen/payroll normal.
- **Chosen Approach**: Membuat model `UserAccount` dengan relasi opsional `employeeId` ke `Employee`. Mengaitkan role RBAC langsung ke `UserAccount`.
- **Reason**: Fleksibilitas otentikasi; admin sistem (misal `WIG001`, `WIG002`) dapat login dan mengelola sistem tanpa mengotori data master pegawai aktif.
- **Alternatives**: Mengisi data pegawai semu/dummy untuk setiap akun admin sistem.
- **Consequences**:
  - Positif: Struktur tabel pegawai tetap bersih dan murni untuk data HR operasional; pemisahan akun sistem dari data HR.
  - Negatif: Memerlukan relasi join `user.employee` saat memproses sesi portal mandiri karyawan.

---

## ADR-002: Migrasi dari Face Recognition ke 3-Factor Attendance (Wi-Fi + GPS + Selfie)

- **Decision**: Menghapus verifikasi wajah di sisi klien (*client-side face recognition neural model*) dan menggantinya dengan validasi 3-faktor: Wi-Fi Kantor, GPS Geofencing, dan Foto Selfie Downsampled.
- **Context**: Verifikasi wajah dengan model neural di browser seluler (PWA) memerlukan unduhan model berat, memakan memori CPU/GPU perangkat pengguna, dan rentan terhadap variasi pencahayaan serta latensi tinggi di smartphone low-end.
- **Chosen Approach**: Komit `65d125e` ("feat: migrate attendance to 3-factor wifi, gps, selfie and purge face recognition"). Presensi mewajibkan:
  1. Koneksi ke jaringan Wi-Fi kantor WIG/MKI (subnet `192.168.20.0/24` atau IP statis Citranet `202.152.141.27`).
  2. Berada dalam radius GPS kantor yang ditentukan.
  3. Mengambil foto selfie yang dikompresi ringan di browser.
- **Reason**: Kecepatan eksekusi presensi seketika (< 1 detik), reliabilitas jaringan kantor yang sulit dipalsukan tanpa akses fisik, serta kompatibilitas penuh dengan segala jenis smartphone karyawan.
- **Alternatives**: Mempertahankan model TensorFlow.js / face-api di browser atau menjalankan verifikasi wajah di backend (server-side).
- **Consequences**:
  - Positif: Aplikasi PWA sangat ringan, proses presensi instan dan hemat baterai/kuota.
  - Negatif: Kolom `faceDescriptor` di skema Prisma dan `NEXT_PUBLIC_FACE_THRESHOLD` di `.env.example` menjadi peninggalan legacy yang sudah tidak digunakan di alur verifikasi utama.

---

## ADR-003: Penggunaan Next.js 16 Edge Proxy (`src/proxy.ts`) sebagai Route Guard

- **Decision**: Menggunakan mekanisme file `src/proxy.ts` yang mengekspor fungsi `proxy(request: NextRequest)` untuk route guard Next.js 16.
- **Context**: Next.js 16 memperkenalkan konvensi `proxy.ts` yang dieksekusi di Edge Runtime sebelum halaman dirender.
- **Chosen Approach**: Mengimplementasikan pengecekan JWT cookie `session` secara terisolasi di `src/proxy.ts` menggunakan library `jose`, menduplikasi antarmuka `SessionPayload` agar tidak mengimpor modul Node.js yang dilarang di Edge.
- **Reason**: Mencegah rendering halaman yang tidak berhak di server sebelum dikirim ke klien, meningkatkan keamanan portal (HR, GA, Employee) pada lapisan pertama.
- **Alternatives**: Menggunakan component-level auth checks atau middleware konvensional lama.
- **Consequences**:
  - Positif: Proteksi instan di tingkat edge proxy; waktu redirect sangat cepat tanpa beban database.
  - Negatif: Developer harus menjaga keselarasan antarmuka `SessionPayload` di `src/proxy.ts` dan `src/lib/auth.ts`.

---

## ADR-004: Enkripsi Data Pribadi (PII) dengan Skema Blind Index

- **Decision**: Mengenkripsi nomor identitas pribadi (NIK, No KK, BPJS Kesehatan, BPJS Ketenagakerjaan, Nomor Rekening Bank) menggunakan `AES-256-GCM` dan menyertakan kolom `*_hash` menggunakan `HMAC-SHA256`.
- **Context**: Kepatuhan terhadap perlindungan data pribadi (UU PDP). Database tidak boleh menyimpan plaintext identitas sensitif, namun sistem tetap harus dapat memvalidasi keunikan NIK/Rekening dan melakukan pencarian langsung.
- **Chosen Approach**: `src/lib/security/pii.ts` mengenkripsi data ke format `enc:v1:{iv}:{tag}:{ciphertext}`. Untuk pencarian/indeks unik, sistem membuat hash deterministik huruf besar tanpa spasi menggunakan kunci derivasi `PII_ENCRYPTION_KEY ?? JWT_SECRET`.
- **Reason**: Menjamin kerahasiaan saat database di-dump, sekaligus mempertahankan integritas constraint database (`@unique`) dan performa pencarian.
- **Alternatives**: Plaintext storage atau hashing satu arah (tanpa kemampuan menampilkan kembali nomor identitas saat dibutuhkan HR).
- **Consequences**:
  - Positif: Standar keamanan data pribadi tinggi; integritas data terjamin.
  - Negatif: Operasi query berbasis substring (`LIKE '%123%'`) tidak dapat dilakukan pada kolom PII terenkripsi.

---

## ADR-005: Watermarking & Anti-Fraud Foto Kunjungan Dinas via Engine `sharp`

- **Decision**: Memproses foto bukti kunjungan klien di backend menggunakan `sharp`, menghitung digest `sha256Original`, dan menempelkan stempel watermark permanen.
- **Context**: Pelaporan dinas luar rawan manipulasi foto galeri palsu atau rekayasa lokasi.
- **Chosen Approach**: Server menerima foto asli, menghitung hash integritas `sha256Original`, memverifikasi deviasi jarak GPS ke target lokasi klien, dan mencetak watermark permanen ke `stampedPath` sebelum disimpan ke direktori `/storage/visit-photos/`.
- **Reason**: Menjamin bukti otentik yang tidak dapat diedit kembali oleh pengguna setelah diunggah, dengan audit trail metadata GPS dan waktu server resmi.
- **Alternatives**: Mengandalkan kamera browser untuk stempel foto di sisi klien (mudah dibobol lewat manipulasi canvas).
- **Consequences**:
  - Positif: Bukti audit dinas luar memiliki kekuatan forensik yang tinggi.
  - Negatif: Memerlukan dependensi native modul `sharp` dan kapasitas penyimpanan disk lokal untuk file gambar asli dan stempel.

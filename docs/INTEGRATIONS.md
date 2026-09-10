# Integrations & External Services — Absensi & HRIS WIG

> **Purpose**: External and internal integrations.  
> **Source of Truth**: Integration implementations (`nodemailer`, `web-push`, network validator, and cron endpoints).  
> **Last Verified**: 2026-09-10  

Dokumen ini mendokumentasikan integrasi layanan eksternal, layanan internal, mekanisme otentikasi, batasan integrasi, dan mitigasi kegagalan.


---

## 1. External Services

### A. SMTP Gateway (Nodemailer)
- **Tujuan**: Mengirimkan slip gaji digital, kredensial akun baru, tautan reset kata sandi, dan notifikasi pengingat ulang tahun karyawan.
- **Konfigurasi (`.env`)**:
  - `SMTP_HOST`: Host server email SMTP (contoh: `smtp.gmail.com` atau SMTP internal).
  - `SMTP_PORT`: Port SMTP (default: `587` untuk TLS).
  - `SMTP_USER`: Nama pengguna otentikasi.
  - `SMTP_PASS`: Kata sandi / App Password.
  - `SMTP_FROM`: Alamat pengirim (contoh: `"WIG Attendance <noreply@example.com>"`).
- **Failure Considerations**:
  - Jika variabel SMTP tidak dikonfigurasi, `emailService.ts` akan mencatat warning ke Winston dan gagal secara halus tanpa menyebabkan crash pada request HTTP utama.

### B. Web Push Notification Gateway (VAPID / Web-Push)
- **Tujuan**: Mengirimkan notifikasi push real-time ke browser seluler (PWA) karyawan untuk pengingat jam presensi dan pembaruan status pengajuan (cuti/lembur).
- **Konfigurasi (`.env`)**:
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: Kunci publik VAPID yang diakses browser untuk meminta izin notifikasi.
  - `VAPID_PRIVATE_KEY`: Kunci privat VAPID yang digunakan server untuk menandatangani payload push.
- **Service Worker Handler**: `worker/index.js` meng-intercept event `push`, memunculkan notifikasi sistem dengan getaran `[200, 100, 200]`, dan merutekan klik notifikasi ke `/employee`.
- **Failure Considerations**:
  - Jika subscription endpoint sudah kedaluwarsa atau browser pengguna mencabut izin (error 410 Gone / 404 Not Found), backend secara otomatis menghapus record dari tabel `push_subscriptions`.

### C. Jaringan Wi-Fi Kantor (MikroTik RB4011 & Citranet ISP)
- **Tujuan**: Validasi faktor jaringan kehadiran fisik karyawan.
- **Identifikasi Jaringan**:
  - `192.168.20.1`: IP Gateway MikroTik RB4011 untuk interface jaringan kantor (Hairpin NAT).
  - `192.168.20.0/24`: Subnet perangkat Wi-Fi lokal kantor.
  - `202.152.141.27`: IP publik statis ISP Citranet kantor WIG.
- **Mekanisme Deteksi**: Ekstraksi IP klien melalui `x-forwarded-for` (IP pertama) dengan fallback ke `x-real-ip` via `networkValidator.ts`.
- **Failure Considerations**:
  - Jika reverse proxy Nginx di depan aplikasi salah mengonfigurasi header `x-forwarded-for`, IP klien dapat terbaca sebagai `127.0.0.1` atau IP internal docker, sehingga menyebabkan presensi ditolak.

---

## 2. Internal Services & API Boundaries

### A. REST API Layer (`/api/*`)
- Terdapat 29 submodul API terisolasi di bawah `src/app/api/`.
- Seluruh komunikasi data antar UI dan backend menggunakan format JSON murni (`application/json`) atau `multipart/form-data` untuk unggahan berkas.

### B. Cron & Background Schedulers (`/api/cron/*`)
- Menyediakan 5 endpoint tugas berkala:
  1. `/api/cron/birthday-reminder` (cek ulang tahun pegawai harian pukul 08:00 WIB).
  2. `/api/cron/cleanup-photos` (pembersihan berkas sementara/usang).
  3. `/api/cron/daily-greeting` (broadcast pengingat harian).
  4. `/api/cron/generate-payroll` (agregasi otomatis gaji bulanan).
  5. `/api/cron/reset-leave` (pembaharuan kuota cuti tahunan).
- **Otentikasi Cron**:
  - Dilindungi menggunakan header `Authorization: Bearer <CRON_SECRET>` untuk pemanggil sistem eksternal (seperti crontab / systemd timer), atau sesi HR Admin yang sah (`canManageHr`).

---

## 3. Failure Handling & Resilience

| Komponen Integrasi | Skenario Kegagalan | Dampak | Penanganan Sistem |
|---|---|---|---|
| **MariaDB** | Koneksi database terputus | API gagal memproses transaksi | Prisma melempar exception; `serverErrorResponse()` menangkap, mencatat error ke Winston, dan mengirim JSON 500 generik |
| **SMTP Server** | Timeout / Kredensial salah | Email gagal terkirim | Log error via Winston; alur bisnis utama (misal import pegawai atau buat user) tetap selesai |
| **Web Push** | Endpoint VAPID expired/revoked | Notifikasi push gagal | Backend menangkap error 410/404 dan menghapus subscription yang invalid dari database |
| **Reverse Proxy Nginx** | Header IP tidak diteruskan | Presensi ditolak (dianggap IP luar) | Log peringatan di `logger.warn` mencatat IP yang terbaca; karyawan dapat diberikan bypass sementara jika darurat |

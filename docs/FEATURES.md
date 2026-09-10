# System Features & Capabilities — Absensi & HRIS WIG

> **Purpose**: Pengetahuan kapabilitas, modul fitur, dan batasan fungsional sistem.  
> **Source of Truth**: Implementasi fitur di layer UI (`src/app/`) dan service bisnis (`src/lib/services/`).  
> **Last Verified**: 2026-09-10  

Dokumen ini menjelaskan kapabilitas fungsional yang disediakan oleh platform **Absensi & HRIS WIG** untuk berbagai aktor pengguna (Super Admin, HR, GA, dan Karyawan).

---

## 1. Modul Autentikasi & Kontrol Akses (RBAC)

### A. Login & Manajemen Sesi
- **Otentikasi Kredensial**: Login menggunakan username/email dan kata sandi dengan proteksi *timing-attack safe comparison* dan batas toleransi percobaan login gagal (*login attempt lockout*).
- **Session Cookie Terisolasi**: Sesi disimpan dalam cookie JWT `session` bertanda tangan kriptografis dengan flag `httpOnly`, `secure`, dan `sameSite: lax`.
- **Instant Session Revocation**: Setiap akun memiliki atribut integer `session_version`. Jika sesi pengguna dicabut atau kata sandi diubah, penambahan nilai versi sesi secara otomatis membatalkan seluruh token lama seketika.
- **Edge Route Guard**: Filter di `src/proxy.ts` memastikan pengguna tanpa sesi dialihkan ke halaman login, dan pengguna tanpa izin portal dialihkan ke halaman akses terlarang.

### B. Granular Role-Based Access Control
- **Struktur Multi-Role**: Sistem membedakan peran dasar (`SUPER_ADMIN`, `HR_ADMIN`, `GA_ADMIN`, `EMPLOYEE_USER`).
- **Atomic Permissions**: Otorisasi internal didasarkan pada kumpulan izin atomik (`attendance:read`, `payroll:create`, `assets:update`, dll.) yang dapat diberikan secara fleksibel per peran.
- **Manajemen Akun HR**: HR Admin dapat membuat akun pengguna baru, mengatur role, dan memicu pengiriman kredensial awal secara otomatis melalui email SMTP.

---

## 2. Modul Kehadiran (Attendance)

### A. Presensi Terpadu 3-Faktor
- **Faktor 1 — Jaringan Wi-Fi Kantor**: Memverifikasi IP pengirim terhadap subnet lokal router kantor (`192.168.20.0/24`) atau IP publik statis ISP Citranet (`202.152.141.27`).
- **Faktor 2 — Geofencing GPS**: Memverifikasi koordinat perangkat terhadap radius geofence kantor (default 100 meter) menggunakan formula jarak Haversine.
- **Faktor 3 — Foto Selfie**: Mengambil foto wajah selfie langsung dari kamera perangkat (downsampled di browser) untuk audit bukti fisik kehadiran.
- **Bypass Location**: Dukungan flag pengecualian lokasi (`bypass_location: true`) bagi karyawan tugas luar atau manajemen tingkat atas.

### B. Alur Penyesuaian & Monitoring
- **Koreksi Absensi (Attendance Correction)**: Karyawan dapat mengajukan perbaikan jam clock-in/out jika terjadi kendala teknis, lengkap dengan alasan dan bukti, yang memerlukan persetujuan manajer/atasan.
- **Monitoring Tim Subordinat**: Atasan langsung dapat memantau log kehadiran, status keterlambatan, dan riwayat presensi bawahan langsungnya di `/employee/monitoring`.
- **Rekapitulasi HR**: Dasbor monitoring harian bagi tim HR dengan rekap status kehadiran bulanan dan opsi ekspor data ke file spreadsheet Excel.

---

## 3. Modul General Affairs (GA) & Manajemen Aset

### A. Inventarisasi & Pelacakan Aset
- **Katalog Aset Korporat**: Pencatatan spesifikasi detail aset mencakup kode inventaris unik, nomor seri, IMEI, nama vendor, tanggal perolehan, nilai beli, dan masa garansi.
- **Scanner Barcode/QR Web**: Antarmuka kamera terintegrasi di `/ga/scan` untuk memindai label aset secara cepat di lapangan tanpa perangkat scanner eksternal.
- **Riwayat Mutasi & Dokumen BAST**: Pelacakan riwayat pergantian pemegang aset (*asset histories*) disertai penyimpanan dokumen digital Berita Acara Serah Terima (BAST) biner (`MediumBlob`).

### B. Pemeliharaan & Tiket GA
- **Checklist Inspeksi Fisik**: Formulir audit berkala dengan indikator per-item (layar, keyboard, baterai, casing) untuk menilai kelayakan aset.
- **Log Servis Vendor**: Pencatatan riwayat servis perbaikan di vendor eksternal lengkap dengan tanggal, estimasi biaya, dan unggahan nota/invoice perbaikan.
- **Helpdesk & Tiket Permintaan**: Karyawan dapat mengajukan tiket pelaporan kerusakan perangkat atau permohonan aset baru ke tim GA.
- **Kartu SIM Korporat**: Modul khusus pencatatan kartu SIM perusahaan, masa aktif kuota, dan status peminjaman staf.

---

## 4. Modul HR & Penggajian (Payroll)

### A. Manajemen Data Induk Karyawan (Employee 360)
- **Data Karyawan Menyeluruh**: Biodata pribadi, nomor kontak darurat, informasi rekening bank, riwayat arsip dokumen kepegawaian (KTP, Ijazah, Kontrak), dan data perpajakan.
- **Batch Import Excel**: Fasilitas import data pegawai secara massal dari file Excel dengan validasi format otomatis dan deduplikasi data.
- **Riwayat Status Kepegawaian**: Pelacakan transisi status kerja (Permanent, Contract, Probation, Intern, Resign) dengan pencatatan tanggal efektif dan alasan resmi.

### B. Mesin Kalkulator Penggajian Otomatis
- **Lembur Sesuai PP 35/2021**: Menghitung jam lembur hari kerja dan hari libur secara otomatis dengan rumus pengali resmi per jam (`1/173 * Gaji Pokok`).
- **Iuran BPJS**: Menghitung simulasi dan pemotongan iuran BPJS Kesehatan (4% pemberi kerja, 1% pekerja) serta BPJS Ketenagakerjaan (JKK, JKM, JHT, JP).
- **Pajak Penghasilan PPh 21 TER 2024**: Perhitungan otomatis pajak bulanan berbasis formula Tarif Efektif Rata-rata (TER) Kategori A, B, dan C berdasarkan status PTKP.
- **Slip Gaji Digital PDF**: Pembuatan dan distribusi slip gaji digital terenkripsi yang dapat diunduh mandiri oleh karyawan melalui portal ESS.

---

## 5. Modul Kunjungan Lapangan (Field Visits)

### A. Pelaporan & Audit Trail
- **Pencatatan Kunjungan Dinas**: Pelaporan aktivitas luar kantor dengan koordinat target kunjungan klien, waktu check-in/out, nama kontak klien, dan ringkasan pertemuan.
- **Anti-Fraud Watermarking**: Pemrosesan foto bukti kunjungan di backend menggunakan library `sharp`:
  - Menghitung hash SHA-256 berkas asli (`sha256Original`).
  - Menghitung deviasi jarak GPS ke lokasi klien (`distanceToTargetMeters`).
  - Mencetak watermark permanen (stempel resmi tanggal, jam server, dan koordinat) pada gambar sebelum disimpan.

---

## 6. Fitur Penunjang & Layanan Mandiri (Self-Service)

### A. Employee Self-Service (ESS)
- **Pengajuan Cuti**: Pengajuan cuti tahunan, cuti sakit, atau cuti khusus dengan pengurangan kuota saldo cuti tahunan (default 12 hari/tahun).
- **Permohonan Surat Keterangan**: Pengajuan surat resmi (Surat Keterangan Kerja, Keterangan Penghasilan, Keterangan Masih Bekerja, Surat Pengantar BPJS).
- **Papan Tugas Personal (Todo List)**: Fitur manajemen tugas harian personal karyawan.

### B. Komunikasi & Otomasi
- **Papan Berita Perusahaan**: Papan pengumuman informasi internal yang dikelola HR untuk seluruh karyawan.
- **Sistem Pengingat Ulang Tahun**: Pengingat harian otomatis jadwal ulang tahun staf (H-30, H-14, H-7) dengan alur persiapan custom dan ucapan selamat via email.
- **Web Push Notifications**: Notifikasi browser PWA via protokol VAPID untuk pengingat presensi dan update permohonan cuti.
- **Endpoint Cron Otomatis**: 5 jadwal tugas harian/bulanan otomatis di bawah `/api/cron/` terproteksi `CRON_SECRET`.

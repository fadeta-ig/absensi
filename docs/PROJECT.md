# Project Overview — Absensi & HRIS WIG

> **Purpose**: What this project is and what it does.  
> **Source of Truth**: Repository scope, `package.json`, and business capabilities.  
> **Last Verified**: 2026-09-10  

## 1. Project Purpose


Project **Absensi & HRIS WIG** (`fadeta-ig/absensi`) adalah platform terintegrasi Human Resource Information System (HRIS), General Affairs (GA) Asset Management, dan Portal Layanan Mandiri Karyawan berbasis Progressive Web App (PWA) untuk lingkungan perusahaan PT Wahana Inti Ganda (WIG) dan grup MKI.

Project ini dirancang untuk:
- Mengotomatisasi dan memvalidasi presensi karyawan secara akurat dengan 3 faktor keamanan (jaringan Wi-Fi kantor, geofencing GPS, dan foto selfie).
- Mengelola data master karyawan, struktur organisasi, dan siklus hidup kepegawaian (status aktif, probation, kontrak, terminasi).
- Mengelola aset operasional perusahaan oleh tim General Affairs (GA) melalui kode inventaris, pelacakan kondisi, Berita Acara Serah Terima (BAST), inspeksi berkala, tiket perbaikan, dan kartu SIM korporat.
- Menyediakan kalkulasi penggajian terintegrasi, komponen tunjangan/potongan, perhitungan BPJS Ketenagakerjaan & Kesehatan, serta pajak penghasilan PPh 21 (skema TER 2024).
- Memberikan portal mandiri ramah seluler bagi karyawan untuk presensi, pengajuan cuti, lembur, permohonan surat kerja, tugas personal, serta pelaporan kunjungan dinas ke klien (*client visits*).

---

## 2. Scope & Target Users

Aplikasi melayani 4 kelompok peran utama:
1. **Super Admin HR**: Memiliki wewenang penuh atas manajemen pengguna (`user.manage`), modul HR (`hr.manage`), modul GA (`ga.manage`), aset, dan portal karyawan.
2. **Admin HR**: Mengelola master data karyawan, presensi harian, permohonan cuti/lembur, payroll, BPJS, PPh 21, dan pengumuman perusahaan.
3. **Admin GA**: Mengelola inventaris aset fisik, kategori, log servis, dokumen BAST, kartu SIM, dan tiket kerusakan/permintaan aset.
4. **Karyawan (Employee)**: Mengakses portal seluler PWA untuk presensi harian, riwayat kehadiran, slip gaji terenkripsi, pengajuan surat/cuti/lembur, dan pelaporan kunjungan dinas.

---

## 3. Major Capabilities

### A. Core Attendance (Presensi 3-Faktor)
- **Validasi Jaringan Wi-Fi Kantor**: Verifikasi IP klien terhadap subnet MikroTik (`192.168.20.0/24`) dan IP publik statis Citranet (`202.152.141.27`). Tersedia flag `bypassLocation` untuk karyawan tertentu.
- **Geofencing GPS**: Penghitungan radius toleransi terhadap koordinat kantor yang ditugaskan ke karyawan.
- **Selfie Downsampling**: Pengambilan foto bukti kehadiran yang dikompresi di sisi klien.
- **Koreksi Kehadiran**: Alur pengajuan koreksi presensi yang memerlukan persetujuan langsung dari atasan/manajer.

### B. General Affairs (GA) Asset Lifecycle
- **Katalog & Registrasi Aset**: Manajemen barcode/QR aset, serial number, IMEI, vendor, dan tanggal garansi.
- **BAST Digital**: Unggah dan penyimpanan dokumen serah terima aset dalam bentuk `MediumBlob` database.
- **Checklist Inspeksi Berkala**: Formulir checklist kondisi aset (`BAIK`, `KURANG_BAIK`, `RUSAK`) dengan item pemeriksaan dinamis.
- **Maintenance & Vendor Log**: Pelacakan biaya servis, estimasi penyelesaian, dan nota perbaikan.
- **Manajemen Kartu SIM**: Inventarisasi nomor seluler korporat dan pelacakan masa aktif kuota.

### C. HR & Payroll Engine
- **Employee 360 View**: Tampilan terpadu data pribadi terenkripsi, riwayat jabatan, aset yang dipinjam, riwayat pajak, dan dokumen pelengkap.
- **Perhitungan Lembur**: Sesuai regulasi ketenagakerjaan Indonesia (PP No. 35/2021).
- **Kalkulator BPJS**: Simulasi dan pemotongan otomatis iuran BPJS Kesehatan (4% pemberi kerja, 1% pekerja) & Ketenagakerjaan (JKK, JKM, JHT, JP).
- **Perhitungan PPh 21 Modern**: Mengimplementasikan Tarif Efektif Rata-rata (TER) kategori A, B, C dan tarif Pasal 17 UU HPP per 2024.
- **Penerbitan Slip Gaji PDF**: Generator slip gaji otomatis yang dapat diunduh langsung oleh karyawan.

### D. Field Client Visits (Kunjungan Klien)
- **Pelaporan Kunjungan**: Pencatatan lokasi target, alamat klien, koordinat GPS saat clock-in/out, serta ringkasan hasil kunjungan.
- **Anti-Fraud Watermarking**: Setiap foto kunjungan dihitung nilai `sha256Original`, dianalisis deviasi jaraknya terhadap target lokasi, dan distempel *watermark* permanen (tanggal, koordinat GPS, nama pegawai) menggunakan engine `sharp`.

### E. Komunikasi & Notifikasi
- **PWA Web Push Notifications**: Integrasi VAPID untuk mengirimkan pengingat kehadiran dan update status pengajuan ke perangkat seluler karyawan.
- **Email Gateway (SMTP)**: Distribusi slip gaji, kredensial akun baru, dan notifikasi pengingat ulang tahun.
- **Manajemen Pengingat Ulang Tahun**: Alur kerja persiapan ulang tahun pegawai (h-30, h-14, h-7) dengan status yang dapat dikustomisasi.

---

## 4. Terminology

- **WIG / MKI**: PT Wahana Inti Ganda / grup entitas bisnis yang menaungi sistem.
- **GA**: General Affairs (Urusan Umum / Logistik Aset).
- **BAST**: Berita Acara Serah Terima (dokumen serah terima fisik aset ke karyawan).
- **PTKP**: Penghasilan Tidak Kena Pajak (status perpajakan seperti TK/0, K/1, dsb.).
- **TER**: Tarif Efektif Rata-rata (skema perhitungan PPh 21 bulanan terbaru di Indonesia).
- **PII**: Personally Identifiable Information (data privat karyawan: NIK, KK, BPJS, No Rekening).
- **Blind Index**: Hash deterministik (`HMAC-SHA256`) pada data terenkripsi untuk memungkinkan pencarian cepat dan *unique constraint* tanpa membuka enkripsi plaintext.
- **Bypass Location**: Flag pada profil pegawai yang mengizinkan presensi dari luar jaringan Wi-Fi atau luar radius GPS kantor.

---

## 5. Current Project Status

- **Status Rilis**: Fase Produksi Aktif / Internal Enterprise (Versi `0.1.0`).
- **Framework Utama**: Next.js 16.1.6 (Webpack runtime), React 19.2.3, Prisma 6.19.2, MariaDB 10.11.
- **Kelengkapan Fitur**: Modul HR, GA, dan Portal Karyawan aktif dan beroperasi dengan 47 model Prisma dan 50 tabel basis data.

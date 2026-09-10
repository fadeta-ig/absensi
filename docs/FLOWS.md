# End-to-End System Flows — Absensi & HRIS WIG

> **Purpose**: Alur sistem end-to-end utama (Data & Request Flows).  
> **Source of Truth**: Alur navigasi UI, route handler API, dan service bisnis terpadu.  
> **Last Verified**: 2026-09-10  

Dokumen ini memetakan alur kerja utama (*end-to-end user & data flows*) yang melintasi berbagai lapisan arsitektur platform dari interaksi pengguna, transport API, logika bisnis, hingga persistensi database.

---

## 1. Flow: Autentikasi, Route Guard, & Sesi Pengguna

Alur otentikasi memastikan integritas akses ke masing-masing portal aplikasi:

```text
[ Browser / PWA ]                     [ Edge Runtime (src/proxy.ts) ]              [ API / Services ]
       │                                            │                                     │
       │─── 1. Navigasi ke rute portal ────────────>│                                     │
       │    (misal: /dashboard atau /employee)      │                                     │
       │                                            │── 2. Periksa cookie 'session' ─────>│
       │                                            │   - Verifikasi JWT via 'jose'       │
       │                                            │   - Cek role/permissions rute       │
       │<── 3. [Jika Belum Login] Redirect ke / ────│                                     │
       │                                            │                                     │
       │─── 4. POST /api/auth/login (Kredensial) ────────────────────────────────────────>│
       │                                                                                  │── 5. Cek username/email
       │                                                                                  │── 6. Timing-safe verify pass
       │                                                                                  │── 7. Buat JWT signed token
       │<── 8. Set-Cookie: session (httpOnly, secure) ────────────────────────────────────│
       │                                            │                                     │
       │─── 9. Akses ulang rute terproteksi ───────>│                                     │
       │                                            │── 10. Lolos validasi ──────────────>│ (Render Server Page)
```

1. **Pengecekan di Gerbang Pertama (Edge Proxy)**: Setiap request HTTP halaman diperiksa oleh `src/proxy.ts` di Edge Runtime sebelum komponen React diproses. Jika token tidak valid, pengguna langsung dialihkan ke login (`/`).
2. **Otentikasi Kredensial**: `POST /api/auth/login` memverifikasi kata sandi terhadap hash di database menggunakan mekanisme komparasi yang aman dari serangan timing.
3. **Penyimpanan Sesi Kriptografis**: Token JWT yang memuat identitas pengguna, hak akses atomik, dan integer `sessionVersion` disimpan dalam cookie `httpOnly`.
4. **Pencabutan Sesi Seketika**: Jika akun pengguna diubah atau sesi dicabut oleh admin, penambahan kolom `session_version` di database menyebabkan seluruh token lama otomatis ditolak pada request API berikutnya.

---

## 2. Flow: Presensi Harian 3-Faktor (Clock-In / Clock-Out)

Alur validasi kehadiran memastikan karyawan benar-benar berada di lingkungan fisik kantor:

```text
[ Karyawan (PWA) ]                           [ API: /api/attendance ]                    [ attendanceService.ts ]
       │                                                │                                            │
       │── 1. Ambil koordinat GPS perangkat             │                                            │
       │── 2. Ambil foto selfie kamera (downsampled)    │                                            │
       │── 3. Kirim payload presensi (GPS + Selfie) ───>│                                            │
       │                                                │── 4. Ekstrak IP klien pengirim             │
       │                                                │── 5. Delegasikan validasi ────────────────>│
       │                                                │                                            │── 6. Cek employee.bypassLocation
       │                                                │                                            │── 7. Verifikasi IP (Wi-Fi/Citranet)
       │                                                │                                            │── 8. Hitung deviasi jarak GPS
       │                                                │                                            │── 9. Evaluasi shift kerja & jam
       │                                                │                                            │── 10. Simpan foto & persistensi DB
       │<── 11. Response: Status Kehadiran (Sukses) ────│<── Hasil catatan absensi ──────────────────│
```

1. **Pengambilan Bukti di Klien**: Aplikasi PWA meminta izin akses kamera dan lokasi geografis. Foto selfie dikompresi ringan di peramban untuk menghemat bandwidth.
2. **Validasi Jaringan (Faktor 1)**: Kecuali karyawan memiliki bendera `bypass_location: true`, IP publik pengirim dicocokkan dengan IP statis ISP Citranet (`202.152.141.27`) atau subnet lokal router kantor WIG (`192.168.20.0/24`).
3. **Validasi Geofence (Faktor 2)**: Koordinat GPS pengguna dihitung deviasinya terhadap koordinat titik kantor menggunakan rumus Haversine. Jarak harus berada di dalam batas toleransi radius lokasi kantor (default 100 meter).
4. **Evaluasi Shift & Penyimpanan**: Waktu server dicocokkan dengan jadwal kerja aktif karyawan (`WorkShiftDay`). Sistem menentukan apakah presensi berstatus tepat waktu atau terlambat, menyimpan file foto, dan membuat entri permanen pada tabel `attendance_records`.

---

## 3. Flow: Penggajian Bulanan (Payroll Calculation & Issuance)

Alur pemrosesan penggajian mengintegrasikan kehadiran, lembur, pemotongan iuran, dan pajak:

```text
[ HR Admin / Cron ]                          [ API: /api/payslips ]                      [ Service Layer ]
       │                                                │                                       │
       │── 1. Pemicu: Generate payroll bulan X ────────>│                                       │
       │                                                │── 2. Ambil master pegawai aktif ─────>│
       │                                                │                                       │── 3. Hitung lembur (overtimeCalcService)
       │                                                │                                       │      - Filter request lembur APPROVED
       │                                                │                                       │      - Rumus PP 35/2021 (1/173 gaji)
       │                                                │                                       │── 4. Hitung iuran (bpjsService)
       │                                                │                                       │      - BPJS Kesehatan & Ketenagakerjaan
       │                                                │                                       │── 5. Hitung pajak (pph21Service)
       │                                                │                                       │      - Formula TER 2024 (Kat A/B/C)
       │                                                │                                       │── 6. Hitung THP (Take Home Pay)
       │                                                │                                       │── 7. Generate PDF slip gaji digital
       │                                                │                                       │── 8. Persistensi ke database
       │<── 9. Response: Rekapitulasi penggajian selesai─│<── Status batch selesai ──────────────│
```

1. **Pengumpulan Komponen Gaji**: Mengambil data gaji pokok dan komponen tunjangan/potongan master setiap karyawan aktif.
2. **Kalkulasi Lembur Otomatis**: Mengumpulkan seluruh permohonan lembur yang telah disetujui (`APPROVED`) pada periode terkait, lalu menghitung nominal kompensasi sesuai tarif resmi PP 35/2021.
3. **Kalkulasi Iuran BPJS**: Menghitung porsi iuran yang ditanggung pemberi kerja dan pekerja untuk BPJS Kesehatan dan BPJS Ketenagakerjaan (JKK, JKM, JHT, JP).
4. **Kalkulasi Pajak PPh 21 TER**: Mengklasifikasikan karyawan ke Kategori TER berdasarkan status PTKP, lalu mengalikan penghasilan bruto dengan tarif persentase TER bulanan yang berlaku.
5. **Penerbitan Slip Gaji**: Menyimpan rekapitulasi ke tabel `payslip_records` dan menghasilkan berkas slip gaji PDF terenkripsi yang dapat diakses mandiri oleh pegawai di portal ESS.

---

## 4. Flow: Kunjungan Lapangan & Watermarking Anti-Fraud (Field Visits)

Alur pelaporan aktivitas dinas luar kantor dengan jaminan keaslian data:

```text
[ Staf Lapangan ]                            [ API: /api/visits ]                        [ visitService & Sharp ]
       │                                                │                                           │
       │── 1. Input nama klien & koordinat tujuan       │                                           │
       │── 2. Ambil foto di lokasi klien                │                                           │
       │── 3. Kirim pelaporan kunjungan (Clock-In) ────>│                                           │
       │                                                │── 4. Delegasikan pemrosesan foto ────────>│
       │                                                │                                           │── 5. Hitung SHA-256 berkas asli
       │                                                │                                           │── 6. Hitung deviasi jarak ke klien
       │                                                │                                           │── 7. Engine Sharp: Cetak watermark
       │                                                │                                           │      (Waktu, GPS, & Status Deviasi)
       │                                                │                                           │── 8. Simpan foto ke disk & persistensi DB
       │<── 9. Response: Kunjungan tercatat aktif ──────│<── Data visit record tersimpan ───────────│
       │                                                │                                           │
       │── 10. Selesai: Input hasil pertemuan (Clock-Out)──────────────────────────────────────────>│ (Tutup siklus kunjungan)
```

1. **Pencatatan Awal di Lokasi**: Karyawan tiba di lokasi klien, membuka formulir kunjungan, mengambil foto langsung dari kamera perangkat, dan melakukan submit.
2. **Audit Integritas Citra**: Server menghitung nilai hash `sha256Original` dari berkas biner foto asli untuk menjamin berkas belum dimanipulasi.
3. **Verifikasi Koordinat Target**: Menghitung deviasi jarak antara lokasi fisik GPS perangkat saat pengunggahan dengan koordinat target alamat klien.
4. **Pencetakan Watermark Forensik**: Modul `sharp` menempelkan stempel permanen berupa teks waktu server resmi, koordinat latitude/longitude, dan jarak deviasi langsung ke atas gambar foto sebelum disimpan ke folder `/storage/visit-photos/`.
5. **Penutupan Kunjungan**: Setelah pertemuan selesai, karyawan melakukan clock-out dengan mencatat rangkuman hasil pembicaraan dinas.

---

## 5. Flow: Penyerahan & BAST Aset General Affairs

Alur serah terima aset korporat dari GA ke karyawan:

```text
[ Admin GA ]                                 [ API: /api/assets/assign ]                 [ assetService.ts ]
       │                                                │                                        │
       │── 1. Pilih aset (Status: AVAILABLE)            │                                        │
       │── 2. Pilih karyawan penerima                   │                                        │
       │── 3. Unggah pindaian dokumen BAST fisik ──────>│                                        │
       │                                                │── 4. Validasi ketersediaan aset ──────>│
       │                                                │                                        │── 5. Simpan file BAST ke MediumBlob
       │                                                │                                        │── 6. Update status aset: IN_USE
       │                                                │                                        │── 7. Catat entri ke asset_histories
       │<── 8. Response: Aset berhasil diserahkan ──────│<── Status aset terupdate ──────────────│
```

1. **Pemilihan Aset**: Tim GA memilih aset yang berada di pool inventaris (berstatus `AVAILABLE`).
2. **Pengunggahan Dokumen Serah Terima**: Pindaian berkas Berita Acara Serah Terima (BAST) bertanda tangan diunggah ke sistem.
3. **Persistensi Biner**: Dokumen BAST disimpan langsung ke dalam tabel `asset_bast_documents` sebagai data biner (`MediumBlob`) untuk kemudahan backup terpadu basis data.
4. **Pembaruan Kepemilikan**: Status aset berubah menjadi `IN_USE` dengan `holderType: EMPLOYEE`, dan riwayat mutasi dicatat pada tabel audit `asset_histories`. Aset seketika muncul di daftar inventaris mandiri karyawan terkait.

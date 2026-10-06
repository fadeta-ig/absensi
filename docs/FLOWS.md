# End-to-End System Flows — Presensi & HRIS WIG

> **Purpose**: Alur sistem end-to-end utama (Data & Request Flows).  
> **Source of Truth**: Alur navigasi UI, route handler API, dan service bisnis terpadu.  
> **Last Verified**: 2026-09-29

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

Alur validasi kehadiran memastikan karyawan benar-benar berada di lingkungan fisik kantor.
Jam server WIB adalah satu-satunya acuan bisnis; jam HP hanya untuk tampilan.

```text
[ Karyawan (PWA) ]                           [ API: /api/attendance ]                    [ attendanceService.ts ]
        │                                                │                                            │
        │── 0. GET /api/attendance/network ─────────────>│── hitung konteks server ─────────────────>│
        │<── serverWibNow/shiftDate/activeMode ──────────│<── shiftDate + mode + jadwal ─────────────│
        │── 1. Ambil koordinat GPS perangkat             │                                            │
        │── 2. Ambil foto selfie kamera (downsampled)    │                                            │
        │── 3. Kirim action+shiftDate yang diharapkan ──>│                                            │
        │                                                │── 4. Ekstrak IP klien pengirim             │
        │                                                │── 5. Delegasikan validasi ────────────────>│
        │                                                │                                            │── 6. Cek employee.bypassLocation
        │                                                │                                            │── 7. Verifikasi IP (Wi-Fi/Citranet)
        │                                                │                                            │── 8. Hitung deviasi jarak GPS
        │                                                │                                            │── 9. Hitung ulang target dari jam server
        │                                                │                                            │── 10. Transaksi atomik + lock per karyawan
        │<── 11a. Sukses: record + konteks server ───────│<── Hasil catatan presensi ─────────────────│
        │<── 11b. Konflik 409: refresh konteks ──────────│<── action/tanggal sudah berubah ──────────│
```

1. **Konteks Server Dulu**: Sebelum tombol aktif, PWA mengambil `GET /api/attendance/network` (`cache: no-store`, NetworkOnly di service worker) berisi `serverWibNow`, `serverWibDate`, `shiftDate`, `activeMode`, `isOvernight`, dan jadwal. Saat offline/gagal sinkron, tombol dinonaktifkan dan hanya jam server terakhir yang ditampilkan jujur (tidak memakai jam HP diam-diam).
2. **Pengambilan Bukti Instan di Klien**: Saat karyawan membuka halaman presensi, aplikasi PWA langsung menyalakan kamera (kamera depan atau belakang) dan menginisialisasi verifikasi Wi-Fi serta GPS di latar belakang dalam satu layar (*single-screen HUD*). Karyawan dapat langsung menjepret foto kehadiran (selfie atau foto lokasi meja kerja), yang dikompresi ringan di peramban ke dimensi maksimal 480px untuk menghemat bandwidth. Double-tap dikunci via `ref` agar maksimal satu POST.
3. **Validasi Jaringan (Faktor 1)**: Kecuali karyawan memiliki bendera `bypass_location: true`, IP publik pengirim dicocokkan dengan IP statis ISP Citranet (`202.152.141.27`) atau subnet lokal router kantor WIG (`192.168.20.0/24`).
4. **Validasi Geofence (Faktor 2)**: Koordinat GPS pengguna dihitung deviasinya terhadap koordinat titik kantor menggunakan rumus Haversine. Jarak harus berada di dalam batas toleransi radius lokasi kantor (default 100 meter).
5. **Mutasi Atomik Anti-Ganda**: Server mengunci baris karyawan (`SELECT ... FOR UPDATE`), baru me-resolve roster ber-tanggal H-1/hari ini di dalam transaksi yang sama, membaca tepat kunci attendance H-1 dan hari ini, menghitung ulang target dari jam server, lalu create/update kondisional. Mutasi roster memakai lock karyawan yang sama, sehingga presensi menunggu commit roster konkuren dan tidak memakai shift basi. Request basi/ganda mendapat `409` ("sudah tercatat"), bukan `500`. Kunci tanggal `date` tetap UTC-midnight agar cocok dengan data historis.
6. **Evaluasi Shift & Presensi Hari Libur**: Waktu server dicocokkan dengan jadwal kerja aktif karyawan (`WorkShiftDay`). Jika hari ini adalah jadwal libur (`isOff = true`):
   - Karyawan wajib menyertakan alasan penugasan/dinas (`offDayReason` minimal 3 karakter, ditegakkan di schema Zod).
   - Validasi toleransi jam masuk (`earlyCheckIn`) dan jam pulang (`earlyCheckOut`, `lateCheckOut`) dilewati.
   - Status kehadiran otomatis diset `present` (tanpa vonis terlambat).
   - Catatan disimpan dengan flag `is_off_day = true` untuk verifikasi audit HR.
   Pada hari kerja reguler, sistem mengevaluasi apakah jam clock-in memenuhi toleransi keterlambatan (`lateCheckIn`). Clock-out **selalu diterima** setelah record terbuka yang tepat ditemukan — tidak ada penolakan terlalu awal/terlambat dan tidak ada pembuatan lembur otomatis (lembur lewat pengajuan terpisah). Entri disimpan secara permanen pada tabel `attendance_records`.
7. **Resolusi Presensi Shift Lintas Hari (Overnight / Cross-Day)**:
   - Pada shift malam (`23:00 – 07:00`), karyawan melakukan Clock-In pada malam hari tanggal $D$ dan Clock-Out pada pagi hari $D+1$.
   - Record terbuka H-1 dapat ditutup kapan pun **sampai jendela clock-in shift berikutnya dimulai** (`startTime - earlyCheckIn`); tidak ada batas 14:00.
   - Setelah jendela shift berikutnya dimulai, tombol dianggap Clock-In shift baru dan record H-1 tetap terbuka untuk koreksi HR. Sistem tidak pernah mencari/menutup H-2 atau record historis.
   - Waktu jam kepulangan dinormalisasi dengan offset $+1440$ menit (misal: 07:00 WIB dinormalisasi menjadi menit ke-$1860$) sehingga toleransi dievaluasi secara akurat tanpa kesalahan perhitungan selisih negatif.
8. **Koreksi Presensi**: Karyawan mengajukan koreksi tanggal lampau dengan timestamp eksplisit `+07:00` dan opsi clock-out H+1; jam masuk H+1 diterima otomatis bila jadwal tanggal target adalah shift lintas hari yang aktif dan jam masih dalam jendela (`00:00` s/d `endTime + lateCheckOut`). Maksimal satu PENDING per karyawan+tanggal; tanggal yang sudah ada cuti/sakit disetujui atau menunggu persetujuan ditolak dengan pesan jelas (`409 LEAVE_CONFLICT`). Approval atomik **hanya oleh `WIG001` + `hr.manage`**; staf HR lapangan tetap employee biasa. Row lama dengan `assigned_manager_id = NULL` tetap kompatibel. Saat APPROVED, sistem menulis jam usulan sekaligus menghitung ulang status `present/late` dari jam masuk usulan + jadwal/toleransi shift aktif (aturan batas identik dengan clock-in normal); koreksi jam-pulang saja dan record off-day/cuti tidak mengubah status.
9. **Foto Lazy-Load HR**: Daftar `GET /api/attendance` tidak lagi membawa base64 foto massal (hanya flag `hasClockInPhoto/hasClockOutPhoto`); HR memuat satu foto via `GET /api/attendance/photos/[id]?phase=clockIn|clockOut`.

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

## 5. Flow: Green Meeting Harian

```text
[ GA / SUPER_ADMIN ]          [ API /api/green-meeting/* ]       [ greenMeetingService ]
          │                                 │                              │
          │── Pilih tanggal / buka sesi ───>│── requireAuth ──────────────>│
          │                                 │                              │── Cek kalender libur
          │                                 │                              │── Ambil/buat sesi harian
          │                                 │                              │── Buat presensi unit aktif = ALPA
          │<── Sesi + presensi + notulen ───│<─────────────────────────────│
          │                                 │                              │
          │── Catat DARI → KEPADA ─────────>│── Validasi payload ─────────>│
          │                                 │                              │── Simpan informasi/tugas
          │                                 │                              │── Simpan target polymorphic
          │                                 │                              │── Buat Deadline 1 jika tugas
          │                                 │                              │
          │── Hadir/Izin/Alpa atau bulk ───>│─────────────────────────────>│
          │── Perpanjang deadline + alasan >│─────────────────────────────>│
          │<── Data mutakhir ───────────────│<─────────────────────────────│

[ HR / Karyawan ] ── GET read-only ────────> sesi, notulen, tugas relevan, presensi, rekap
```

1. **Pemilihan Tanggal & Sesi**: GA membuat sesi via `POST sessions` (idempoten, tangkap P2002); `GET sessions` read-only 404 bila belum ada. HR/employee read-only tanpa auto-create.
2. **Hari Libur**: Hari yang terdapat dalam daftar mingguan `offDaysWeekly` atau `GreenMeetingHoliday` ditandai sebagai off-day. Konfigurasi kalender dikelola GA.
3. **Inisialisasi Presensi**: Hanya karyawan aktif dari `GreenMeetingUnit` aktif yang dibuatkan baris (1 baris = 1 karyawan). Setiap baris dimulai sebagai `ALPA`; GA mengubah per orang menjadi `HADIR`/`ALPA` via editor/bulk/quick, izin dicatat per dept via `excuses` dengan alasan wajib. Baris legacy arsip tidak dihapus.
4. **Sinkronisasi Partisipasi**: Menonaktifkan unit = soft-exclude (hentikan baris baru, riwayat tetap); tidak ada backfill/delete destruktif.
5. **Notulen DARI → KEPADA**: Writer baru khusus `TUGAS`. Sumber dapat berupa direksi/pimpinan, departemen, divisi, karyawan, atau pihak lainnya. Sasaran dapat berupa seluruh perusahaan atau kombinasi multi-departemen, multi-divisi, dan multi-karyawan. Arsip `INFORMASI` read-only tetap terbaca sesuai scope. Pencarian orang membaca master `Employee` berdasarkan nama/ID beserta jabatan dan struktur organisasi.
6. **Tugas & Multi-Deadline**: Catatan baru khusus `TUGAS` wajib memiliki Deadline 1. Setiap perpanjangan membuat `GreenMeetingDeadlineHistory` baru dengan nomor urut dan alasan; kuota mengikuti `maxDeadlineExtensions`.
7. **Koreksi Terlacak**: Edit notulensi `TUGAS` oleh GA mewajibkan alasan dan berjalan atomik: snapshot lama disimpan ke `GreenMeetingNoteRevision`, target diganti, note diperbarui, lalu audit log dibuat. Konversi menjadi Informasi ditolak; arsip `INFORMASI` hanya bisa direvisi isinya tanpa ganti jenis. Tugas yang sudah berjalan/selesai/dibatalkan atau pernah diperpanjang tidak dapat dikonversi menjadi informasi; deadline awal tidak dapat diganti setelah ada perpanjangan.
8. **Akses & Smart Filter**: Mutasi memerlukan `ga.manage`, role `GA_ADMIN`, atau override `SUPER_ADMIN`. HR pemantau boleh baca penuh (sessions/revisions/employees/recap); karyawan read-only scope sendiri (`GET sessions` filter attendances/notes ke dept/employee sendiri; `GET notes` tanpa filter dipaksa scope sendiri). Daftar tugas relevan tetap mencakup seluruh waktu.
9. **Navigasi GA**: Modul GA terdiri dari rute presensi, notulensi, tindak lanjut, pengaturan, dan rekap di bawah sub-dropdown Green Meeting. Root `/ga/green-meeting` mengarah ke presensi.

---

## 6. Flow: Penyerahan & BAST Aset General Affairs

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

---

## 7. Flow: Inspeksi Harian, Penugasan, dan Persetujuan Bulanan

```text
[ WIG002 + ga.manage ]             [ API /api/ga/cleaning/* ]          [ cleaningService ]
          │                                      │                              │
          │── Buat akun outsource ──────────────>│── validasi + hash password ─>│── UserAccount tanpa employee/role
          │── Jadwalkan penugasan ruangan ─────>│─────────────────────────────>│── Assignment interval WIB + sync role
          │<── Jadwal terbuka/aktif ────────────│<─────────────────────────────│

[ Petugas CLEANING_WORKER ]        [ API /api/cleaning/* ]             [ Checklist snapshot ]
          │── Buka ruangan hari ini ───────────>│── cek assignment efektif ───>│
          │── Ubah item checklist ─────────────>│─────────────────────────────>│── satu record/ruangan/tanggal WIB

[ GA ] ── tetapkan INSPECTED_BY + KNOWN_BY ──> persetujuan bulanan
[ Employee reviewer ] ── tanda tangan ───────> signature berversi; reopen wajib alasan dan audit
```

1. **Akun Outsource**: WIG002 membuat akun tanpa relasi employee melalui `/api/ga/cleaning/outsource-users`. Password wajib 8–128 karakter dan role petugas belum diberikan saat akun dibuat.
2. **Penugasan Berinterval**: Assignment dapat berlaku hari ini atau dijadwalkan mulai tanggal WIB berikutnya. Assignment yang belum berakhir menyinkronkan role `CLEANING_WORKER`, tetapi daftar ruangan petugas hanya membaca assignment yang sudah efektif. Jadwal yang belum mulai dapat dibatalkan; assignment berjalan diakhiri dengan alasan.
3. **Checklist Harian**: Saat petugas membuka ruangan yang ditugaskan, sistem membuat maksimal satu snapshot checklist per ruangan/tanggal WIB. Perubahan template berikutnya tidak mengubah snapshot yang sudah dibuat.
4. **Persetujuan Bulanan**: GA menetapkan dua reviewer employee. Masing-masing reviewer hanya dapat menandatangani role yang ditugaskan; reopen membuat versi baru, menyimpan alasan, dan mempertahankan histori tanda tangan.

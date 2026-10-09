# System Features & Capabilities — Presensi & HRIS WIG

> **Purpose**: Pengetahuan kapabilitas, modul fitur, dan batasan fungsional sistem.  
> **Source of Truth**: Implementasi fitur di layer UI (`src/app/`) dan service bisnis (`src/lib/services/`).  
> **Last Verified**: 2026-09-29

Dokumen ini menjelaskan kapabilitas fungsional yang disediakan oleh platform **Presensi & HRIS WIG** untuk berbagai aktor pengguna (Super Admin, HR, GA, dan Karyawan).

---

## 1. Modul Autentikasi & Kontrol Akses (RBAC)

### A. Login & Manajemen Sesi
- **Otentikasi Kredensial**: Login menggunakan username/email dan kata sandi dengan proteksi *timing-attack safe comparison* dan batas toleransi percobaan login gagal (*login attempt lockout*).
- **Session Cookie Terisolasi**: Sesi disimpan dalam cookie JWT `session` bertanda tangan kriptografis dengan flag `httpOnly`, `secure`, dan `sameSite: strict`.
- **Instant Session Revocation**: Setiap akun memiliki atribut integer `session_version`. Jika sesi pengguna dicabut atau kata sandi diubah, penambahan nilai versi sesi secara otomatis membatalkan seluruh token lama seketika.
- **Edge Route Guard**: Filter di `src/proxy.ts` memastikan pengguna tanpa sesi dialihkan ke halaman login, dan pengguna tanpa izin portal dialihkan ke halaman akses terlarang.

### B. Granular Role-Based Access Control
- **Struktur Multi-Role**: Sistem membedakan peran dasar (`SUPER_ADMIN`, `HR_ADMIN`, `GA_ADMIN`, `EMPLOYEE_USER`).
- **Atomic Permissions**: Otorisasi internal didasarkan pada kumpulan izin aktif (`hr.manage`, `ga.manage`, `employee.self`, `asset.read`, dll.); endpoint attendance menggabungkan permission HR dan relasi employee aktif.
- **Manajemen Akun HR**: HR Admin dapat membuat akun pengguna baru, mengatur role, dan memicu pengiriman kredensial awal secara otomatis melalui email SMTP.

---

## 2. Modul Kehadiran (Attendance)

### A. Presensi Terpadu 3-Faktor
- **Faktor 1 — Jaringan Wi-Fi Kantor**: Memverifikasi IP pengirim terhadap subnet lokal router kantor (`192.168.20.0/24`) atau IP publik statis ISP Citranet (`202.152.141.27`).
- **Faktor 2 — Geofencing GPS**: Memverifikasi koordinat perangkat terhadap radius geofence kantor (default 100 meter) menggunakan formula jarak Haversine.
- **Faktor 3 — Foto Kehadiran & Lokasi Kerja**: Mengambil foto bukti fisik langsung dari kamera perangkat (downsampled di browser ke max 480px) untuk audit kehadiran. Mendukung kamera depan (selfie) maupun kamera belakang (meja/lokasi kerja) dengan pembalik kamera instan tanpa batasan overlay biometrik artifisial.
- **Jam Server Otoritatif**: PWA mengambil konteks `GET /api/attendance/network` (`serverWibNow`, `shiftDate`, `activeMode`) sebelum tombol aktif; jam HP tidak menentukan logika bisnis. Mutasi membawa expected `action+shiftDate`; server menghitung ulang dalam transaksi atomik (konflik → `409`).
- **Offline Jujur**: Saat offline/gagal sinkron, tombol absen dinonaktifkan dan hanya jam server terakhir yang ditampilkan (tidak memakai jam HP diam-diam). Request context attendance selalu `NetworkOnly`/`no-store` di service worker.
- **Pengalaman Pengguna Instan (Single-Screen HUD)**: Kamera langsung aktif otomatis saat halaman dibuka tanpa tombol perantara, dilengkapi HUD mengambang terpadu untuk indikator status Wi-Fi dan GPS, serta tombol rana taktil di jangkauan jempol.
- **Bypass Location**: Dukungan flag pengecualian lokasi (`bypass_location: true`) bagi karyawan tugas luar atau manajemen tingkat atas.

### B. Presensi Hari Libur (Off-Day Attendance)
- **Soft-Allow Hari Libur Shift**: Mengizinkan presensi masuk (Clock-In) dan pulang (Clock-Out) pada hari libur kerja shift dengan wajib menginput alasan penugasan/keperluan dinas minimal 3 karakter.
- **Integritas Lokasi Penuh**: Verifikasi Wi-Fi kantor WIG dan geofencing GPS tetap diwajibkan 100% untuk mencegah fraud presensi dari rumah.
- **Bypass Pembatasan Jam**: Aturan jam masuk/pulang shift (`earlyCheckIn`, `lateCheckIn`, `earlyCheckOut`, `lateCheckOut`) dilewati untuk hari libur, dan status kehadiran tercatat sebagai `present` tanpa vonis terlambat.
- **Penanda Verifikasi HR**: Tampilan log presensi HR menampilkan badge teks elegan `Hari Libur` (ungu pastel) dengan tooltip alasan dinas, opsi filter cepat (Semua / Normal / Hari Libur), dan pencatatan kolom tipe kehadiran pada ekspor spreadsheet Excel.

### C. Alur Penyesuaian & Monitoring
- **Koreksi Presensi (Attendance Correction)**: Karyawan mengajukan perbaikan jam clock-in/out untuk tanggal lampau (timestamp `+07:00`, dukung clock-out H+1 dan clock-in H+1 otomatis untuk shift malam), maksimal 1 PENDING per tanggal; tanggal bercuti/sakit (disetujui/menunggu) ditolak dengan pesan jelas; approval atomik hanya oleh `WIG001` + `hr.manage` sekaligus menghitung ulang status `present/late` dari jam usulan. Staf HR lapangan tetap employee biasa.
- **Monitoring Tim Subordinat**: Atasan langsung dapat memantau log kehadiran, status keterlambatan, dan riwayat presensi bawahan langsungnya di `/employee/monitoring`.
- **Rekapitulasi HR**: Dasbor monitoring harian memakai tanggal server WIB; kartu ringkasan log memakai periode/filter yang sama dengan tabel; alasan cuti/libur selalu terlihat tanpa hover; badge `Lintas Hari H+1` memakai metadata shift efektif pada tanggal record sehingga record shift malam yang masih terbuka tetap dikenali; durasi tampil; approval koreksi dikunci per baris. Foto bukti dimuat lazy per klik (endpoint foto HR-only).
- **Monitoring Karyawan Belum Hadir**: Tab khusus pada Monitoring Presensi HR (`/dashboard/attendance`) untuk melacak karyawan aktif yang belum hadir pada tanggal evaluasi. Dilengkapi:
  - Klasifikasi status pintar: membedakan antara *Belum Hadir (Alpa)*, *Menunggu Persetujuan* (sudah mengajukan cuti/sakit, belum di-approve — tanpa tombol tagih WhatsApp), *Sedang Cuti / Sakit / Izin* (terintegrasi otomatis dengan pengajuan cuti yang disetujui HR), dan *Libur Shift*.
  - Ringkasan log 3-kolom (`Hadir Tepat Waktu`, `Terlambat`, `Total Record`) memakai kategori eksklusif dan periode/filter yang sama; tab Belum Hadir memiliki statistik sendiri (`Total Tidak Presensi`, `Alpa`, `Menunggu Persetujuan`, `Cuti/Sakit`, `Libur Shift`).
  - Pencarian instan (NIP & Nama), filter cascading Divisi & Departemen, serta filter kategori ketidakhadiran.
  - Tindakan cepat HR berupa tombol kontak WhatsApp langsung (`wa.me`) dengan template pesan konfirmasi kehadiran.
  - Ekspor data mandiri ke format Excel dan PDF khusus daftar karyawan belum hadir.

### D. Manajemen Shift & Operasional 24 Jam (Format 07:00)
- **Roster / Rotasi Mingguan**: HR memindahkan banyak karyawan sekaligus dengan rentang berlaku
opsional (`/dashboard/shifts/roster`): pilih karyawan, shift tujuan (nama + jam), preview berdasarkan shift efektif,
konfirmasi, dan audit. Penugasan diproses deterministik dan terkunci per karyawan; overlap ditolak 409. Assignment
masa depan dapat dibatalkan dengan membuka kembali jadwal sebelumnya. Daftar dan filter karyawan menampilkan shift
efektif hari ini beserta sumber roster/fallback.
- **UX roster (2026-09-29)**: tanggal lihat vs tanggal berlaku dipisah; tanggal akhir inklusif ("Hari terakhir, ikut termasuk") dengan chip hitung `12 Okt – 19 Okt (8 hari) • N orang`; tombol menyebut dampak; konfirmasi `useConfirm` bahasa keadaan-akhir; potensi bentrok tampil sebelum simpan; hasil pasca-simpan persisten inline; badge sumber (Roster/Dasar/Default) + jam + nama hari di daftar.
- **Jadwal Saya (2026-09-29)**: employee melihat jadwal 14 hari ke depan (`/employee/schedule`): tanggal + hari, nama shift + jam, badge Malam/Libur/Roster/Dasar, teks "tanggal X shift Y".
- **Validasi Ketat**: Jadwal shift wajib tepat 7 hari unik (`0–6`), format `HH:mm`, toleransi integer non-negatif; create/update/default atomik dalam transaksi; shift default/terpakai tidak dapat dihapus.
- **Clock-Out Selalu Diterima**: Absen pulang tidak pernah ditolak sistem (termasuk lewat 14:00 untuk shift malam) dan selalu menutup record H-1 yang tepat; setelah jendela shift berikutnya dimulai, request menjadi clock-in baru. Tanpa overtime otomatis.
- **Template Cepat 3-Shift 24 Jam**: Tombol preset satu-klik pada formulir shift HR (`/dashboard/shifts`) untuk mengonfigurasi jadwal standar:
  - **Shift 1: Pagi** (`07:00 – 15:00`)
  - **Shift 2: Siang** (`15:00 – 23:00`)
  - **Shift 3: Malam** (`23:00 – 07:00`, Lintas Hari / Overnight)
- **Indikator Visual Shift Lintas Hari**: Badge penanda otomatis `🌙 Lintas Hari (+1)` pada kartu shift dan tag `🌙 Pulang H+1` pada baris jadwal harian saat `endTime < startTime`.
- **Dukungan Backend Lintas Hari**: Perhitungan offset toleransi kepulangan (+1440 menit) dan resolusi otomatis clock-out shift malam ke rekor presensi hari kemarin ($H-1$).

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

### C. Green Meeting
- **Kepemilikan Operasional GA**: General Affairs mengelola konfigurasi, kalender, sesi, presensi departemen, notulen, tindak lanjut, dan laporan. Portal HR dan karyawan menyediakan pemantauan read-only; `SUPER_ADMIN` tetap memiliki override sistem pada mutasi API.
- **Antarmuka GA Multi-Page**: Operasional dipisahkan menjadi lima rute fokus: Presensi Hari Ini, Notulensi Rapat, Pelacak Tindak Lanjut, Kalender & Departemen, serta Laporan & Ekspor. Sidebar GA menggunakan sub-dropdown dan `/ga/green-meeting` mengarah ke halaman presensi.
- **Sesi Harian & Kalender**: Sesi menggunakan pemilih tanggal native, jam mulai yang dapat dipilih, ruangan dinamis, hari libur mingguan, dan tanggal libur khusus.
- **Presensi Per-Orang**: Karyawan aktif dibuatkan baris presensi berstatus awal `ALPA` (1 baris = 1 karyawan). GA menetapkan `HADIR` atau `ALPA` per orang via editor, bulk terpilih/massal, atau cari-nama-hadirkan cepat (`quick`). Izin dicatat di level departemen via `excuses` (dept-only, alasan wajib), bukan per orang. Nilai `IZIN`/`representativeName`/`permitReason` dipertahankan sebagai LEGACY arsip lama dan tetap dibaca, tidak dihapus. Menonaktifkan unit (soft-exclude) menghentikan baris baru tanpa menghapus riwayat.
- **Notulen DARI → KEPADA**: Asal pembahasan mendukung pimpinan/direksi, departemen, divisi, seorang karyawan, atau pihak kustom. Sasaran mendukung seluruh karyawan, multi-departemen, multi-divisi, atau multi-karyawan lintas struktur organisasi dengan pencarian nama/ID.
- **Koreksi Notulensi Terlacak**: GA dapat memperbaiki isi, asal, sasaran, dan deadline tugas dengan alasan wajib. Writer baru khusus `TUGAS`; arsip `INFORMASI` read-only (tetap dibaca/difilter, tidak bisa dibuat atau dikonversi menjadi Informasi). Sistem menyimpan snapshot sebelum perubahan sebagai riwayat revisi append-only, metadata editor, dan audit log; HR serta karyawan tetap read-only.
- **Tindak Lanjut Bertingkat**: Catatan baru khusus tugas wajib memiliki Deadline 1. Perpanjangan menambah riwayat deadline baru beserta alasan tanpa menimpa riwayat terdahulu dan dibatasi kuota konfigurasi.
- **Transparansi & Smart Filter**: HR memantau read-only via `/dashboard/green-meeting`; karyawan hanya melihat scope sendiri (dept/employee/divisi) untuk sesi dan notulen — `GET sessions` memfilter attendances/notes non-manager, `GET notes` tanpa filter dipaksa ke scope sendiri. Portal `/employee/green-meeting` menyediakan filter relevansi Personal, Departemen, Divisi, dan Untuk Semua yang mencocokkan target secara eksklusif berdasarkan `targetType`, serta daftar tugas relevan lintas waktu. Antarmuka karyawan dirancang mobile-first (zero-leak) dengan navigasi grid tersegmentasi, routing strip anti-overflow, dan kartu presensi adaptif.
- **Laporan**: GA dan HR dapat melihat rekap rentang tanggal maks 366 hari kalender inklusif (`includeSessions=false` default ringan, `true` untuk detail); arsip sesi lama dipisah (`deptStats` vs `archiveStats`); UI GA/HR berbagi hook/tabel rekap dan ekspor Excel per-orang / PDF per-departemen.

### D. Inspeksi Harian (Core Cleaning Loop)
- **Portal Petugas Terbatas (`/cleaning`)**: Petugas inspeksi yang ditetapkan masuk ke portal khusus terpisah dari portal GA. Akses dikontrol oleh role `CLEANING_WORKER` dengan permission `cleaning.execute`; ruangan yang terlihat tetap dibatasi oleh periode penugasan efektif pada tanggal WIB berjalan.
- **Checklist Harian Bersama**: Satu checklist per ruangan per tanggal WIB. Beberapa petugas yang ditetapkan ke ruangan yang sama dapat mengubah item secara bersamaan pada tanggal hari ini. Item yang belum disentuh menampilkan status `Belum diubah` tanpa aktor atau waktu.
- **Snapshot Immutable**: Checklist harian menyalin nama ruangan dan item template aktif saat pertama kali dibuat. Perubahan master (template, item) tidak pernah mengubah snapshot harian yang sudah ada.
- **Status Turunan**: Status harian dihitung dari item aktif, bukan disimpan terpisah. `SELESAI` hanya jika semua item aktif sudah selesai; jika ada yang dibatalkan, kembali ke `BELUM`.
- **Administrasi WIG002**: Hanya username `WIG002` dengan permission `ga.manage` yang dapat mengelola ruangan, template, item template, akun petugas outsource, penetapan petugas, dan daftar atasan tertinggi (pemantau, max 5, read-only tanpa paraf/TTD) melalui `/ga/cleaning/settings`. Akun outsource berdiri sendiri tanpa relasi employee, memakai password manual minimal delapan karakter, dan hanya dapat ditugaskan oleh akun GA yang membuatnya.
- **Penjadwalan Penugasan**: Penetapan mendukung `applyToToday`; jika tidak dipilih, masa tugas mulai pada tanggal WIB berikutnya. Jadwal yang belum mulai dapat dibatalkan, sedangkan penetapan berjalan diakhiri dengan alasan.
- **Sinkronisasi Role Atomik**: Penetapan yang belum berakhir menambahkan atau mempertahankan role `CLEANING_WORKER`; pengakhiran penetapan terakhir pada hari berjalan menghapus role dalam transaksi database yang sama. Tanggal efektif tetap menentukan ruangan yang boleh diakses.
- **Rekap Bulanan (`/ga/cleaning/recap`)**: WIG002 melihat matriks per ruangan untuk bulan lampau atau berjalan. Tanggal tanpa record menampilkan `BELUM`. Tanggal mendatang menampilkan pratinjau template tanpa membuat record.
- **Persetujuan Bulanan**: GA menetapkan dua reviewer internal (`INSPECTED_BY` dan `KNOWN_BY`). Reviewer menandatangani dari portal employee; tanda tangan berversi dapat dibuka kembali dengan alasan dan diekspor ke PDF.

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
- **Login Passkey (Sidik Jari / Face ID)**: Alternatif login tanpa password via WebAuthn; mode utama tanpa username (tempel jari langsung masuk via conditional autofill, kredensial discoverable `residentKey: required`); mode username tetap didukung untuk HP lama; pilihan jenis perangkat (HP ini/kunci USB/otomatis) saat daftar; modal penawaran sekali pasca-login (snooze 7 hari / tutup permanen); kelola perangkat di Pengaturan (tambah/cabut); reset password HR otomatis mencabut semua passkey; password tetap berlaku sebagai fallback.
- **E Meeting (Rapat & Ruang Rapat)**: Karyawan membuat rapat yang langsung berjalan (ruangan tersedia berdasarkan urutan pemesanan, tanpa persetujuan, tanpa memandang jabatan); peserta menerima/menolak beserta alasan; meeting diatur mandiri oleh employee (bentrok diselesaikan di lapangan; WIG002 sebagai regulator ruangan); penanda sibuk mandiri dan cuti terbaca sebagai tidak tersedia. Modul `Green Meeting` tetap terpisah.
- **Notulensi & Task Hasil Meeting**: Setiap meeting dapat dinotulensi oleh peserta mana pun (teks + alasan perubahan, tercatat di revisi). Task bersifat opsional dan dinamis antar-peserta (A→B,C,D, lalu C→A,B,D); penerima update status sendiri (Belum Dikerjakan/On Progress/Selesai); deadline dapat diperpanjang pemberi dengan kuota (penerima bisa mengajukan); overdue dihitung otomatis dengan badge merah; reminder push harian jam 07:00 WIB sampai task selesai (termasuk yang overdue); halaman agregat "Task Meeting Saya" di portal employee; halaman "Riwayat Meeting" per meeting (ringkasan + timeline kronologis, khusus yang bersangkutan) via satu endpoint agregat.
- **Selesaikan Meeting Lebih Awal**: Penyelenggara dapat menekan Selesaikan saat meeting berjalan (mis. selesai jam 3 padahal jadwal sampai jam 4) tanpa menunggu jam berakhir; seluruh task open otomatis di-submit ke system — push sekali per penerima + notifikasi in-app "Task Baru dari Meeting Selesai". Aksi final (Selesai task, Setujui/Tolak perpanjangan, Tolak undangan, Selesaikan meeting) selalu meminta konfirmasi anti-salah-klik.
- **Sistem Pengingat Ulang Tahun**: Pengingat harian otomatis jadwal ulang tahun staf (H-30, H-14, H-7) dengan alur persiapan custom dan ucapan selamat via email.
- **Web Push Notifications**: Notifikasi browser PWA via protokol VAPID untuk pengingat presensi dan update permohonan cuti.
- **Endpoint Cron Otomatis**: 5 jadwal tugas harian/bulanan otomatis di bawah `/api/cron/` terproteksi `CRON_SECRET`.
- **Cron Pengingat Appointment**: `POST /api/cron/appointment-reminder` tiap 15 menit via cron VPS (`Bearer CRON_SECRET`); offset dinamis bawaan yang diatur WIG002 (`appointment.reminder.offsets`); exactly-once per `(appointmentId, offsetMin)`; endpoint push 404/410 dibersihkan.

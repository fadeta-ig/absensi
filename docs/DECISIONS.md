# Architectural Decisions — Presensi & HRIS WIG

> **Purpose**: Why important architectural decisions were made.  
> **Source of Truth**: Architectural Decision Records verified via commit history and codebase.  
> **Last Verified**: 2026-10-11  

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
  - Positif: Aplikasi PWA sangat ringan, proses presensi instan dan hemat baterai/kuota. Desain UX disederhanakan menjadi *instant-on camera* dengan *single-screen HUD* dan peniadaan *overlay* biometrik wajah artifisial, memungkinkan karyawan leluasa mengambil selfie atau memotret meja/lokasi kerja dengan kamera belakang.
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

---

## ADR-006: Kepemilikan Permanen GA dan Pemisahan Green Meeting Menjadi Multi-Page

- **Decision**: Menetapkan General Affairs sebagai pemilik operasional permanen Green Meeting dan memisahkan dashboard GA menjadi lima halaman fokus di bawah sub-dropdown sidebar.
- **Context**: Modul menggabungkan pekerjaan harian yang berbeda: presensi, pencatatan notulen, monitoring tindak lanjut, kalender/partisipasi departemen, serta laporan. Satu halaman bertab menjadi padat dan tidak memberikan URL khusus per fungsi.
- **Chosen Approach**:
  1. `GreenMeetingConfig.picRole` dikunci ke `GA`; tidak tersedia alur transfer PIC.
  2. Mutasi API diotorisasi oleh `canManageGreenMeeting()` untuk `ga.manage`, `GA_ADMIN`, dan override `SUPER_ADMIN`; HR dan karyawan hanya membaca.
  3. Portal GA memakai rute `/ga/green-meeting/attendance`, `/notes`, `/tasks`, `/settings`, dan `/recap`, dengan sub-dropdown `AppShell` serta navigasi konteks `GreenMeetingNavTabs`.
  4. Root `/ga/green-meeting` mengarahkan pengguna ke halaman presensi.
- **Reason**: Memisahkan tanggung jawab UI, membuat setiap fungsi dapat di-bookmark, mempertahankan pola navigasi native `AppShell`, dan menghindari perpindahan kepemilikan yang bertentangan dengan mandat operasional.
- **Alternatives**: Mempertahankan satu halaman besar dengan tab atau membuat role/PIC Green Meeting dapat dipindahkan secara dinamis.
- **Consequences**:
  - Positif: Navigasi lebih jelas, halaman lebih fokus, URL stabil per fungsi, dan boundary pengelolaan GA eksplisit.
  - Negatif: Beberapa halaman perlu memuat data Green Meeting secara mandiri dan komponen navigasi bersama harus dijaga konsisten.

---

## ADR-007: Penyelesaian QC Inspeksi Alat Tanpa Paraf/Tanda Tangan (QC DONE + Snapshot Nama)

- **Decision**: QC menyelesaikan inspeksi dengan satu klik DONE plus catatan opsional; identitas pemeriksa direkam sebagai `checkedByEmployeeId` + `checkedByNameSnapshot` ("Checked by QC - [nama]"), tanpa pasangan reviewer, paraf, atau tanda tangan digital.
- **Context**: Modul cleaning memakai alur paraf/tanda tangan reviewer. Untuk inspeksi alat produksi yang frekuensinya tinggi dan pemeriksanya berganti-ganti, alur tanda tangan menambah friksi tanpa nilai audit tambahan.
- **Chosen Approach**: `checkEquipmentDone()` di `src/lib/services/equipmentService.ts` mengubah status `SUBMITTED → DONE`, menulis `checkedByNameSnapshot` dari nama karyawan aktif, dan mencatat audit `QC_DONE_EQUIPMENT_INSPECTION`. Skema tidak memiliki kolom reviewer/paraf/signature untuk equipment.
- **Alternatives**: Menyalin alur paraf/tanda tangan cleaning (kolom reviewer + `SignaturePad`) ke modul equipment.
- **Consequences**:
  - Positif: Satu klik selesai; riwayat tetap dapat diaudit via snapshot nama + `auditLog`.
  - Negatif: Tidak ada bukti kriptografis/Visual tanda tangan bila suatu saat dipersyaratkan regulasi — perlu ADR baru.

---

## ADR-008: Mode Bebas Inspeksi Alat Tanpa Penugasan + Antrean QC Pool Terbaru-di-Atas

- **Decision**: Karyawan internal aktif mana pun boleh checklist alat aktif mana pun kapan pun (tanpa tabel assignment); semua anggota QC melihat antrean `SUBMITTED` yang sama, diurutkan `submittedAt` menurun.
- **Context**: Penugasan per alat per orang membutuhkan administrasi roster yang tidak sebanding dengan manfaat untuk inspeksi rutin harian.
- **Chosen Approach**: `getMyEquipmentUnits()` mengembalikan semua unit aktif; `requireActiveInternalEmployee()` adalah satu-satunya syarat checklist. `getPendingEquipmentApprovals()` tanpa filter per orang, `orderBy: { submittedAt: "desc" }`.
- **Alternatives**: Tabel assignment unit↔karyawan dengan jadwal, atau antrean QC yang dipartisi per anggota.
- **Consequences**:
  - Positif: Nol administrasi penugasan; QC mana pun yang longgar dapat memproses antrean.
  - Negatif: Duplikasi checklist antar karyawan pada alat yang sama dimungkinkan; tidak ada klaim/lock antrean sehingga dua QC membuka item yang sama (yang kedua mendapat 409 setelah status berubah).

---

## ADR-009: Satu Tempat Upload Foto per Inspeksi (Maks 5, JPEG Kamera) + Foto QC Opsional Terpisah

- **Decision**: Bukti foto inspeksi dikumpulkan di satu panel per inspeksi (maks 5 berkas), bukan per item checklist; foto QC disimpan di tabel dan direktori terpisah (`equipment_qc_evidence`).
- **Context**: Checklist satu unit berisi banyak item; upload per item memperlambat pelaksana di lapangan dan menduplikasi foto yang sama.
- **Chosen Approach**: `EQUIPMENT_EVIDENCE_MAX_PHOTOS = 5` dan `EQUIPMENT_QC_EVIDENCE_MAX_PHOTOS = 5` di `src/lib/services/equipmentService.ts`; submit mensyaratkan ≥1 foto bila ada item `requirePhoto`. Validasi magic-byte JPEG menolak berkas non-kamera. Penyimpanan disk lokal `storage/equipment-evidence/` dan `storage/equipment-qc-evidence/`.
- **Alternatives**: Kolom foto per item inspeksi, atau satu tabel evidence gabungan pelaksana+QC.
- **Consequences**:
  - Positif: Alur foto cepat; foto QC tidak tercampur bukti pelaksana dan hanya dapat ditambah saat status `SUBMITTED`.
  - Negatif: Foto tidak terpetakan ke item spesifik; scaling horizontal butuh shared storage seperti foto kunjungan dinas.

---

## ADR-010: Pantau Atasan (Top Viewer) di Portal Employee via Capabilities `canTopView`, Bukan di Portal GA

- **Decision**: Rekap lintas unit untuk atasan ("Pantau Inspeksi Alat") tinggal di portal employee (`/employee/equipment/overview`), digating oleh `getEmployeeEquipmentCapabilities()` yang mengembalikan `{ canExecute, canReview, canTopView }`; atasan murni (topViewer tanpa peran QC) disembunyikan dari menu pekerja.
- **Context**: Portal GA hanya berisi master dan rekap operasional (`/ga/equipment/settings`, `/ga/equipment/recap`). Atasan produksi adalah karyawan biasa yang butuh pantauan tanpa hak checklist/QC, sehingga menunya harus mengikuti identitas karyawan, bukan portal GA.
- **Chosen Approach**: Daftar topViewer (maks 5) dan anggota QC (maks 20) disimpan di `appSetting` (`equipment.topViewers`, `equipment.qcMembers`) dan dikelola WIG002. `AllMenusSheet` menghitung `isTopViewOnly = canTopView === true && canReview !== true` untuk menyembunyikan menu "Inspeksi Alat" pekerja; halaman checklist mengarahkan atasan murni ke Pantau.
- **Alternatives**: Halaman pantau di portal GA dengan permission baru, atau mengandalkan relasi atasan-bawahan (`managerId`) untuk cakupan pantau.
- **Consequences**:
  - Positif: Tanpa permission/role baru — otorisasi memakai `employee.self` + identitas WIG002 + daftar AppSetting yang sudah ada.
  - Negatif: Cakupan pantau bersifat global (semua unit), bukan per tim/bawahan; perubahan daftar topViewer/QC bergantung pada cache 60 detik (`qcMembersCache`).

---

## ADR-011: Gate Kebijakan Mutu Tanpa Persistensi + Rencana Logout Harian

- **Decision**: Modal Kebijakan Mutu menghalangi semua jalur login di `/` dan status persetujuannya tidak disimpan di mana pun; setiap login wajib baca ulang. Konsep logout otomatis semua akun tiap 00:00 WIB disetujui pemilik (implementasi menyusul).
- **Context**: Pemilik mensyaratkan karyawan benar-benar membaca Kebijakan Mutu (MKI + WIG), bukan sekadar mencentang. Di codebase tidak ada flag `localStorage`/persistensi pada modal — itu disengaja, bukan kelalaian.
- **Chosen Approach**: `QualityPolicyModal` (`src/components/QualityPolicyModal.tsx`) dirender dengan `open={!policyAgreed}` di atas form password dan tombol passkey (`src/app/page.tsx`); `policyAgreed` hanya `useState(false)`. Checkbox aktif hanya setelah `hasReadAll` (scroll bawah, toleransi 24px, termasuk kasus konten muat tanpa scroll). Rencana midnight logout: sesi dengan `iat` sebelum 00:00 WIB hari berjalan dianggap kedaluwarsa di `getActiveSession()` (cek absolut berbasis jam server WIB, bukan jam klien); mass logout saat penerapan diizinkan pemilik.
- **Alternatives**: Gate sekali-sehari via flag tanggal (`localStorage`/DB) — ditolak pemilik karena melemahkan kewajiban baca. Invalidasi massal via increment `sessionVersion` semua user — ditolak implisit karena beban tulis DB dan hilangnya granularitas (cek waktu tanpa tulis DB sudah cukup).
- **Consequences**:
  - Positif: Frekuensi baca berlipat setiap hari; passkey tetap mempermudah autentikasi tanpa memangkas bacaan.
  - Negatif: Shift 3 malam (23:00–07:00, lintas hari) berpotensi kena tendang tengah shift — butuh keputusan lanjutan (warning + simpan draf vs pengecualian) sebelum implementasi.
  - Status: konsep disetujui 2026-10-11, belum diimplementasikan — jangan asumsikan logout tengah malam sudah berlaku.

---

## ADR-012: Status "Tidak Ada" per Item Kebersihan per Hari (klaim pekerja, bukan override master)

- **Decision**: Item checklist yang fasilitasnya tidak ada di ruangan ditandai "Tidak Ada" oleh pekerja pada checklist hari berjalan (tri-state Belum/Selesai/Tidak ada), dikeluarkan dari penyebut persen, dan ditampilkan eksplisit ke checker/topViewer.
- **Context**: Audit `hris_local` 2026-10-12 — Resepsionis memakai `Template Pembersihan Ruangan` (18 item); 8 item (Exhaust, Kipas, AC, Toilet, Teras, Dispenser, Kulkas, Cool Box) tidak ada di ruangan → 55,6% permanen → 0 paraf (gate 100% terkunci). Template spesifik per ruangan ditolak karena tidak skala (36 ruangan → puluhan template, 1 item global = edit puluhan template).
- **Chosen Approach**: Tombol "Tidak Ada" per item per hari (konfirmasi + dapat dibatalkan sebelum paraf); gate paraf = semua item diputuskan; tiap tanda menyimpan siapa + jam dan masuk audit log (`UPDATE_CLEANING_ITEM`); persen = selesai ÷ (aktif − tidakAda); simbol + legenda baru di matriks rekap/PDF; klaim beruntun N hari dieskalasi sebagai usulan override permanen ke WIG002. Skema: hanya kolom nullable baru, riwayat lama tetap valid.
- **Alternatives**: Override master per ruangan (ditunda — beban admin WIG002, layak sebagai tahap lanjutan dari data klaim); template klon per ruangan (ditolak — tidak skala); bypass diam-diam agar bisa paraf (ditolak — topViewer bingung melihat angka tidak 100%).
- **Consequences**:
  - Positif: Satu template tetap; paraf terbuka dengan angka jujur; klaim lapangan menjadi data master.
  - Negatif: Risiko klaim asal-asalan → dimitigasi visibilitas (siapa+jam) + audit + eskalasi WIG002; checklist hari berjalan yang sudah telanjur snapshot memakai status baru tanpa regenerasi (kolom default false).
  - Status: live 2026-10-12 (kolom `is_unavailable`, service + API + 4 UI + PDF + email + kartu usulan; bukti live: Resepsionis 55,6%→100% setelah 8 tanda, dikembalikan).

## ADR-013: Approval Final Inspeksi Alat oleh Satu Atasan Lapangan

- **Decision**: Tambah stage ke-4 `APPROVED`: `OPEN → SUBMITTED → DONE → APPROVED`. DONE kini berarti "terverifikasi QC, menunggu approval"; siapa pun dalam daftar approver (dinamis via setting `equipment.approvers` oleh WIG002, maks 5, kuorum 1) yang internal aktif dapat `DONE → APPROVED`. Satu arah, tanpa reject. Tanpa lock posisi inspektor/verifikator — semua tetap dinamis via assignment + QC pool.
- **Context**: Permintaan pemilik 2026-10-16 — atasan tertinggi (GM, topViewer read-only + penerima email) memantau; satu atasan lapangan (Deputy GM) memberi approval final. Tabel pantau/email 6 kolom: NO | ALAT | STATUS | INSPEKTOR | VERIFIKATOR | APPROVAL.
- **Chosen Approach**: Kolom nullable `approvedByEmployeeId/NameSnapshot/approvedAt` + relasi `EquipmentInspectionApprovedBy`; audit `APPROVE_EQUIPMENT_INSPECTION`; `canApprove` di capabilities; tombol di detail pantau employee; kartu approver di settings GA; DONE lama di-grandfather final tanpa approval.
- **Alternatives**: Quorum banyak approver (ditolak — pemilik minta satu orang); reject/return ke QC (ditolak — pertahankan filosofi satu arah).
- **Consequences**:
  - Positif: Akuntabilitas 3 lapis tanpa mengubah peran existing; approver bisa diganti tanpa deploy.
  - Negatif: Tanpa approver yang ditetapkan, final terkunci di DONE (UI settings memberi peringatan eksplisit).
  - Status: live lokal 2026-10-16 (bukti live: approve 1 inspeksi DONE via service → APPROVED + snapshot + audit, dikembalikan).

---

## ADR-014: PDF Rekap Bulanan Menampilkan Kode Nama Petugas Penanda Checklist

- **Decision**: Pada PDF rekap bulanan (`exportCleaningMatrixPdf`), sel item "selesai" mencetak kode singkatan nama petugas terakhir yang menandai item tersebut, bukan simbol "v"; daftar makna kode dicetak sebagai foot note di kaki PDF. Simbol `TA` (tidak ada), kosong (belum dikerjakan), dan `-` (tanggal mendatang) tidak berubah. Memodifikasi legenda ADR-012 untuk sel "selesai".
- **Context**: Permintaan pemilik 2026-10-20 — kolom checklist pada PDF harus terbaca siapa yang mencentang setiap item (contoh: Heri, Ismail, Dicky) tanpa memperlebar kolom harian; format singkatan diserahkan ke implementasi. Kolom harian hanya sekitar ±7,5 mm sehingga nama penuh tidak muat.
- **Chosen Approach**: `getCleaningPdfExportData` menyertakan `checkedBy` (displayName relasi `lastChangedBy` pada `CleaningDailyChecklistItem`) per sel hari; klien membentuk kode via `buildCheckerCodeList` (`src/lib/exportCleaningPdf.ts`): nama satu kata → 2 huruf pertama (Heri → HE), nama multi-kata → inisial dua token pertama (Andi Saputra → AS); bila dua nama menghasilkan kode sama, kode diperpanjang dari huruf nama sampai unik. Foot note "Catatan singkatan petugas" mengelompokkan 3 entri per baris (`HE = Heri  ·  IS = Ismail`). Sel "selesai" tanpa aktor (baris lama pra-ADR-012 atau mock tanpa data) tetap memakai "v" sebagai fallback.
- **Alternatives**: Kode manual yang diatur per petugas lewat settings GA (ditolak — beban konfigurasi tambahan untuk nilai estetis); menulis nama penuh di sel (ditolak — kolom terlalu sempit); tetap "v" + daftar petugas terpisah (ditolak pemilik — ingin terbaca langsung di kolom).
- **Consequences**:
  - Positif: Laporan cetak jadi akuntabel per penanda item; tanpa perubahan skema maupun permission; generator kode deterministik sehingga legenda stabil.
  - Negatif: Foot note menambah baris kiri bawah PDF (satu baris per 3 petugas); banyaknya petugas dibatasi ruang sebelum footer "Dicetak".
  - Status: live lokal 2026-10-20 (service `checkedBy` + klien PDF; dua suite test hijau: `CleaningSettingsPage`, `cleaningApprovalService`).

---

## ADR-015: Meeting Appointment Hanya Luring (Tanpa Daring)

- **Decision**: Appointment meeting hanya diselenggarakan luring di ruangan fisik. Pilihan "Tempat Pelaksanaan" (Ruang Fisik/Daring) dihapus; form langsung mewajibkan satu field "Ruangan". Data daring historis dipertahankan apa adanya sebagai arsip.
- **Context**: Revisi pemilik 2026-10-20 — daring tidak lagi diperlukan; satu-satunya sumber tempat adalah ruangan. Audit menemukan daring bukan tipe tersendiri melainkan keadaan implisit `roomId = null` + `meetingLink` terisi, tersebar di form employee, form jadwal ulang GA, `RoomSelect`, Zod, service, filter daftar, notifikasi, dan penanda revisi riwayat.
- **Chosen Approach**: Bertahap tanpa migrasi skema. (1) UI: hapus toggle mode + input tautan dari `AppointmentFormModal` dan halaman GA incoming; `RoomSelect` langsung "Ruangan *" wajib. (2) Kontrak: `appointmentCreateSchema`/`appointmentRescheduleSchema` mewajibkan `roomId`, field `meetingLink` dibuang dari skema dan interface service; `createAppointment`/`rescheduleAppointment` menolak tanpa ruangan (400) dan selalu menulis `meetingLink: null` untuk data baru/berubah. (3) Filter `__online__` dihapus. (4) Historis: kolom `meeting_link` dan snapshot `previousData.meetingLink` dipertahankan — detail/riwayat tetap menampilkan tautan lama sebagai "Daring", dan `meetingHistoryService` tetap memakai kehadiran kunci `meetingLink` sebagai penanda revisi jadwal ulang vs pembatalan.
- **Alternatives**: Langsung `roomId NOT NULL` + drop kolom `meeting_link` (ditolak untuk tahap ini — memblokir baris historis daring di dump produksi dan merusak penanda revisi riwayat); menghapus tampilan daring historis (ditolak pemilik — data lama tetap terbaca sebagai historis).
- **Consequences**:
  - Positif: Satu sumber kebenaran tempat (ruangan) sehingga cek bentrok ruangan selalu berjalan; form lebih sederhana tanpa pertanyaan mode.
  - Negatif: Kolom `roomId` di skema tetap nullable demi arsip; penegakan wajib berada di Zod + service. Edit/jadwal ulang appointment daring warisan akan mewajibkan pemilihan ruangan dan membersihkan tautannya.
  - Status: live lokal 2026-10-20 (UI + Zod + service + filter; suite `appointmentService` hijau, `tsc` bersih).

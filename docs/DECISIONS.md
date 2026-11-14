# Architectural Decisions — WITS (Wijaya Integrated Talent System)

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
- **Status: SUPERSEDED (2026-10-23)**: mode bebas tanpa penugasan di atas tidak lagi berlaku. Codebase saat ini mewajibkan penugasan (`EquipmentAssignment`, global via `unitId` null, efektif pada hari WIB ini): `startEquipmentInspection`, `updateEquipmentInspectionItem`, `submitEquipmentInspection`, dan `saveEquipmentEvidence` semuanya memanggil `assertAssignee` (403 bila tidak ditugaskan), dan tanpa penugasan efektif = tanpa menu/akses (DOMAIN.md §H, DATA_MODEL.md §6). Bagian antrean QC pool (tanpa filter per orang, terbaru-di-atas) tetap berlaku.

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

---

## ADR-016: Task Meeting Menjadi Modul Tugas Saya dengan Evolusi Data di Tempat

- **Decision**: Pengelolaan task hasil meeting (pengumpulan, revisi, verifikasi, perpanjangan, pembatalan, daftar agregat, monitoring) pindah ke modul employee **Tugas Saya** (`/employee/my-tasks`, detail `/employee/my-tasks/[id]`, Pantau Tugas di `/employee/my-tasks/monitoring`). Pembuatan task tetap di detail meeting mengikuti aturan sumbernya; task manual tidak disediakan (keputusan pemilik).
- **Context**: Task perlu menjadi modul yang dapat menerima sumber lain di masa depan (mis. Green Meeting) tanpa kehilangan data production yang berjalan. Audit data lokal (salinan backup production) menemukan task menempel pada riwayat meeting, reminder log exactly-once, dan status legacy yang harus berperilaku sama persis.
- **Chosen Approach**: Evolusi di tempat, bukan penyalinan data. (1) Tabel fisik `meeting_tasks` dan sub-tabelnya tetap menjadi penyimpanan; hanya ditambah penanda `sourceType`/`sourceId` yang di-backfill dari `appointmentId`. (2) Lapisan `workTaskService` menyediakan akses generik My Task di atas adapter Appointments (`meetingTaskService`); endpoint dan UI lama menjadi shim/redirect selama transisi. (3) Key/tag notifikasi lama dipertahankan agar status baca dan exactly-once tidak reset; tautan push/notifikasi diarahkan ke detail Tugas Saya. (4) Deadline, verifikasi, overdue, dan pembatalan mengikuti policy sumber (Appointments: maks 2 sekuens/2 tiket; meeting batal membatalkan task belum final).
- **Alternatives**: Membuat tabel generik baru lalu menyalin seluruh data lama (ditolak — risiko terbesar justru pada penyalinan FK, riwayat, lampiran, dan reminder log); mempertahankan pengelolaan penuh di detail meeting (ditolak pemilik — pengelolaan harus terpusat di Tugas Saya).
- **Consequences**:
  - Positif: Tidak ada baris data yang berpindah sehingga kehilangan/duplikasi dapat dibuktikan tidak terjadi (rekonsiliasi ID identik); rollback cukup mengembalikan UI/route; sumber baru cukup menambah adapter dan nilai `sourceType`.
  - Negatif: Nama fisik tabel tetap `meeting_task*` untuk sementara; fungsi notulensi tetap di service lama dan pemecahan fisik tabel ditunda.
  - Status: live lokal 2026-11-02 (skema + backfill `hris_local`, API/UI Tugas Saya, build + suite task/appointment hijau; kegagalan `AppointmentDayDetail` 1 test bersifat pre-existing pada file yang tidak diubah).

---

## ADR-017: PIC Notulensi Wajib, Pemberi Task PIC/Pimpinan Rapat, dan Pimpinan Rapat Setara Penyelenggara

- **Decision**: (1) PIC notulensi wajib dipilih dari peserta internal saat membuat meeting dan tidak dapat dikosongkan (dapat diganti saat meeting berjalan). (2) Task hasil meeting hanya dapat dibuat oleh PIC notulensi atau pimpinan rapat; form buat task mewajibkan pilihan Pemberi Tugas (dapat dicari, verifikator) dan Penerima Tugas. (3) Meeting memiliki pimpinan rapat (`leaderEmployeeId`, wajib untuk meeting baru dari peserta internal) yang berwenang setara penyelenggara: mengubah/menyelesaikan/membatalkan meeting, menandai kehadiran, menulis notulensi, mengganti PIC, dan memberi task.
- **Context**: Di lapangan penyelenggara sering hanya membuatkan meeting untuk orang lain (mis. resepsionis) dan tidak hadir, sehingga meeting membutuhkan pemimpin yang benar-benar berada di ruangan. Sebelumnya PIC bersifat opsional dan task dapat dibuat peserta mana pun, sehingga tanggung jawab notulensi dan pemberian task tidak jelas pemiliknya.
- **Chosen Approach**: Penegakan berlapis UI + Zod + service untuk PIC dan pimpinan rapat (peserta internal aktif dari daftar peserta); guard `createMeetingTask` menolak selain PIC/pimpinan rapat dan pemberi terpilih disimpan sebagai `assignerEmployeeId`; helper `isMeetingOrganizer` (pembuat ATAU pimpinan rapat) dipakai pada ubah/batalkan/selesaikan/tandai hadir serta kewenangan notulensi. Kolom pimpinan rapat nullable di skema agar meeting historis tetap terbaca; meeting lama tanpa PIC/pimpinan tidak dapat diberi task sebelum PIC ditunjuk.
- **Alternatives**: PIC tetap opsional dengan bawaan semua peserta (ditolak — tidak ada pemilik notulensi/task yang jelas); pemberi task bebas dari semua peserta (ditolak pemilik); pimpinan rapat sebagai peran permission baru (ditolak — cukup relasi per-meeting, tanpa permission code baru, konsisten pola yang ada).
- **Consequences**:
  - Positif: Tanggung jawab notulensi, pemberian task, dan kepemimpinan rapat jelas per meeting; penyelenggara yang tidak hadir tidak lagi menjadi hambatan operasional.
  - Negatif: Form buat meeting menambah dua pilihan wajib (PIC + pimpinan rapat) yang keduanya harus peserta internal; meeting historis tanpa keduanya perlu ditunjuk PIC-nya sebelum dapat diberi task.
  - Status: live lokal 2026-11-03 (skema `leader_employee_id` di `hris_local`, guard service + form, suite meeting task/appointment hijau).

---

## ADR-018: Submodul Tambah Task — Sumber Operasional dengan Gate Persetujuan Penerima

- **Decision**: (1) Tugas di luar meeting dibuat lewat submodul **Tambah Task** di dalam Tugas Saya (`/employee/my-tasks/create`), bukan modul terpisah; kategori pertama yang aktif adalah **Operasional**, sedangkan CAPA Internal/Eksternal hanya penanda "Menyusul" (future dev). (2) Pemberi tugas otomatis karyawan yang login; penerima bebas dari seluruh karyawan AKTIF master HR (endpoint direktori khusus berfield minimal, karena `/api/employees` untuk karyawan biasa hanya menampilkan hierarki bawahannya). (3) Setiap penerima melewati gate persetujuan: `MENUNGGU_PERSETUJUAN` → terima menjadi `OPEN`, tolak beralasan menjadi `DITOLAK`; setelah itu mesin submit/verifikasi/deadline task meeting berlaku sama, tanpa jendela meeting untuk kelola pemberi.
- **Context**: Pemilik website membutuhkan tempat memberi tugas di luar E-Meeting/Green Meeting; ADR-016 sebelumnya menyatakan task manual tidak disediakan, keputusan pemilik terbaru menggantikan batasan tersebut khusus sumber Operasional dengan persetujuan penerima sebagai pembeda utama dari task meeting.
- **Chosen Approach**: Evolusi di tempat lanjutan ADR-016 — tabel `meeting_tasks*` tetap dipakai, `appointmentId` dibuat nullable, `sourceType=OPERASIONAL` dengan `sourceId` = id task, adapter baru `operationalTaskService` (buat/direktori/persetujuan), dan `meetingTaskService` membedakan guard jendela berdasarkan `sourceType` sehingga tidak ada duplikasi mesin lampiran/verifikasi/deadline. Push persetujuan dikirim setelah commit; query daftar tetap terindeks dan terbatasi.
- **Alternatives**: Tabel generik baru khusus tugas lepas (ditolak — menduplikasi submission/lampiran/revisi/reminder); memakai `/api/employees` apa adanya (ditolak — karyawan biasa tidak melihat semua karyawan); task langsung `OPEN` tanpa persetujuan (ditolak pemilik — penerima harus acc dulu).
- **Consequences**:
  - Positif: Satu inbox/detail/monitoring konseptual untuk semua sumber; penerima mengendalikan penerimaan tugas di luar meeting; CAPA tinggal menambah adapter + format tanpa mengubah wadah.
  - Negatif: `meetingTaskService` kini melayani dua sumber dengan percabangan jendela berdasarkan `sourceType`; Pantau Tugas menilai kedua sumber (filter sumber tersedia) dengan penerima `DITOLAK`/`DIBATALKAN` dikecualikan dari penilaian.
  - Status: live lokal 2026-11-03 di branch `feat/task-sources-operasional-capa` (skema di-`db push` ke `hris_local` dengan rekonsiliasi jumlah baris tidak berubah, suite Operasional/Tugas Saya hijau).

---

## ADR-019: Resepsionis E-Meeting sebagai Penyelenggara Semua Meeting via Modul Employee

- **Decision**: (1) WIG002 menunjuk max 5 resepsionis (`AppSetting` `meeting.receptionists`, karyawan internal aktif) via tab Resepsionis di pengaturan appointment GA. (2) Resepsionis bertindak sebagai penyelenggara untuk SEMUA meeting dari modul E-Meeting employee: buat, ubah jadwal/ruangan/peserta, batalkan, selesaikan, tandai hadir, ganti pimpinan rapat/PIC, tulis notulensi, baca riwayat + workspace penuh. (3) Tanpa hak `force` paksa-bentrok (tetap WIG002-only, di-strip di route) dan tanpa kelola master ruangan/pengingat/daftar peran. (4) Gate "beri task hanya PIC/pimpinan rapat" tetap per-meeting (resepsionis pun tidak bypass, sama seperti penyelenggara biasa). (5) Kata "resepsionis" hanya muncul di UI WIG002; di UI employee/push ia tampil sebagai Penyelenggara biasa.
- **Context**: Di lapangan resepsionis (mis. ID-25020044) membuatkan dan mengatur meeting untuk orang lain, tetapi guard organizer (`requesterEmployeeId`/`leaderEmployeeId`) menolaknya mengelola meeting yang bukan miliknya. ADR-017 menyebut kasus ini sebagai motivasi pimpinan rapat, namun pimpinan rapat bersifat per-meeting dan tidak menyelesaikan kebutuhan pengatur global.
- **Chosen Approach**: Tanpa permission/role/tabel baru (konsisten CONSTRAINTS): daftar `AppSetting` + guard service meniru pola `meeting.topViewers` (cache 60 detik, validasi aktif+internal saat tulis, mati sendiri bila nonaktif). Helper `isMeetingReceptionist`/`canManageAnyMeeting` di `appointmentService`; guard mutasi memakai `managerAll` (= WIG002 ATAU resepsionis) khusus izin, sedangkan cek `force` tetap `operator` (= WIG002 saja); `isPrivileged` di `meetingTaskService` dan `allowed` di `meetingHistoryService` mencakup resepsionis; kapabilitas employee diperluas `{ canMonitor, canManageAll }` untuk gating tombol kelola di detail meeting.
- **Alternatives**: Permission code baru (mis. `meeting.manage`) + role baru (ditolak — menambah permukaan RBAC untuk kebutuhan daftar dinamis yang sudah terbukti polanya); resepsionis diberi akses portal GA (ditolak pemilik — kerjanya dari modul employee); resepsionis boleh force-bentrok seperti WIG002 (ditolak pemilik — tetap ikut antrean ruangan).
- **Consequences**:
  - Positif: Satu pola AppSetting untuk tiga peran dinamis (pemantau read-only, resepsionis kelola); audit tetap mencatat aktor asli; push reschedule memakai rumusan netral ber-nama.
  - Negatif: Dua konsep "penyelenggara" (per-meeting vs global) hanya dibedakan di log audit dan daftar WIG002 — karyawan biasa tidak bisa membedakan dari UI (disengaja).
  - Status: live lokal 2026-11-06 (setting + guard + UI GA/employee + suite hijau).

---

## ADR-020: Resepsionis sebagai Penyelenggara Tidak Dihitung Sibuk (Bebas Cek Bentrok Diri)

- **Decision**: (1) ID resepsionis aktif yang tercatat sebagai requester/pembuat meeting dikeluarkan dari cek bentrok orang + penanda sibuk saat buat (`involvedIds`) dan reschedule (`checkOverlapIds`). (2) Hit jalur-requester di `hasEmployeeOverlap` diabaikan khusus ID resepsionis aktif; hit jalur-peserta tetap memblokir siapa pun termasuk resepsionis yang benar-benar diundang. (3) Cek bentrok ruangan, cek bentrok peserta lain, dan larangan `force` tetap berlaku penuh untuk resepsionis. (4) Tampilan `getAvailability` diselaraskan agar tidak merah palsu. (5) Resepsionis nonaktif atau gagal baca daftar kembali ke perilaku normal (fail-closed).
- **Context**: Di lapangan resepsionis (verifikasi `hris_local`: `meeting.receptionists = ["ID-25020044"]`, Daffa aktif, 4 meeting sebagai requester) adalah admin ruangan yang wajib bisa booking banyak ruangan di jam yang sama untuk meeting orang lain. Logika lama memasukkan `session.employeeId` pembuat ke `involvedIds` dan lengan-requester `hasEmployeeOverlap`, sehingga meeting keduanya mental 409 atas namanya sendiri. ADR-019 memberi izin kelola tanpa menyentuh cek bentrok.
- **Chosen Approach**: Helper `receptionistRequesterDropIds` di `appointmentService` (daftar AppSetting cache 60 detik + cek aktif 1 query, fail-closed); filter di call-site create/reschedule + pisah lengan peserta/requester di `hasEmployeeOverlap`/`getAvailability`. Tanpa skema, permission, atau role baru.
- **Alternatives**: Kecualikan SEMUA requester dari cek orang (ditolak pemilik — maunya khusus resepsionis, perilaku penyelenggara biasa tidak berubah); bebas semua cek termasuk ruangan/peserta (ditolak — chaos antrean ruangan, setara memberi `force` yang sudah ditolak di ADR-019); flag "saya hadir" di form (ditolak untuk sekarang — butuh ubah skema/form/validasi, overkill).
- **Consequences**:
  - Positif: Resepsionis bisa booking tak terbatas di jam yang sama (beda ruangan); peserta/pimpinan rapat/PIC tetap diproteksi bentrok; ruangan tetap first-come-first-served.
  - Negatif: Dua perilaku requester (resepsionis vs biasa) — didokumentasikan di ADR ini dan FEATURES; karyawan biasa yang "membuatkan meeting untuk orang lain" tetap kena cek diri.
  - Status: live lokal 2026-11-06 (service + 9 test D1 + suite 71 hijau + `tsc` bersih).

---

## ADR-021: Tiga Peran Meeting (Penyelenggara/Pimpinan/PIC) Setara Kelola Meeting & Task Masing-Masing

- **Decision**: (1) `isMeetingOrganizer` mencakup PIC notulensi (`notulisEmployeeId`) selain pembuat dan pimpinan rapat — berlaku per-meeting. Dampak: PIC dapat reschedule (jadwal/ruangan/peserta), membatalkan, menyelesaikan lebih awal, menandai hadir, mengganti pimpinan rapat/PIC, dan membuka Pengaturan Meeting — sama seperti dua peran lain (WIG002/resepsionis tidak berubah, tetap via `managerAll`). (2) Kelola task E-Meeting saat berjalan (edit isi/deadline, tambah/hapus penerima, perpanjang, batalkan) dibuka untuk ketiga peran meeting itu selain pemberi task; verifikasi tetap eksklusif pemberi/privileged. Operasional tanpa meeting tidak berubah (pemberi/privileged saja).
- **Context**: Permintaan pemilik: tiga peran (penyelenggara yang membuatkan, pimpinan yang memimpin di lapangan, PIC yang mencatat) harus punya hak penuh atas meeting dan task masing-masing — buat/edit/batalkan/reschedule sebelum berjalan; selesaikan + ganti pimpinan/PIC saat berjalan; edit/batalkan task saat berjalan. Sebelumnya PIC dikecualikan dari semua guard meeting, dan kelola task mensyaratkan assigner sehingga peran non-assigner mendapat 403.
- **Chosen Approach**: Perluasan predikat + fallback `isMeetingRoleManager` per-appointment (3 kolom peran, fail-closed bila meeting tak ditemukan); UI `canManage`/Kelola Tugas mengikuti peran yang sama; test 403 lama ditulis ulang dengan aktor benar-benar luar + test baru per peran. Tanpa skema, permission, endpoint, atau kontrak API baru; pesan error dipertahankan.
- **Consequences**:
  - Positif: Satu definisi "pengelola meeting" untuk ketiga peran; tidak ada lagi 403 untuk PIC yang sah; verifikasi tetap terkunci pada pemberi (model verifikator tidak melemah).
  - Negatif: Peran non-assigner kini bisa mengubah task orang lain dalam meetingnya — disengaja per permintaan pemilik; audit `revision` mencatat aktornya.
  - Status: live lokal 2026-11-10 (service + UI + test peran + suite hijau + `tsc` bersih).

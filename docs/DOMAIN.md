# Domain Model & Business Rules — Presensi & HRIS WIG

> **Purpose**: Business/domain knowledge.  
> **Source of Truth**: Business services logic, calculations, and domain workflows.  
> **Last Verified**: 2026-10-11

Dokumen ini memetakan konsep domain, terminologi bisnis, aturan operasional, dan relasi utama dalam ekosistem **Presensi & HRIS WIG**.


---

## 1. Core Domain Concepts

### A. Employee & Organizational Structure
- **Division (`divisions`)**: Unit bisnis atau divisi utama perusahaan (contoh: `HRGA & IT`).
- **Department (`departments`)**: Departemen spesifik yang bernaung di bawah divisi.
- **Position (`positions`)**: Jabatan struktural atau fungsional (contoh: `Manager`, `Staff`).
- **WorkShift (`work_shifts`) & WorkShiftDay (`work_shift_days`)**: Pola jadwal kerja karyawan. Menentukan jam masuk (`startTime`), jam pulang (`endTime`), hari libur (`isOff`), serta toleransi keterlambatan (`lateCheckIn`) dan pulang awal (`earlyCheckOut`).
- **Pola Operasional 24 Jam 3-Shift & Rotasi**: Operasional 24 jam non-stop di WIG dikelola melalui 3 shift kerja terstandarisasi berbasis format `07:00`:
  - **Shift 1 (Pagi)**: `07:00 – 15:00` WIB (8 jam kerja).
  - **Shift 2 (Siang)**: `15:00 – 23:00` WIB (8 jam kerja).
  - **Shift 3 (Malam / Lintas Hari)**: `23:00 – 07:00` WIB (8 jam kerja, melintasi tengah malam ke H+1).
  - **Shift Lintas Hari (Overnight / Cross-Day)**: Jika `endTime < startTime`, shift diidentifikasi sebagai lintas hari. Rekor presensi diatribusikan ke tanggal mulai shift (`shiftDate = H-1`). Record terbuka H-1 dapat ditutup kapan pun sampai jendela clock-in shift berikutnya dimulai; clock-out selalu diterima dan tidak membuat lembur otomatis. Setelah jendela shift berikutnya dimulai, request menjadi clock-in tanggal shift baru dan record lama diselesaikan via koreksi HR. Perhitungan toleransi dinormalisasi dengan offset +1440 menit (24 jam).
  - **Model Rotasi Karyawan**: Rotasi antar shift dicatat ber-tanggal pada `ShiftAssignment` (`employeeId`, `shiftId`, `effectiveFrom` inklusif, `effectiveTo` eksklusif/null). Kolom `shiftId` pada master `Employee` dipertahankan sebagai fallback bila tidak ada assignment mencakup tanggal. Semua penilaian (presensi, belum-hadir, koreksi, cuti) memakai shift yang berlaku pada tanggal kejadian, bukan shift saat ini.
- **Employee (`employees`)**: Data induk karyawan yang memuat biodata, tipe ikatan kerja, kuota cuti tahunan, gaji pokok, serta relasi hierarki atasan-bawahan (`managerId` merujuk ke `employeeId` atasan).
- **EmploymentType**: Status kepegawaian: `PERMANENT`, `CONTRACT`, `PROBATION`, atau `INTERN`.
- **Status Kepegawaian & Riwayat**: Transisi status aktif/non-aktif dicatat ke `employee_status_histories` lengkap dengan tanggal efektif, alasan, dan identitas admin yang mengubah status.

### B. Presensi & Validasi 3-Faktor
- **AttendanceRecord (`attendance_records`)**: Catatan harian jam clock-in, jam clock-out, koordinat lokasi, dan tautan foto selfie pegawai. Unik per kombinasi `(employeeId, date)`.
- **Aturan Jaringan Wi-Fi Kantor**: Memvalidasi IP pengirim terhadap subnet lokal MikroTik RB4011 (`192.168.20.0/24`) dan IP gateway `192.168.20.1` serta IP publik statis Citranet (`202.152.141.27`).
- **Aturan Geofencing**: Menghitung jarak Haversine antara koordinat perangkat saat presensi dengan titik lokasi kantor di tabel `Location` (`radius` default 100 meter).
- **Bypass Location**: Atribut khusus pada pegawai (`bypass_location: true`) yang membebaskan validasi jaringan Wi-Fi dan geofencing (diperuntukkan bagi staf lapangan, kurir, atau level manajemen tertentu).
- **Presensi Hari Libur (`isOffDay = true`)**: Karyawan yang masuk pada hari libur shift diizinkan melakukan presensi masuk dan pulang asalkan tetap memenuhi validasi jaringan Wi-Fi kantor dan GPS (radius ≤ 100m). Karyawan wajib mencantumkan alasan kehadiran (`offDayReason` minimal 3 karakter). Aturan toleransi keterlambatan dan pembatasan jam pulang dilewati, dan status kehadiran tercatat `present`. Kehadiran hari libur tidak secara otomatis mencairkan upah lembur (lembur tetap memerlukan tiket persetujuan resmi `OvertimeRequest` sesuai PP 35/2021).
- **AttendanceCorrection (`attendance_corrections`)**: Permohonan perbaikan jam masuk/keluar oleh karyawan (`PENDING`, `APPROVED`, `REJECTED`); administrasi list/approval hanya oleh `WIG001` + `hr.manage`. Approval menghitung ulang `present/late`; tanggal dengan cuti/sakit pending/approved tidak dapat dikoreksi.

### C. General Affairs (GA) & Asset Management
- **AssetCategory (`asset_categories`)**: Kategori aset dengan prefix kode inventaris (misal: Laptop `LPT-`, Kendaraan `KND-`).
- **Asset (`assets`)**: Fisik aset perusahaan dengan pelacakan nomor seri, IMEI, vendor, tanggal pembelian, dan garansi.
- **AssetKondisi**: Status kondisi fisik: `BAIK`, `KURANG_BAIK`, `RUSAK`.
- **AssetStatus**: Siklus penggunaan aset: `AVAILABLE` (di brankas GA), `IN_USE` (dipegang karyawan/tim), `MAINTENANCE` (servis vendor), `RETIRED` (afkir), atau `COMPANY_OWNED`.
- **HolderType**: Tipe pemegang: `EMPLOYEE`, `FORMER_EMPLOYEE`, `TEAM`, `GA_POOL`, `COMPANY_OWNED`.
- **AssetHistory (`asset_histories`)**: Audit trail setiap mutasi aset (penyerahan, pengembalian, pergantian kondisi).
- **AssetBastDocument (`asset_bast_documents`)**: Dokumen digital Berita Acara Serah Terima (BAST) yang diunggah saat serah terima aset, tersimpan sebagai berkas biner (`MediumBlob`).
- **AssetInspection & InspectionChecklistItem**: Audit checklist kondisi fisik aset oleh GA.
- **AssetTicket (`asset_tickets`)**: Tiket keluhan kerusakan atau permintaan perangkat baru dari karyawan ke tim GA (`TicketStatus`: `PENDING`, `IN_PROGRESS`, `APPROVED`, `REJECTED`, `RESOLVED`).
- **SimCard (`sim_cards`)**: Inventaris kartu SIM korporat yang dipinjamkan ke staf tertentu.

### D. Green Meeting
- **Pemilik Operasional**: General Affairs bertanggung jawab permanen atas konfigurasi, sesi, presensi per-orang, notulen, tindak lanjut, dan laporan. HR dan karyawan berperan sebagai pembaca/pemantau; Super Admin memiliki override sistem.
- **Peserta Rapat**: Partisipasi dikelola per `Department` melalui `GreenMeetingUnit` (soft-exclude: nonaktif hentikan baris baru, riwayat tetap). Baris presensi dibuat per karyawan aktif.
- **Status Presensi**: per-orang `HADIR` atau `ALPA` (semua baris baru dimulai sebagai `ALPA`); izin dicatat di level dept, bukan per orang. Keterwakilan dept: `HADIR` bila ≥1 anggotanya hadir, `IZIN` bila ada catatan izin, `ALPA` bila tidak ada keduanya.
- **Jenis Notulen**: `TUGAS` membutuhkan tindak lanjut dan Deadline 1 (writer baru khusus Tugas). `INFORMASI` = arsip read-only peninggalan lama: tetap dibaca/difilter dengan badge, tidak bisa dibuat baru atau dikonversi menjadi Informasi.
- **Rute DARI**: Sumber pembahasan dapat berupa direksi/pimpinan, departemen, divisi, seorang karyawan, atau pihak kustom/eksternal.
- **Rute KEPADA**: Sasaran dapat berupa semua karyawan, satu atau beberapa departemen, satu atau beberapa divisi, atau beberapa karyawan lintas struktur organisasi. Scope bersifat eksklusif sesuai `targetType`: target karyawan hanya cocok ke `employeeId`, target departemen hanya ke `departmentId`, dan target divisi hanya ke `divisionId`; metadata organisasi target personal tidak boleh memperluas relevansi.
- **Multi-Deadline**: Deadline awal dan setiap perpanjangan disimpan kronologis. Perpanjangan membutuhkan alasan dan tidak boleh melebihi `maxDeadlineExtensions`.
- **Kalender Operasional**: Hari libur dapat ditentukan secara mingguan dan per tanggal khusus. Ruangan serta jam mulai dapat berubah per sesi.

### E. Payroll, BPJS, & Perpajakan (PPh 21)
- **PayrollComponent (`payroll_components`)**: Master komponen gaji berupa tunjangan (`ALLOWANCE`) atau potongan (`DEDUCTION`).
- **EmployeePayrollComponent**: Nilai spesifik komponen gaji per karyawan.
- **PayslipRecord (`payslip_records`)**: Rekap slip gaji bulanan per pegawai (`period`), terdiri dari gaji pokok, lembur, dan rincian item tunjangan/potongan (`payslip_items`).
- **Formula Lembur PP 35/2021**:
  - Hari kerja biasa: Jam pertama dikalikan 1.5x upah per jam, jam berikutnya 2x upah per jam.
  - Hari libur: Jam 1-7 dikalikan 2x upah per jam, jam ke-8 dikalikan 3x, jam ke-9 dst dikalikan 4x upah per jam.
  - Upah per jam = `1 / 173 * Gaji Pokok`.
- **Formula BPJS**:
  - BPJS Kesehatan: 4% ditanggung pemberi kerja, 1% ditanggung pekerja (dengan batas upah maksimal).
  - BPJS Ketenagakerjaan: JKK (0.24% - 1.74%), JKM (0.3%), JHT (3.7% pemberi kerja, 2% pekerja), JP (2% pemberi kerja, 1% pekerja dengan batas upah).
- **PPh 21 TER 2024**:
  - Status PTKP dikelompokkan ke Kategori TER:
    - Kategori A: TK/0 (54 jt), TK/1 (58.5 jt), K/0 (58.5 jt).
    - Kategori B: TK/2, TK/3, K/1, K/2.
    - Kategori C: K/3.
  - Pajak bulanan dihitung: `Penghasilan Bruto * Tarif Efektif Rata-rata (TER)`.

### F. Pelaporan Kunjungan Dinas (Field Visits)
- **VisitReport (`visit_reports`)**: Pelaporan kunjungan ke lokasi klien dengan jam clock-in/out, nama klien, alamat, tujuan, dan ringkasan hasil.
- **VisitPhoto (`visit_photos`)**: Bukti visual kunjungan. Dilengkapi verifikasi integritas:
  - `sha256Original`: Hash gambar mentah.
  - `distanceToTargetMeters`: Jarak deviasi posisi GPS perangkat terhadap koordinat tujuan klien.
  - `stampedPath`: File gambar yang telah dicetak stempel resmi anti-manipulasi via engine `sharp`.

### G. Layanan Mandiri Karyawan (Self-Service)
- **LeaveRequest (`leave_requests`)**: Pengajuan cuti (Cuti Tahunan, Sakit, dsb.). Saldo cuti tahunan default 12 hari per tahun. Cuti disetujui mengurangi saldo `usedLeave`. Satu rentang pengajuan dibatasi maksimal 366 hari kalender inklusif; rentang lebih panjang ditolak eksplisit agar perhitungan hari kerja roster tidak terpotong diam-diam.
- **LetterRequest (`letter_requests`)**: Permohonan surat keterangan resmi: `SK_KERJA`, `KET_PENGHASILAN`, `KET_MASIH_BEKERJA`, `BPJS`.
- **TodoItem (`todo_items`)**: Catatan tugas personal karyawan.

### H. Inspeksi Alat (Equipment)
- **Mode penugasan**: WIG002 menentukan siapa dapat modul Inspeksi Alat (per unit atau global `unitId` null); tanpa penugasan efektif = tanpa menu dan tanpa akses checklist. Karyawan internal aktif (karyawan aktif + akun aktif; outsource selalu ditolak) yang ditugaskan boleh mengisi checklist unitnya kapan pun. Tidak ada peran pelaksana khusus. Klik alat tidak pernah membuat checklist diam-diam: tanpa draf OPEN, user memilih eksplisit `Lihat riwayat unit` vs `Mulai checklist baru`.
- **Siklus satu arah tanpa reject**: `OPEN → SUBMITTED → DONE → APPROVED`. Item hanya dapat diubah saat `OPEN`; submit hanya dari `OPEN`; QC DONE hanya dari `SUBMITTED`; approval final hanya dari `DONE`. Tidak ada transisi mundur atau reject. Unit tidak dapat dinonaktifkan selama masih ada inspeksi `OPEN`/`SUBMITTED`. DONE lama (periode sebelum approval, Okt 2026) di-grandfather sebagai final tanpa approval.
- **Batalkan Berjalan**: Pemulai dapat `OPEN → CANCELLED` (tombol Batalkan + konfirmasi; hanya pemulai; audit `CANCEL_EQUIPMENT_INSPECTION`). Baris dipertahankan sebagai riwayat, disembunyikan dari antrean, rekap, dan "terakhir dicek". Foto di disk tidak dihapus.
- **Syarat submit**: Semua item aktif sudah dinilai (`isPass` terisi semua); bila ada item aktif bertanda `requirePhoto`, wajib ada minimal 1 foto dokumentasi.
- **Foto**: Satu tempat upload per inspeksi yang mewakili semua item — maksimal 5 foto pelaksana (hanya saat `OPEN`) + maksimal 5 foto QC opsional (hanya saat `SUBMITTED`). Foto harus JPEG valid dari kamera dengan batas ukuran dari setting.
- **QC pool**: Anggota QC (maks 20 orang, ditetapkan WIG002 dari karyawan internal aktif) semuanya melihat antrean `SUBMITTED` yang sama. Service mengembalikan terbaru-di-atas; UI antrean default mengurut terlama-menunggu-dulu (bisa dibalik). Penyelesaian cukup klik DONE + catatan opsional — tanpa paraf/tanda tangan — dan nama pemeriksa disimpan sebagai snapshot (`checkedByNameSnapshot`) agar riwayat stabil bila nama berubah.
- **Riwayat**: Tab `Riwayat Saya` (inspeksiku semua status, detail read-only + tombol `Lanjutkan mengerjakan` untuk draf OPEN) dan `Riwayat unit` (lintas pelaksana per unit, read-only, untuk yang ditugaskan/QC/atasan).
- **Atasan read-only (topViewer)**: Maks 5 orang, ditetapkan WIG002 dari karyawan internal aktif; hanya boleh membaca master unit dan rekap, tidak dapat mutasi apa pun.
- **Approval final (approver)**: Daftar atasan lapangan (dinamis via setting `equipment.approvers` oleh WIG002, maks 5; kunci lama `equipment.approverId` tunggal tetap dibaca sebagai fallback). Kuorum 1: siapa pun di daftar yang internal aktif dapat `DONE → APPROVED` (audit `APPROVE_EQUIPMENT_INSPECTION`, snapshot `approvedByNameSnapshot`). Tombol di detail pantau employee (`canApprove`) dan menu `Persetujuan Final Alat` (antrean DONE khusus approver, tanpa perlu assignment/QC/topViewer). Email rekap 6 kolom: NO | ALAT | STATUS | INSPEKTOR | VERIFIKATOR | APPROVAL (`Menunggu Verifikasi` / `Menunggu Approval` / `Selesai`; `OPEN` disembunyikan; roster bernomor dengan `(-)` bagi yang belum bertindak).
- **WIG002**: Satu-satunya peran yang mengelola master (template, item template, unit, anggota QC, topViewer).
- **Menu gating**: `getEmployeeEquipmentCapabilities` menghasilkan `canExecute` (punya penugasan efektif), `canReview` (anggota QC), `canTopView` (topViewer), `canApprove` (approver) untuk menggerbang menu pelaksana / antrean QC / rekap atasan / tombol approval.

### I. Kebijakan Mutu & Kewajiban Baca Tiap Login
- Setiap kunjungan halaman login (`src/app/page.tsx`) menampilkan `QualityPolicyModal` (`src/components/QualityPolicyModal.tsx`) menutupi form password maupun tombol passkey: modal tidak dapat ditutup (`disableClose`, `closeOnBackdrop={false}`), checkbox persetujuan aktif hanya setelah konten di-scroll hingga bawah (`hasReadAll`), tombol "Lanjut ke Login" aktif hanya setelah checkbox dicentang.
- Status persetujuan hanya state React sesaat (`useState(false)`); sengaja tanpa `localStorage`/persistensi agar karyawan wajib membaca ulang setiap login — keputusan pemilik perusahaan.
- Isi: 3 poin Kebijakan Mutu PT Mahakarya Kosmetika Indonesia (Mutu, Kepatuhan, Inovasi Berkelanjutan) + 3 poin PT Wijaya Inovasi Gemilang (Worth Quality, Integrity Compliance, Growth Improvement).
- Intent pemilik (konsep disetujui 2026-10-11, implementasi menyusul — jangan asumsikan sudah berlaku): semua akun otomatis logout tiap 00:00 WIB agar frekuensi baca berlipat; mass logout saat penerapan diizinkan. Passkey mempermudah autentikasi tetapi tidak memangkas kewajiban baca.

### J. Status "Tidak Ada" pada Item Kebersihan (live 2026-10-12)
- Latar: template disamaratakan ke semua ruangan, padahal fasilitas tiap ruangan beda. Kasus Resepsionis 2026-10-12 (audit `hris_local`): 8 dari 18 item template tidak ada di ruangan → 55,6% permanen → paraf reviewer terkunci → topViewer bingung.
- Aturan: pekerja menandai item "Tidak Ada" per checklist harian via tombol (konfirmasi, dapat dibatalkan sebelum paraf). Status tri-state: Belum / Selesai / Tidak ada. Template tidak dipecah per ruangan.
- Hitungan: persen = selesai ÷ (aktif − tidakAda); paraf terbuka bila semua item sudah diputuskan (selesai ATAU tidakAda). Menyelesaikan item bertanda = 409.
- Visibilitas: tiap tanda mencatat siapa + jam (reuse `lastChangedBy*`), masuk audit log `UPDATE_CLEANING_ITEM`, tampil eksplisit di modal paraf, badge pantau (`N tidak ada`), matriks rekap, PDF (sel selesai = kode singkatan petugas + foot note daftar nama [ADR-014], simbol `TA` + legenda), dan email rekap harian — tidak disembunyikan dari 2 checker maupun topViewer.
- Lanjutan: `GET /api/ga/cleaning/unavailable-candidates` + kartu usulan di rekap GA — item yang diklaim ≥ minDays hari diusulkan ke WIG002 untuk dikunci permanen (tindak lanjut manual).
- Batasan: hanya kolom `is_unavailable` default-false; baris riwayat lama tetap valid tanpa migrasi.

### K. Verifikasi Task Meeting (dirombak 2026-10-27: kerja dibuka setelah meeting selesai)
- Jendela buat: task baru HANYA selama meeting berjalan (`SCHEDULED` + now di dalam `[startAt, endAt)`). Belum mulai, sudah lewat jam, `COMPLETED`, atau `CANCELLED` → 409.
- Jendela kerja: submit + verifikasi (`TERIMA`/`REVISI`) HANYA setelah meeting selesai (stored `COMPLETED`, atau jam sudah lewat menunggu flip cron ±15 menit). Meeting masih berjalan → 409.
- Jendela kelola pemberi: buat, ubah isi/deadline/tambah-hapus penerima, perpanjang, batalkan — HANYA selama meeting berjalan. Setelah meeting diselesaikan, struktur task dikunci; yang tetap berjalan hanya pengumpulan + verifikasi.
- Deadline wajib diisi tanpa default; tanpa deadline task tidak dapat dibuat.
- Task selesai = kunci permanen: bila seluruh penerima `SELESAI`/`DIBATALKAN`, perpanjang/ubah/batalkan ditolak 409.
- Peran: pemberi (assigner = verifikator) mutlak atas deadline & revisi; GA/WIG002 override. Penerima hanya mengerjakan + mengumpulkan.
- Status per penerima: `OPEN` (baru) → submit+lampiran wajib 1–5 file → `ON_PROGRESS` (menunggu verifikasi) → `TERIMA` = `SELESAI` / `REVISI` = balik `OPEN` + tenggat revisi (unlimited). Self-claim selesai DILARANG.
- Overdue: patokan SUBMIT, sticky per penerima. Tanpa submit sebelum tenggat awal → OVERDUE permanen (termasuk varian `OVERDUE (DONE)` bila akhirnya disetujui).
- Tiket: 2 deadline per penerima (awal + 1 perpanjangan; terkonsumsi saat idle lewat deadline); revisi gratis tiket.
- Pengajuan perpanjangan penerima DIHAPUS (keputusan pemilik 2026-10-26).
- Giver CRUD: ubah judul/rincian/deadline/tambah-hapus penerima (hapus hanya bila belum ada submit); tanpa hard delete.

---

## 2. Important Business Relationships & Cardinality

1. `Division` 1 ── * `Department` 1 ── * `Employee`
2. `Position` 1 ── * `Employee`
3. `Employee` (Manager) 1 ── * `Employee` (Subordinates) [Hierarki Self-Relation]
4. `Employee` 1 ── 0..1 `UserAccount` [Akun Login]
5. `Employee` 1 ── * `AttendanceRecord` (Unik per Tanggal)
6. `Employee` 1 ── * `LeaveRequest` / `OvertimeRequest` / `PayslipRecord`
7. `Employee` 1 ── * `Asset` [Aset yang sedang dipegang]
8. `AssetCategory` 1 ── * `Asset` 1 ── * `AssetHistory` 1 ── * `AssetBastDocument`
9. `VisitReport` 1 ── * `VisitPhoto`
10. `UserAccount` * ── * `Role` * ── * `Permission` [RBAC Many-to-Many]
11. `EquipmentTemplate` 1 ── * `EquipmentUnit` 1 ── * `EquipmentInspection` 1 ── * `EquipmentInspectionItem`

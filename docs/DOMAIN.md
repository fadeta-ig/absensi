# Domain Model & Business Rules — Absensi & HRIS WIG

> **Purpose**: Business/domain knowledge.  
> **Source of Truth**: Business services logic, calculations, and domain workflows.  
> **Last Verified**: 2026-09-10  

Dokumen ini memetakan konsep domain, terminologi bisnis, aturan operasional, dan relasi utama dalam ekosistem **Absensi & HRIS WIG**.


---

## 1. Core Domain Concepts

### A. Employee & Organizational Structure
- **Division (`divisions`)**: Unit bisnis atau divisi utama perusahaan (contoh: `HRGA & IT`).
- **Department (`departments`)**: Departemen spesifik yang bernaung di bawah divisi.
- **Position (`positions`)**: Jabatan struktural atau fungsional (contoh: `Manager`, `Staff`).
- **WorkShift (`work_shifts`) & WorkShiftDay (`work_shift_days`)**: Pola jadwal kerja karyawan. Menentukan jam masuk (`startTime`), jam pulang (`endTime`), hari libur (`isOff`), serta toleransi keterlambatan (`lateCheckIn`) dan pulang awal (`earlyCheckOut`).
- **Employee (`employees`)**: Data induk karyawan yang memuat biodata, tipe ikatan kerja, kuota cuti tahunan, gaji pokok, serta relasi hierarki atasan-bawahan (`managerId` merujuk ke `employeeId` atasan).
- **EmploymentType**: Status kepegawaian: `PERMANENT`, `CONTRACT`, `PROBATION`, atau `INTERN`.
- **Status Kepegawaian & Riwayat**: Transisi status aktif/non-aktif dicatat ke `employee_status_histories` lengkap dengan tanggal efektif, alasan, dan identitas admin yang mengubah status.

### B. Presensi & Validasi 3-Faktor
- **AttendanceRecord (`attendance_records`)**: Catatan harian jam clock-in, jam clock-out, koordinat lokasi, dan tautan foto selfie pegawai. Unik per kombinasi `(employeeId, date)`.
- **Aturan Jaringan Wi-Fi Kantor**: Memvalidasi IP pengirim terhadap subnet lokal MikroTik RB4011 (`192.168.20.0/24`) dan IP gateway `192.168.20.1` serta IP publik statis Citranet (`202.152.141.27`).
- **Aturan Geofencing**: Menghitung jarak Haversine antara koordinat perangkat saat presensi dengan titik lokasi kantor di tabel `Location` (`radius` default 100 meter).
- **Bypass Location**: Atribut khusus pada pegawai (`bypass_location: true`) yang membebaskan validasi jaringan Wi-Fi dan geofencing (diperuntukkan bagi staf lapangan, kurir, atau level manajemen tertentu).
- **AttendanceCorrection (`attendance_corrections`)**: Permohonan perbaikan jam masuk/keluar oleh karyawan yang membutuhkan persetujuan (`AssessmentStatus`: `PENDING`, `APPROVED`, `REJECTED`) dari atasan/manajer.

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

### D. Payroll, BPJS, & Perpajakan (PPh 21)
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

### E. Pelaporan Kunjungan Dinas (Field Visits)
- **VisitReport (`visit_reports`)**: Pelaporan kunjungan ke lokasi klien dengan jam clock-in/out, nama klien, alamat, tujuan, dan ringkasan hasil.
- **VisitPhoto (`visit_photos`)**: Bukti visual kunjungan. Dilengkapi verifikasi integritas:
  - `sha256Original`: Hash gambar mentah.
  - `distanceToTargetMeters`: Jarak deviasi posisi GPS perangkat terhadap koordinat tujuan klien.
  - `stampedPath`: File gambar yang telah dicetak stempel resmi anti-manipulasi via engine `sharp`.

### F. Layanan Mandiri Karyawan (Self-Service)
- **LeaveRequest (`leave_requests`)**: Pengajuan cuti (Cuti Tahunan, Sakit, dsb.). Saldo cuti tahunan default 12 hari per tahun. Cuti disetujui mengurangi saldo `usedLeave`.
- **LetterRequest (`letter_requests`)**: Permohonan surat keterangan resmi: `SK_KERJA`, `KET_PENGHASILAN`, `KET_MASIH_BEKERJA`, `BPJS`.
- **TodoItem (`todo_items`)**: Catatan tugas personal karyawan.

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

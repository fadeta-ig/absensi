/**
 * Script Generator Buku Panduan Sistem HRIS — WIG Attendance (Enterprise Edition)
 * Comprehensive, Strictly Typed, & Modular Generation Engine.
 */

import { jsPDF } from "jspdf";
import path from "path";

const OUTPUT_PATH = path.resolve(__dirname, "Buku_Panduan_WIG_Attendance.pdf");

// ─── TYPES & INTERFACES ─────────────────────────────────────────────

type ContentBlock =
    | { type: "paragraph"; text: string[] }
    | { type: "bullet"; items: string[] }
    | { type: "numbered"; items: string[] };

interface Section {
    title: string;
    type: "chapter" | "subchapter";
    content: ContentBlock[];
}

// ─── THE CONTENT ARCHITECTURE ────────────────────────────────────────

const manualData: Section[] = [
    // ════ BAB 1 ════
    {
        title: "1. EXECUTIVE SUMMARY & KEUNGGULAN SISTEM",
        type: "chapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "WIG Attendance System bukan sekadar alat pencatat kehadiran, melainkan sebuah Enterprise HRIS (Human Resource Information System) terpadu.",
                    "Sistem ini dirancang untuk menjawab tantangan operasional HR dan GA modern dengan mengotomatisasi proses manual, mengeliminasi fraud (kecurangan) karyawan, dan memastikan kepatuhan pajak."
                ]
            },
            {
                type: "bullet",
                items: [
                    "Zero-Fraud Attendance: Dilengkapi Face Recognition AI dan Anti-Fake GPS untuk memastikan kehadiran 100% akurat.",
                    "Auto-Payroll & Tax Compliance: Perhitungan gaji terintegrasi PPh 21 (TER) dan BPJS yang sepenuhnya otomatis.",
                    "General Affairs (GA) Portal: Manajemen Aset, Peringatan Garansi/SIM Expired, dan Sistem Tiketing terpusat.",
                    "Employee Empowerment: Portal mandiri transparan yang mengurangi pertanyaan repetitif ke HR hingga 80%.",
                    "Scalable Architecture: Dibangun dengan teknologi mutakhir (Next.js 15+, Node.js) menjamin stabilitas korporat."
                ]
            }
        ]
    },
    // ════ BAB 2 ════
    {
        title: "2. PERSYARATAN & ARSITEKTUR SISTEM",
        type: "chapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Sistem berbasis Cloud dan PWA (Progressive Web App) ini mengusung konsep Zero-Install. Pengguna hanya membutuhkan web browser untuk mengakses semua fitur enterprise."
                ]
            },
            {
                type: "bullet",
                items: [
                    "Browser Modern: Mendukung penuh Google Chrome, Safari, Firefox, dan Microsoft Edge versi terbaru.",
                    "Akses Perangkat: Kompatibel di Smartphone, Tablet, maupun Desktop/Laptop.",
                    "Perangkat Keras: Membutuhkan kamera depan yang berfungsi dengan baik untuk Face Recognition.",
                    "Lokasi (GPS): Mewajibkan layanan lokasi aktif pada perangkat untuk validasi Geofencing.",
                    "Konektivitas: Memerlukan koneksi internet yang stabil (4G/5G/Wi-Fi)."
                ]
            }
        ]
    },
    // ════ BAB 3 ════
    {
        title: "3. PORTAL KARYAWAN (EMPLOYEE SELF-SERVICE)",
        type: "chapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Portal Employee dirancang untuk kemandirian karyawan. Mengusung antarmuka yang modern, bersih, dan intuitif, karyawan memiliki kendali atas absensi, tugas, dan benefit mereka."
                ]
            }
        ]
    },
    {
        title: "3.1. Beranda (Dashboard KPI Pribadi)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Menyajikan ringkasan kinerja harian karyawan secara visual."
                ]
            },
            {
                type: "bullet",
                items: [
                    "Melihat informasi status absensi hari ini (Jam Clock-In dan Clock-Out).",
                    "Melihat total sisa cuti tahunan secara real-time.",
                    "Membaca pengumuman penting yang di-pin oleh HRD di bagian atas layar."
                ]
            }
        ]
    },
    {
        title: "3.2. Absensi (Face Recognition & GPS)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Fitur inti dengan perlindungan Anti-Fraud. Karyawan wajib melakukan ini setiap hari kerja."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Buka menu Absensi (ikon sidik jari / kamera di navigasi utama).",
                    "Sistem akan meminta izin Kamera dan Lokasi (Klik Allow / Izinkan).",
                    "Posisikan wajah menghadap layar (pastikan pencahayaan cukup).",
                    "Sistem memvalidasi wajah dan memastikan lokasi GPS berada di radius Geofence kantor.",
                    "Jika validasi GPS dan Biometrik (Match) berhasil, klik tombol Clock-In / Clock-Out.",
                    "Sistem merekam data dengan akurasi detik."
                ]
            }
        ]
    },
    {
        title: "3.3. Riwayat Absensi",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Riwayat Absensi.",
                    "Gunakan filter bulan/tahun untuk melihat rekap kehadiran lampau.",
                    "Karyawan dapat melihat apakah status kehadiran mereka Hadir, Terlambat (Late), atau Tidak Hadir."
                ]
            }
        ]
    },
    {
        title: "3.4. Permintaan Surat Keterangan (Dokumen)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Fitur interaktif bagi karyawan untuk mengajukan permohonan surat-surat administratif ke departemen HR tanpa perlu tatap muka."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Buka menu Dokumen & Surat di navigasi kiri.",
                    "Klik tombol 'Minta Surat' untuk membuka Form Permintaan.",
                    "Pilih Jenis Surat yang dibutuhkan: Surat Keterangan Kerja, Keterangan Penghasilan, Surat Masih Aktif Bekerja, atau Keterangan BPJS.",
                    "Isi Tujuan Penggunaan Surat secara spesifik (Contoh: 'Untuk pengajuan KPR di Bank BCA').",
                    "Klik 'Kirim Permintaan ke HR'.",
                    "Pantau status secara real-time melalui Timeline (Menunggu -> Diproses -> Siap Diambil) beserta catatan dari tim HR."
                ]
            }
        ]
    },
    {
        title: "3.5. Pengajuan Cuti",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Cuti, lalu klik 'Ajukan Cuti Baru'.",
                    "Pilih jenis cuti: Tahunan, Pribadi, Sakit, atau Melahirkan.",
                    "Tentukan rentang tanggal (Tanggal Mulai dan Tanggal Selesai).",
                    "Isi deskripsi atau alasan cuti.",
                    "Khusus Cuti Sakit, karyawan wajib mengunggah Surat Keterangan Dokter (PDF/JPG).",
                    "Klik Kirim. Status akan berubah menjadi 'Pending' menunggu persetujuan HR."
                ]
            }
        ]
    },
    {
        title: "3.6. Monitoring Karyawan (Untuk Supervisor)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Fitur eksklusif bagi Karyawan yang memiliki jabatan manajerial atau supervisor."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Buka menu Monitoring.",
                    "Supervisor dapat melihat daftar bawahan satu divisi.",
                    "Melihat status kehadiran bawahan hari ini secara real-time (Hadir, Belum Absen, Cuti)."
                ]
            }
        ]
    },
    {
        title: "3.7. Pembacaan WIG News",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu News/Berita.",
                    "Pilih artikel atau kebijakan perusahaan terbaru untuk dibaca selengkapnya.",
                    "Sistem melacak log bahwa karyawan telah membaca pengumuman penting tersebut."
                ]
            }
        ]
    },
    {
        title: "3.8. Pengajuan Lembur",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Lembur (Overtime).",
                    "Klik Ajukan Lembur Baru.",
                    "Tentukan Jam Mulai dan Jam Selesai.",
                    "Sistem otomatis mengidentifikasi apakah lembur jatuh di Hari Kerja atau Hari Libur.",
                    "Tulis rincian pekerjaan yang dilakukan.",
                    "Klik Ajukan. Sistem akan meneruskannya ke HR."
                ]
            }
        ]
    },
    {
        title: "3.9. Melihat Slip Gaji",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Payslip (Slip Gaji).",
                    "Sistem akan meminta ulang kata sandi (Password) demi privasi.",
                    "Pilih periode bulan dan tahun yang ingin dilihat.",
                    "Sistem menampilkan rincian: Gaji Pokok, Tunjangan, Potongan, BPJS, PPh21, dan Take Home Pay.",
                    "Karyawan dapat mengunduh slip tersebut menjadi file PDF yang sah."
                ]
            }
        ]
    },
    {
        title: "3.10. Pengaturan Profil, Face ID, & Password",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Pusat manajemen keamanan dan kendali akun personal karyawan."
                ]
            },
            {
                type: "bullet",
                items: [
                    "Cara Ubah Password (Kata Sandi): Buka menu Settings. Pada tab Password, masukkan kata sandi lama Anda untuk verifikasi. Kemudian masukkan kata sandi baru (kombinasi huruf dan angka), dan klik Simpan. Anda akan otomatis keluar (logout) dan harus masuk kembali dengan kata sandi baru.",
                    "Cara Daftar Biometrik (Face ID): Buka tab Face ID. Sistem akan meminta izin akses kamera. Posisikan wajah Anda tepat di area pemindaian hingga garis indikator berwarna hijau. Data wajah akan dikunci secara kriptografis dan merupakan syarat mutlak agar Anda bisa melakukan Absensi.",
                    "Perbarui Data Pribadi: Buka menu Profil. Anda dapat memperbarui foto profil, nomor kontak darurat, atau alamat domisili agar data pusat di HR selalu mutakhir."
                ]
            }
        ]
    },
    {
        title: "3.11. Manajemen To-Do List Pribadi",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu To-Do List.",
                    "Klik Tambah Tugas. Isi judul tugas dan tenggat waktu (deadline).",
                    "Tandai checkbox jika tugas telah selesai. Sistem mencoret tugas secara otomatis (strikethrough)."
                ]
            }
        ]
    },
    {
        title: "3.12. Laporan Kunjungan Klien (Visits)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Bagi divisi Sales atau operasional lapangan."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Buka menu Kunjungan (Visits).",
                    "Klik Buat Laporan. Isi Nama Klien, Agenda, dan Hasil Kunjungan.",
                    "Sistem menangkap lokasi GPS (latitude/longitude) secara otomatis.",
                    "Unggah foto bukti kunjungan (selfie dengan klien atau foto gedung).",
                    "Kirim. HR dapat memverifikasi laporan tersebut di Dashboard Admin."
                ]
            }
        ]
    },
    {
        title: "3.13. Manajemen Aset & Laporan Kerusakan (Aset Saya)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Integrasi Portal Karyawan dengan sistem General Affairs (GA)."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Buka menu Aset Saya (Assets).",
                    "Karyawan dapat melihat daftar seluruh aset perusahaan (Laptop, HP, Kendaraan) yang saat ini sedang dipegang/dipinjamkan kepada mereka.",
                    "Peminjaman Baru: Klik 'Request Aset Baru' (Contoh: meminta Mouse Wireless).",
                    "Lapor Kendala: Jika laptop rusak, klik tombol Lapor Kendala pada aset tersebut, dan isi detail kerusakan. Tim GA akan menerima tiket tersebut untuk diproses."
                ]
            }
        ]
    },
    // ════ BAB 4 ════
    {
        title: "4. PORTAL DASHBOARD HR (SUPERADMIN)",
        type: "chapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Ruang kendali utama (Command Center) bagi HR Manager untuk mengawasi operasional, menyetujui birokrasi, dan mengeksekusi penggajian (Payroll)."
                ]
            }
        ]
    },
    {
        title: "4.1. Analitik KPI Dashboard",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Akses rute `/dashboard`.",
                    "Sistem menampilkan grafik statistik kehadiran real-time: Jumlah Hadir, Terlambat, Izin, dan Absen.",
                    "Pantau daftar persetujuan tertunda (Pending Approvals) langsung dari halaman utama."
                ]
            }
        ]
    },
    {
        title: "4.2. Manajemen Absensi & Koreksi",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Attendance.",
                    "Filter berdasarkan nama karyawan atau tanggal.",
                    "Jika karyawan lupa Clock-Out, HR dapat melakukan Edit/Koreksi Data.",
                    "Lihat foto bukti absensi dan keakuratan GPS di peta terintegrasi (Leaflet Maps)."
                ]
            }
        ]
    },
    {
        title: "4.3. Audit Trail (Log Aktivitas)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Sistem mencatat setiap perubahan data untuk akuntabilitas tinggi."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Buka menu Audit Trail.",
                    "Pantau tabel log yang berisi detail: Siapa yang mengubah data, Waktu perubahan, dan Aksi (Create/Update/Delete).",
                    "Gunakan log ini saat melakukan investigasi kesalahan entri data."
                ]
            }
        ]
    },
    {
        title: "4.4. Kalkulator BPJS",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu BPJS Calculator.",
                    "Masukkan Gaji Pokok karyawan.",
                    "Pilih tingkat risiko pekerjaan (untuk persentase JKK).",
                    "Sistem menampilkan simulasi presisi potongan BPJS Kesehatan dan Ketenagakerjaan (porsi Perusahaan vs Karyawan)."
                ]
            }
        ]
    },
    {
        title: "4.5. Manajemen Karyawan (Data 360°)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Fitur krusial bagi HR untuk melakukan 'Onboarding' karyawan baru secara digital dan komprehensif."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Buka menu Employees di Dashboard.",
                    "Cara Registrasi Karyawan Baru: Klik tombol 'Tambah Karyawan'.",
                    "Isi Profil Dasar: Masukkan ID Karyawan (NIK), Nama Lengkap, Email perusahaan, dan Nomor Handphone.",
                    "Tentukan Hierarki Organisasi: Pilih Departemen, lalu pilih Divisi, dan Jabatan (Master Data harus sudah dibuat sebelumnya).",
                    "Konfigurasi Akses Absensi: Pilih Lokasi Geofence utama karyawan tersebut, atau aktifkan toggle 'Bypass Lokasi' jika ia adalah pekerja Remote (WFH).",
                    "Assign Shift: Tetapkan Jadwal Shift Kerja default untuk kalkulasi jam masuk dan keluar secara matematis.",
                    "Pemberian Akses Login: HR membuatkan Kata Sandi Awal (Password). Karyawan bisa langsung login detik itu juga, dan sistem akan mengimbau karyawan untuk segera mengganti kata sandi dan mendaftarkan Face ID secara mandiri."
                ]
            }
        ]
    },
    {
        title: "4.6. Manajemen & Persetujuan Cuti",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Leave.",
                    "Lihat daftar pengajuan berstatus Pending.",
                    "Klik Detail. Baca alasan, periksa saldo cuti karyawan, dan buka lampiran surat sakit jika ada.",
                    "Klik Approve atau Reject. Jika Approve, saldo cuti karyawan otomatis berkurang."
                ]
            }
        ]
    },
    {
        title: "4.7. Permohonan Surat Keterangan (Letter Requests)",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Letter Requests.",
                    "Tinjau permohonan karyawan yang meminta Surat Keterangan Kerja, Slip Gaji Cap Basah, atau Surat Visa.",
                    "Setelah surat dibuat secara fisik/digital, HR dapat mengupdate statusnya menjadi Completed (Selesai)."
                ]
            }
        ]
    },
    {
        title: "4.8. Master Data (Departemen, Divisi, Jabatan, Lokasi)",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Master Data.",
                    "Tambahkan Departemen (misal: Teknologi).",
                    "Tambahkan Divisi dan kaitkan dengan Departemen (misal: Software Engineering -> Teknologi).",
                    "Lokasi (Geofence): Tambahkan lokasi kantor, set koordinat latitude/longitude, dan atur radius toleransi (misal 50 meter)."
                ]
            }
        ]
    },
    {
        title: "4.9. Master Payroll (Tunjangan & Potongan)",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Master Payroll.",
                    "Tambahkan Komponen: Pilih apakah ini Tunjangan (Allowance) atau Potongan (Deduction).",
                    "Atur nominal default. Komponen ini akan muncul saat menyusun slip gaji."
                ]
            }
        ]
    },
    {
        title: "4.10. CMS WIG News",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu News.",
                    "Klik Tulis Berita Baru. Masukkan Judul dan Konten Editor (Rich Text).",
                    "Tentukan apakah berita ini Penting (Pinned).",
                    "Klik Publish. Berita akan seketika muncul di dashboard seluruh karyawan."
                ]
            }
        ]
    },
    {
        title: "4.11. Manajemen Lembur & Kalkulator PP35",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Overtime.",
                    "Review pengajuan lembur. Sistem telah menghitung berapa jam valid lembur tersebut.",
                    "Approve lembur. Buka Overtime Calculator untuk melihat simulasi upah lembur resmi berdasarkan PP 35 Tahun 2021 (Hari Kerja vs Hari Libur)."
                ]
            }
        ]
    },
    {
        title: "4.12. Enterprise Payroll (Slip Gaji)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Engine kalkulasi gaji otomatis terpadu."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Buka menu Payroll, klik Generate Slip Gaji.",
                    "Pilih Karyawan. Sistem akan menarik Gaji Pokok secara otomatis.",
                    "Tambahkan nilai Lembur (diambil dari rekap overtime bulan tersebut).",
                    "Tambahkan komponen potongan/tunjangan tambahan.",
                    "Sistem secara matematis mengkalkulasi Gaji Bersih (Take Home Pay).",
                    "Klik Terbitkan. Slip Gaji langsung tersedia di aplikasi karyawan."
                ]
            }
        ]
    },
    {
        title: "4.13. Kalkulator PPh 21 TER",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu PPh 21 Calculator.",
                    "Pilih status Penghasilan Tidak Kena Pajak (PTKP), misalnya TK/0, K/1, dll.",
                    "Masukkan Gaji Bruto.",
                    "Sistem akan mencocokkan dengan tabel TER DJP terbaru dan menghasilkan nilai pajak yang harus dipotong bulan ini."
                ]
            }
        ]
    },
    {
        title: "4.14. Reporting & Export Data",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Reports.",
                    "Pilih jenis laporan: Absensi, Payroll, Cuti, atau Karyawan.",
                    "Atur rentang tanggal (Date Range).",
                    "Klik Export to Excel (.xlsx) atau Export to PDF untuk kebutuhan audit."
                ]
            }
        ]
    },
    {
        title: "4.15. Manajemen Shift Kerja Dinamis",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Shifts.",
                    "Buat Shift Baru (misal: Shift Malam).",
                    "Tentukan jam masuk, jam keluar, dan rentang toleransi keterlambatan (Grace Period).",
                    "Assign Shift ini ke karyawan spesifik yang bekerja malam."
                ]
            }
        ]
    },
    {
        title: "4.16. Persetujuan Laporan Kunjungan",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Visits.",
                    "Periksa laporan dari tim lapangan. Tinjau foto, baca catatan, dan lihat validitas titik GPS.",
                    "Tandai sebagai Validated (Tervalidasi) jika laporan sesuai prosedur."
                ]
            }
        ]
    },
    // ════ BAB 5 ════
    {
        title: "5. PORTAL GA (GENERAL AFFAIRS)",
        type: "chapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Portal General Affairs dirancang khusus untuk manajemen aset, armada kendaraan, fasilitas gedung, hingga layanan Helpdesk spesifik departemen GA."
                ]
            }
        ]
    },
    {
        title: "5.1. Dashboard Statistik Aset & Expiry",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka rute `/ga`.",
                    "Dashboard menyajikan Metrik Total Kapital Aset dan Persentase Aset Rusak.",
                    "Alert Expiry: Sistem menampilkan peringatan otomatis jika ada aset yang masa garansinya hampir habis (dalam 30 hari) atau jika STNK Kendaraan/Nomor SIM Card akan expired."
                ]
            }
        ]
    },
    {
        title: "5.2. Manajemen Aset Fisik & Digital",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Assets.",
                    "Klik Register Aset. Masukkan Kode Aset, Nama Aset (misal: Laptop Lenovo X1), dan Nilai Aset (Harga Beli).",
                    "Assign Aset: Pilih apakah aset ini dialokasikan ke GA Pool (Gudang) atau langsung dipinjamkan (Assigned) ke spesifik Karyawan.",
                    "Ubah Status: Update status secara berkala (Available, In Use, Maintenance, Broken, Disposed)."
                ]
            }
        ]
    },
    {
        title: "5.3. Kategori Aset",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Categories.",
                    "Buat kategori baru dengan Prefix kode unik (Misal: 'LT' untuk Laptop, 'MBL' untuk Mobil).",
                    "Setiap aset yang diregister di kategori ini akan mendapatkan kode SKU otomatis, misal LT-2026-001."
                ]
            }
        ]
    },
    {
        title: "5.4. Fitur Pemindaian Barcode (Scan QR)",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Scan melalui perangkat seluler (Smartphone).",
                    "Arahkan kamera ke stiker QR Code yang menempel di aset fisik.",
                    "Sistem otomatis mengarahkan GA ke halaman Detail Aset tersebut, mempermudah audit fisik (Stock Opname) tanpa harus mengetik manual."
                ]
            }
        ]
    },
    {
        title: "5.5. Manajemen Nomor & SIM Card",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu SIM & Numbers.",
                    "Daftarkan kartu perdana korporat atau nomor internet.",
                    "Isi tanggal kadaluwarsa (Expired Date).",
                    "Sistem akan memancarkan alert merah di Dashboard jika paket data atau masa aktif nomor mendekati habis."
                ]
            }
        ]
    },
    {
        title: "5.6. Helpdesk & Ticketing System GA",
        type: "subchapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Buka menu Tickets.",
                    "Tim GA menerima laporan masuk dari karyawan terkait kerusakan fasilitas (AC mati, kursi rusak, plafon bocor).",
                    "Klik Investigate (Proses Tiket). Update estimasi waktu perbaikan agar pelapor mendapatkan notifikasi.",
                    "Setelah vendor menyelesaikan perbaikan, ubah status tiket menjadi Closed."
                ]
            }
        ]
    },
    {
        title: "5.7. Upload BAST (Berita Acara Serah Terima)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Digitalisasi dokumen serah terima fisik."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Saat tim GA meminjamkan aset (Assign Asset) kepada Karyawan, GA wajib mencetak dokumen BAST yang telah ditandatangani kedua belah pihak.",
                    "Buka Riwayat Aset (Asset History), lalu unggah file PDF/Scan BAST tersebut sebagai bukti hukum yang sah bahwa karyawan telah menerima barang dalam kondisi baik."
                ]
            }
        ]
    },
    {
        title: "5.8. Inspeksi & Audit Aset (Checklist)",
        type: "subchapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Fitur pencegahan depresiasi aset (Preventive Maintenance)."
                ]
            },
            {
                type: "numbered",
                items: [
                    "Secara berkala, GA melakukan pengecekan fisik aset.",
                    "Buka menu Inspeksi Aset.",
                    "Isi Checklist parameter (Misal: Apakah layar tergores? Apakah baterai bocor?).",
                    "Tentukan kondisi akhir aset (Baik/Kurang Baik/Rusak) berdasarkan hasil inspeksi agar pembukuan nilai aset tetap mutakhir."
                ]
            }
        ]
    },
    // ════ BAB 6 ════
    {
        title: "6. KEAMANAN TINGKAT ENTERPRISE (ZERO-TRUST)",
        type: "chapter",
        content: [
            {
                type: "paragraph",
                text: [
                    "Infrastruktur keamanan WIG HRIS dibangun di atas paradigma Zero-Trust, dimana setiap interaksi diverifikasi secara ketat."
                ]
            },
            {
                type: "bullet",
                items: [
                    "Algoritma Face-API.js: Membaca puluhan titik biometrik (landmarks) wajah secara offline di sisi browser untuk mempercepat proses tanpa lag.",
                    "Liveness Detection: Fitur anti-spoofing mendeteksi kedalaman bayangan sehingga absensi menggunakan foto cetak atau video dari HP lain akan tertolak.",
                    "Mock Location Blocker: Logic internal menghentikan paksa transaksi absensi jika SDK mendeteksi penggunaan Fake GPS, Mock Location, atau VPN perubah IP.",
                    "JWT & HTTP-Only Cookies: Sesi login dienkripsi dan diamankan dari serangan XSS (Cross-Site Scripting) pencurian token."
                ]
            }
        ]
    },
    // ════ BAB 7 ════
    {
        title: "7. FREQUENTLY ASKED QUESTIONS (FAQ)",
        type: "chapter",
        content: [
            {
                type: "numbered",
                items: [
                    "Q: Apakah staf di lapangan (Sales) harus absen di kantor pusat? \nA: Tidak. HR dapat mendaftarkan lokasi Geofence klien, atau mengaktifkan fitur 'Bypass Location' khusus bagi staf lapangan yang memiliki mobilitas tak tertebak.",
                    "Q: Bagaimana jika Karyawan mengganti Handphone? \nA: Akun karyawan aman. Namun untuk pertama kalinya, mereka harus didaftarkan ulang (Reset Face ID) oleh HR jika keamanan perusahaan mengadopsi kebijakan strict 1-Device.",
                    "Q: Apakah slip gaji terjamin kerahasiaannya? \nA: Ya. Setiap slip gaji di-render secara privat di layar perangkat dan mewajibkan karyawan memasukkan Password ulang (Two-Step Authentication) sebelum membuka dokumen slip.",
                    "Q: Bagaimana jika internet terputus saat absensi? \nA: Aplikasi dibangun dengan teknologi PWA. Saat online kembali, data akan disinkronisasi. Karyawan juga dapat menggunakan kuota seluler (4G/5G) pribadi karena konsumsi data sistem yang sangat kecil."
                ]
            }
        ]
    }
];

// ─── RENDERING ENGINE ────────────────────────────────────────────────

function generateGuideline() {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let y = 0;

    // ── Helper Internal ──
    const drawHeader = (title: string, yPos: number): number => {
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(105, 15, 30); // Enterprise Maroon
        doc.text(title, 14, yPos);
        doc.setDrawColor(105, 15, 30);
        doc.setLineWidth(0.5);
        doc.line(14, yPos + 3, 196, yPos + 3);
        return yPos + 14;
    };

    const drawSubHeader = (title: string, yPos: number): number => {
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.text(title, 14, yPos);
        return yPos + 8;
    };

    const checkPage = (currentY: number, neededSpace: number): number => {
        if (currentY > 280 - neededSpace) {
            doc.addPage();
            return 20;
        }
        return currentY;
    };

    // ════ COVER PAGE ════
    doc.setFillColor(15, 23, 42); // Elegant Dark Slate
    doc.rect(0, 0, 210, 297, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(38);
    doc.setFont("helvetica", "bold");
    doc.text("ENTERPRISE HRIS PLATFORM", 105, 100, { align: "center" });

    doc.setFontSize(20);
    doc.setFont("helvetica", "normal");
    doc.text("Buku Panduan, Operasional & Fitur", 105, 115, { align: "center" });

    doc.setFontSize(13);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(200, 200, 200);
    doc.text("Solusi Pengelolaan SDM, Payroll, dan Aset (GA) Terintegrasi", 105, 135, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("WIG Attendance System", 105, 145, { align: "center" });

    doc.setDrawColor(200, 160, 50); // Gold Accent
    doc.setLineWidth(1);
    doc.line(40, 155, 170, 155);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 180, 180);
    doc.text("Disusun Komprehensif Untuk Eksekutif, HR Manager & Tim GA", 105, 170, { align: "center" });
    doc.text("Februari 2026 | Versi 3.0 (Ultimate Edition)", 105, 177, { align: "center" });

    doc.setFontSize(9);
    doc.text("PT Wijaya Inovasi Gemilang — Confidential & Proprietary", 105, 280, { align: "center" });

    // ════ DAFTAR ISI (TOC) ════
    doc.addPage();
    y = 20;
    y = drawHeader("DAFTAR ISI", y);
    y += 5;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);

    manualData.forEach((section) => {
        if (section.type === "chapter") {
            y = checkPage(y, 10);
            doc.setFont("helvetica", "bold");
            doc.text(section.title, 14, y);
            y += 7;
        } else {
            y = checkPage(y, 8);
            doc.setFont("helvetica", "normal");
            doc.text(section.title, 20, y);
            y += 6;
        }
    });

    // ════ ENGINE LOOP (CONTENT GENERATION) ════
    manualData.forEach((section) => {
        if (section.type === "chapter") {
            doc.addPage();
            y = 20;
            y = drawHeader(section.title, y);
        } else {
            y = checkPage(y, 25);
            y += 5;
            y = drawSubHeader(section.title, y);
        }

        section.content.forEach((block) => {
            doc.setFontSize(10.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(60, 60, 60);

            if (block.type === "paragraph") {
                block.text.forEach((textLine) => {
                    y = checkPage(y, 10);
                    const splitText = doc.splitTextToSize(textLine, 175);
                    doc.text(splitText, 16, y);
                    y += splitText.length * 5.5 + 2;
                });
            } else if (block.type === "bullet") {
                block.items.forEach((item) => {
                    y = checkPage(y, 10);
                    doc.text("•", 18, y);
                    const splitText = doc.splitTextToSize(item, 168);
                    doc.text(splitText, 24, y);
                    y += splitText.length * 5.5 + 2;
                });
            } else if (block.type === "numbered") {
                block.items.forEach((item, index) => {
                    y = checkPage(y, 10);
                    const numStr = `${index + 1}.`;
                    doc.text(numStr, 18, y);
                    
                    // Allow multi-line answers in FAQ (split by \n inside item)
                    const chunks = item.split("\n");
                    chunks.forEach((chunk, cIdx) => {
                        const splitText = doc.splitTextToSize(chunk, 168);
                        if (cIdx === 0) {
                            doc.text(splitText, 24, y);
                        } else {
                            // Indent new lines
                            doc.text(splitText, 24, y);
                        }
                        y += splitText.length * 5.5 + 1;
                    });
                    y += 2;
                });
            }
            y += 3; // Gap after block
        });
    });

    // ════ FOOTER PAGINATION ════
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        // Skip cover
        if (i === 1) continue; 
        
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(150, 150, 150);
        doc.text(`Halaman ${i} dari ${pageCount}`, 105, 290, { align: "center" });
        doc.text("PT Wijaya Inovasi Gemilang | WIG HRIS Ultimate Edition", 105, 294, { align: "center" });
    }

    // Save
    doc.save(OUTPUT_PATH);
    console.log(`✅ Ultimate Comprehensive PDF berhasil dibuat: ${OUTPUT_PATH}`);
}

generateGuideline();

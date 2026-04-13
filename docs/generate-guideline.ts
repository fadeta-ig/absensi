/**
 * Script Generator Buku Panduan Sistem HRIS — WIG Attendance
 *
 * Menggunakan jsPDF untuk generate PDF langsung.
 * Jalankan: npx tsx docs/generate-guideline.ts
 */

import { jsPDF } from "jspdf";
import path from "path";

const OUTPUT_PATH = path.resolve(__dirname, "Buku_Panduan_WIG_Attendance.pdf");

// ─── Helpers ─────────────────────────────────────────────────────────

function addHeader(doc: jsPDF, title: string, yStart: number): number {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(128, 0, 0); // Maroon
    doc.text(title, 14, yStart);
    doc.setDrawColor(128, 0, 0);
    doc.line(14, yStart + 2, 196, yStart + 2);
    return yStart + 10;
}

function addSubHeader(doc: jsPDF, title: string, y: number): number {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(title, 14, y);
    return y + 7;
}

function addBody(doc: jsPDF, lines: string[], yStart: number): number {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    let y = yStart;
    for (const line of lines) {
        if (y > 275) {
            doc.addPage();
            y = 20;
        }
        doc.text(line, 18, y);
        y += 5.5;
    }
    return y;
}

function addBullet(doc: jsPDF, items: string[], yStart: number, indent = 22): number {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    let y = yStart;
    for (const item of items) {
        if (y > 275) {
            doc.addPage();
            y = 20;
        }
        doc.text("•", indent - 4, y);
        const splitText = doc.splitTextToSize(item, 170);
        doc.text(splitText, indent, y);
        y += splitText.length * 5.5;
    }
    return y;
}

function addNumbered(doc: jsPDF, items: string[], yStart: number): number {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    let y = yStart;
    items.forEach((item, index) => {
        if (y > 275) {
            doc.addPage();
            y = 20;
        }
        const num = `${index + 1}.`;
        doc.text(num, 18, y);
        const splitText = doc.splitTextToSize(item, 168);
        doc.text(splitText, 24, y);
        y += splitText.length * 5.5;
    });
    return y;
}

function addSpacer(y: number, size = 5): number {
    return y + size;
}

function checkPage(doc: jsPDF, y: number, needed = 40): number {
    if (y > 280 - needed) {
        doc.addPage();
        return 20;
    }
    return y;
}

// ─── Page Number Footer ──────────────────────────────────────────────

function addPageNumbers(doc: jsPDF) {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text(`Halaman ${i} dari ${pageCount}`, 105, 290, { align: "center" });
        doc.text("PT Wijaya Inovasi Gemilang — Dokumen Internal", 105, 294, { align: "center" });
    }
}

// ─── Main ────────────────────────────────────────────────────────────

function generateGuideline() {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let y = 0;

    // ═══════════════════════════════════════════════════════════════════
    // COVER PAGE
    // ═══════════════════════════════════════════════════════════════════
    doc.setFillColor(128, 0, 0); // Maroon
    doc.rect(0, 0, 210, 297, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont("helvetica", "bold");
    doc.text("BUKU PANDUAN", 105, 100, { align: "center" });
    doc.setFontSize(24);
    doc.text("WIG Attendance System", 105, 115, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Human Resource Information System (HRIS)", 105, 135, { align: "center" });
    doc.text("PT Wijaya Inovasi Gemilang", 105, 143, { align: "center" });

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(60, 155, 150, 155);

    doc.setFontSize(10);
    doc.text("Versi 1.0", 105, 170, { align: "center" });
    doc.text("Februari 2026", 105, 177, { align: "center" });
    doc.text("Dokumen Internal — Hak Cipta Dilindungi", 105, 250, { align: "center" });

    // ═══════════════════════════════════════════════════════════════════
    // DAFTAR ISI
    // ═══════════════════════════════════════════════════════════════════
    doc.addPage();
    y = 20;
    y = addHeader(doc, "DAFTAR ISI", y);
    y = addSpacer(y);

    const tocItems = [
        "1. Pendahuluan",
        "2. Persyaratan Sistem",
        "3. Login & Autentikasi",
        "4. Panel Karyawan (Employee Portal)",
        "   4.1. Beranda",
        "   4.2. Absensi (Clock In / Clock Out)",
        "   4.3. Riwayat Absensi",
        "   4.4. Laporan Kunjungan",
        "   4.5. Pengajuan Lembur",
        "   4.6. Slip Gaji",
        "   4.7. Pengajuan Cuti",
        "   4.8. Berita & Pengumuman",
        "   4.9. To-Do List",
        "   4.10. Pengaturan (Password & Face ID)",
        "   4.11. Helpdesk & Knowledge Base",
        "5. Dashboard HR (Admin Panel)",
        "   5.1. Dashboard Utama & KPI",
        "   5.2. Manajemen Absensi",
        "   5.3. Manajemen Kunjungan",
        "   5.4. Manajemen Cuti",
        "   5.5. Master Data (Departemen, Divisi, Jabatan, Lokasi)",
        "   5.6. Manajemen Karyawan",
        "   5.7. Manajemen Jam Kerja (Shift)",
        "   5.8. Manajemen Lembur",
        "   5.9. Payroll (Slip Gaji & Rekapitulasi)",
        "   5.10. Pengaturan Komponen Payroll",
        "   5.11. Kalkulator PPh 21",
        "   5.12. Kalkulator BPJS",
        "   5.13. Laporan & Export",
        "   5.14. WIG News",
        "   5.15. Helpdesk & Manajemen SLA",
        "   5.16. Manajemen Knowledge Base",
        "6. Fitur Keamanan",
        "   6.1. Verifikasi Wajah (Face Recognition)",
        "   6.2. Validasi GPS Anti-Fake",
        "   6.3. Geofencing Multi-Lokasi",
        "7. Frequently Asked Questions (FAQ)",
    ];

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    for (const item of tocItems) {
        doc.text(item, 18, y);
        y += 6;
        if (y > 275) { doc.addPage(); y = 20; }
    }

    // ═══════════════════════════════════════════════════════════════════
    // BAB 1: PENDAHULUAN
    // ═══════════════════════════════════════════════════════════════════
    doc.addPage();
    y = 20;
    y = addHeader(doc, "1. PENDAHULUAN", y);
    y = addSpacer(y);
    y = addBody(doc, [
        "WIG Attendance System adalah platform HRIS (Human Resource Information System) berbasis",
        "web yang dikembangkan untuk PT Wijaya Inovasi Gemilang. Sistem ini dirancang untuk",
        "mengotomatisasi dan menyederhanakan pengelolaan sumber daya manusia, mulai dari",
        "pencatatan kehadiran hingga perhitungan payroll.",
    ], y);
    y = addSpacer(y, 4);
    y = addSubHeader(doc, "Tujuan Sistem", y);
    y = addBullet(doc, [
        "Mencatat kehadiran karyawan secara real-time dengan validasi GPS dan Face Recognition.",
        "Mengelola pengajuan cuti, lembur, dan kunjungan klien secara digital.",
        "Menghitung gaji bulanan termasuk PPh 21 (TER) dan iuran BPJS secara otomatis.",
        "Menyediakan dashboard analitik untuk HR dalam memantau KPI kehadiran.",
        "Menyediakan portal mandiri bagi karyawan untuk mengakses informasi pribadi.",
    ], y);
    y = addSpacer(y, 4);
    y = addSubHeader(doc, "Peran Pengguna (Role)", y);
    y = addBullet(doc, [
        "HR Administrator — Akses penuh ke seluruh fitur manajemen melalui Dashboard HR.",
        "Karyawan (Employee) — Akses terbatas ke portal karyawan untuk absensi, cuti, slip gaji, dll.",
    ], y);

    // ═══════════════════════════════════════════════════════════════════
    // BAB 2: PERSYARATAN SISTEM
    // ═══════════════════════════════════════════════════════════════════
    doc.addPage();
    y = 20;
    y = addHeader(doc, "2. PERSYARATAN SISTEM", y);
    y = addSpacer(y);
    y = addSubHeader(doc, "Perangkat Pengguna", y);
    y = addBullet(doc, [
        "Browser modern: Google Chrome (versi 90+), Mozilla Firefox, Safari, atau Microsoft Edge.",
        "Perangkat dengan kamera (untuk fitur Face Recognition dan selfie absensi).",
        "GPS aktif pada perangkat (untuk validasi lokasi absensi).",
        "Koneksi internet stabil.",
        "Sistem mendukung desktop dan mobile (responsive design).",
    ], y);
    y = addSpacer(y, 4);
    y = addSubHeader(doc, "Infrastruktur Server", y);
    y = addBullet(doc, [
        "Node.js runtime (versi 18+).",
        "Database MySQL.",
        "Framework: Next.js 15+ dengan Prisma ORM.",
    ], y);

    // ═══════════════════════════════════════════════════════════════════
    // BAB 3: LOGIN & AUTENTIKASI
    // ═══════════════════════════════════════════════════════════════════
    doc.addPage();
    y = 20;
    y = addHeader(doc, "3. LOGIN & AUTENTIKASI", y);
    y = addSpacer(y);
    y = addBody(doc, [
        "Halaman login adalah pintu masuk utama ke sistem. Semua pengguna (HR dan Karyawan)",
        "menggunakan halaman yang sama untuk login.",
    ], y);
    y = addSpacer(y, 4);
    y = addSubHeader(doc, "Langkah-langkah Login", y);
    y = addNumbered(doc, [
        "Buka aplikasi WIG Attendance di browser.",
        "Masukkan ID Karyawan (contoh: ID25000001) pada kolom yang tersedia.",
        "Masukkan Password yang telah diberikan oleh HR.",
        "Klik tombol \"Masuk\".",
        "Sistem akan secara otomatis mengarahkan ke halaman yang sesuai:",
    ], y);
    y = addBullet(doc, [
        "HR Administrator → Dashboard HR (/dashboard)",
        "Karyawan → Portal Karyawan (/employee)",
    ], y, 30);
    y = addSpacer(y, 4);
    y = addSubHeader(doc, "Lupa Password", y);
    y = addBody(doc, [
        "Jika lupa password, hubungi HR Administrator. HR dapat mengirimkan password baru",
        "melalui fitur email yang terintegrasi dalam sistem.",
    ], y);
    y = addSpacer(y, 4);
    y = addSubHeader(doc, "Keamanan Sesi", y);
    y = addBullet(doc, [
        "Sesi login menggunakan JWT (JSON Web Token) yang disimpan dalam HTTP-only cookie.",
        "Sesi akan otomatis berakhir setelah periode waktu tertentu.",
        "Klik \"Keluar\" di sidebar untuk logout secara manual.",
    ], y);

    // ═══════════════════════════════════════════════════════════════════
    // BAB 4: PANEL KARYAWAN
    // ═══════════════════════════════════════════════════════════════════
    doc.addPage();
    y = 20;
    y = addHeader(doc, "4. PANEL KARYAWAN (Employee Portal)", y);
    y = addSpacer(y);
    y = addBody(doc, [
        "Portal Karyawan adalah area mandiri yang dapat diakses oleh setiap karyawan setelah login.",
        "Navigasi tersedia melalui sidebar di desktop atau bottom navigation di mobile.",
    ], y);

    // 4.1 Beranda
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 50);
    y = addSubHeader(doc, "4.1. Beranda", y);
    y = addBody(doc, [
        "Halaman utama yang menampilkan ringkasan informasi karyawan hari ini.",
    ], y);
    y = addBullet(doc, [
        "Status Absensi Hari Ini — menampilkan jam clock-in dan clock-out.",
        "Sisa Cuti — jumlah cuti tahunan yang masih tersedia.",
        "Berita Terbaru — daftar pengumuman perusahaan terkini.",
        "Quick Actions — shortcut cepat ke fitur absensi dan cuti.",
    ], y);

    // 4.2 Absensi
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 70);
    y = addSubHeader(doc, "4.2. Absensi (Clock In / Clock Out)", y);
    y = addBody(doc, [
        "Fitur utama untuk mencatat kehadiran. Menggunakan validasi multi-faktor.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Proses Clock In:"], y);
    y = addNumbered(doc, [
        "Buka menu \"Absensi\" dari navigasi.",
        "Izinkan akses kamera dan lokasi jika diminta oleh browser.",
        "Sistem otomatis memilih kamera terbaik (mendukung kamera belakang/ultrawide).",
        "Sistem menampilkan layar kamera — posisikan wajah di area yang ditandai.",
        "Sistem memvalidasi: (a) Verifikasi wajah, (b) Lokasi GPS, (c) Anti-fake GPS.",
        "Jika semua validasi berhasil, klik tombol \"Clock In\".",
        "Foto selfie dan lokasi GPS akan tercatat otomatis.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Proses Clock Out:"], y);
    y = addNumbered(doc, [
        "Buka kembali menu \"Absensi\".",
        "Sistem mendeteksi bahwa Anda sudah clock-in hari ini.",
        "Ulangi proses selfie dan validasi yang sama.",
        "Klik tombol \"Clock Out\" — waktu keluar tercatat.",
    ], y);
    y = addSpacer(y, 3);
    y = checkPage(doc, y, 30);
    y = addSubHeader(doc, "   Status Kehadiran", y);
    y = addBullet(doc, [
        "Hadir (Present) — Clock in sebelum batas waktu shift.",
        "Terlambat (Late) — Clock in melebihi batas toleransi keterlambatan.",
        "Tidak Hadir (Absent) — Tidak ada catatan clock-in pada hari kerja.",
        "Cuti (Leave) — Terdapat persetujuan cuti yang aktif.",
    ], y);

    // 4.3 Riwayat Absensi
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 40);
    y = addSubHeader(doc, "4.3. Riwayat Absensi", y);
    y = addBody(doc, [
        "Menampilkan daftar seluruh catatan kehadiran karyawan dalam format tabel.",
    ], y);
    y = addBullet(doc, [
        "Tanggal, jam masuk, jam keluar, dan status kehadiran.",
        "Filter berdasarkan periode waktu.",
        "Tampilan lokasi clock-in/clock-out pada peta (jika tersedia).",
    ], y);

    // 4.4 Kunjungan
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 50);
    y = addSubHeader(doc, "4.4. Laporan Kunjungan", y);
    y = addBody(doc, [
        "Fitur untuk mencatat laporan kunjungan kerja dengan desain UI card modern.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Cara Membuat & Melihat Laporan:"], y);
    y = addNumbered(doc, [
        "Buka menu \"Kunjungan\" untuk melihat daftar card kunjungan secara rapi.",
        "Klik \"Tambah Kunjungan\" dan isi Nama Klien, Alamat, Tujuan, Hasil, Catatan.",
        "Ambil foto bukti kunjungan. Lokasi GPS akan tercatat otomatis.",
        "Klik \"Simpan\". Laporan akan masuk berstatus \"Pending\".",
        "Klik tombol \"Action Detail\" pada card untuk melihat detail di dalam modal pop-up.",
    ], y);

    // 4.5 Lembur
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 50);
    y = addSubHeader(doc, "4.5. Pengajuan Lembur", y);
    y = addBody(doc, [
        "Pengajuan lembur terintegrasi dengan kalkulasi lembur standar PP 35/2021.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Cara Mengajukan Lembur:"], y);
    y = addNumbered(doc, [
        "Buka menu \"Lembur\" dan klik \"Ajukan Lembur\".",
        "Isi: Tanggal, Jam Mulai, Jam Selesai, serta centang jika hari libur/istirahat.",
        "Isi Alasan/Deskripsi Pekerjaan.",
        "Total jam lembur dihitung otomatis secara akurat oleh sistem.",
        "Klik \"Kirim\" — pengajuan masuk antrian persetujuan HR.",
    ], y);
    y = addBullet(doc, [
        "Status: Pending → Approved / Rejected.",
    ], y);

    // 4.6 Slip Gaji
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 40);
    y = addSubHeader(doc, "4.6. Slip Gaji", y);
    y = addBody(doc, [
        "Karyawan dapat melihat rincian slip gaji yang telah diterbitkan oleh HR.",
    ], y);
    y = addBullet(doc, [
        "Periode gaji, gaji pokok, tunjangan, potongan, lembur, dan gaji bersih.",
        "Rincian komponen tunjangan dan potongan ditampilkan secara detail.",
        "HR menerbitkan slip gaji setiap bulan melalui modul Payroll.",
    ], y);

    // 4.7 Cuti
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 60);
    y = addSubHeader(doc, "4.7. Pengajuan Cuti", y);
    y = addBody(doc, ["Cara Mengajukan Cuti:"], y);
    y = addNumbered(doc, [
        "Buka menu \"Cuti\".",
        "Klik \"Ajukan Cuti\".",
        "Pilih Jenis Cuti: Tahunan, Sakit, Pribadi, atau Melahirkan.",
        "Pilih Tanggal Mulai dan Tanggal Selesai.",
        "Isi alasan cuti.",
        "Upload bukti/lampiran (PDF atau foto) - wajib untuk cuti sakit.",
        "Klik \"Kirim Pengajuan\".",
    ], y);
    y = addSpacer(y, 3);
    y = addBullet(doc, [
        "Jatah cuti tahunan: 12 hari per tahun (default).",
        "Sisa cuti ditampilkan di halaman cuti dan beranda.",
        "Saat cuti disetujui, saldo cuti terpakai otomatis bertambah.",
    ], y);

    // 4.8 Berita
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 30);
    y = addSubHeader(doc, "4.8. Berita & Pengumuman", y);
    y = addBody(doc, [
        "Menampilkan berita dan pengumuman perusahaan yang diterbitkan oleh HR.",
    ], y);
    y = addBullet(doc, [
        "Kategori: Pengumuman, Event, Kebijakan, Umum.",
        "Berita yang di-pin akan selalu tampil di atas.",
        "Mendukung lampiran media (gambar).",
    ], y);

    // 4.9 To-Do
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 30);
    y = addSubHeader(doc, "4.9. To-Do List", y);
    y = addBody(doc, [
        "Catatan tugas pribadi untuk setiap karyawan.",
    ], y);
    y = addBullet(doc, [
        "Tambah, edit, tandai selesai, dan hapus tugas.",
        "Data tersimpan di server — dapat diakses dari perangkat manapun.",
    ], y);

    // 4.10 Pengaturan
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 50);
    y = addSubHeader(doc, "4.10. Pengaturan (Password & Face ID)", y);
    y = addBody(doc, ["Fitur pengaturan akun karyawan:"], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["A. Ubah Password:"], y);
    y = addNumbered(doc, [
        "Masukkan password lama.",
        "Masukkan password baru (minimal 6 karakter).",
        "Konfirmasi password baru.",
        "Klik \"Simpan\" — password langsung diperbarui.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["B. Registrasi Wajah (Face ID):"], y);
    y = addNumbered(doc, [
        "Klik \"Daftarkan Wajah\".",
        "Izinkan akses kamera.",
        "Posisikan wajah menghadap kamera dengan jelas.",
        "Sistem mengambil data biometrik wajah dan menyimpannya.",
        "Face ID digunakan untuk verifikasi saat absensi.",
    ], y);

    // 4.11 Helpdesk & Knowledge Base
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 60);
    y = addSubHeader(doc, "4.11. Helpdesk & Knowledge Base (Pusat Bantuan)", y);
    y = addBody(doc, [
        "Fasilitas mandiri untuk mencari solusi teknis atau melaporkan kendala ke HR/IT.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["A. Knowledge Base (Artikel Bantuan):"], y);
    y = addBullet(doc, [
        "Buka menu \"Knowledge Base\".",
        "Cari artikel panduan menggunakan fitur pencarian atau jelajahi kategori.",
        "Berikan feedback (bermanfaat/tidak) di akhir artikel.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["B. Tiket Bantuan (Helpdesk):"], y);
    y = addNumbered(doc, [
        "Jika artikel tidak membantu, buka menu \"Tiket Saya\" dan buat tiket baru.",
        "Pilih Kategori Kendala, Prioritas, dan jelaskan detail masalah.",
        "Tiket dikirim dan Anda dapat memantau status serta chat langsung dengan tim HR.",
    ], y);

    // ═══════════════════════════════════════════════════════════════════
    // BAB 5: DASHBOARD HR
    // ═══════════════════════════════════════════════════════════════════
    doc.addPage();
    y = 20;
    y = addHeader(doc, "5. DASHBOARD HR (Admin Panel)", y);
    y = addSpacer(y);
    y = addBody(doc, [
        "Dashboard HR adalah pusat kendali bagi HR Administrator untuk mengelola seluruh aspek",
        "sumber daya manusia. Hanya pengguna dengan role \"hr\" yang dapat mengakses area ini.",
    ], y);

    // 5.1 Dashboard Utama
    y = addSpacer(y, 6);
    y = addSubHeader(doc, "5.1. Dashboard Utama & KPI", y);
    y = addBody(doc, [
        "Halaman dashboard profesional dengan card KPI seragam dan navigasi mulus:",
    ], y);
    y = addBullet(doc, [
        "Total Karyawan, Hadir, Terlambat, Cuti/Lembur/Kunjungan Pending.",
        "Grafik Distribusi per Departemen.",
        "Aktivitas Terbaru — Daftar panjang didukung fitur paginasi agar halaman rapi.",
        "Kalender Cuti Ringkas — Tampilan kalender yang lebih padat (compact view).",
    ], y);

    // 5.2 Manajemen Absensi
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 50);
    y = addSubHeader(doc, "5.2. Manajemen Absensi", y);
    y = addBody(doc, [
        "HR dapat melihat dan mengelola seluruh catatan kehadiran karyawan.",
    ], y);
    y = addBullet(doc, [
        "Tabel daftar semua record absensi (tanggal, karyawan, jam masuk/keluar, status).",
        "Filter berdasarkan karyawan, tanggal, atau status.",
        "Lihat detail lokasi GPS dan foto selfie pada setiap record.",
        "Edit/koreksi record absensi jika diperlukan (misal: karyawan lupa clock-out).",
    ], y);

    // 5.3 Kunjungan
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 40);
    y = addSubHeader(doc, "5.3. Manajemen Kunjungan", y);
    y = addBullet(doc, [
        "Melihat semua laporan kunjungan dari seluruh karyawan.",
        "Mengubah status kunjungan: Pending → Disetujui / Ditolak.",
        "Melihat foto bukti dan lokasi GPS kunjungan.",
        "Menambahkan catatan review.",
    ], y);

    // 5.4 Cuti
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 50);
    y = addSubHeader(doc, "5.4. Manajemen Cuti", y);
    y = addBody(doc, ["Cara Approve/Reject Cuti:"], y);
    y = addNumbered(doc, [
        "Buka menu \"Cuti\" di sidebar.",
        "Daftar pengajuan cuti ditampilkan dengan filter status (Pending/Approved/Rejected).",
        "Klik pada pengajuan yang ingin direview.",
        "Review detail: karyawan, jenis cuti, tanggal, alasan, dan lampiran bukti.",
        "Klik \"Setujui\" atau \"Tolak\".",
        "Jika disetujui, saldo cuti karyawan otomatis berkurang sesuai jumlah hari.",
    ], y);

    // 5.5 Master Data
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 80);
    y = addSubHeader(doc, "5.5. Master Data", y);
    y = addBody(doc, [
        "Pusat pengelolaan data referensi organisasi. Terdiri dari 4 tab:",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["A. Departemen:"], y);
    y = addBullet(doc, [
        "Tambah, edit, dan hapus departemen (contoh: IT, Marketing, Finance).",
        "Setiap departemen memiliki nama, kode, dan deskripsi.",
        "Status aktif/nonaktif menentukan apakah departemen muncul di dropdown karyawan.",
    ], y);
    y = addSpacer(y, 3);
    y = checkPage(doc, y, 30);
    y = addBody(doc, ["B. Divisi:"], y);
    y = addBullet(doc, [
        "Divisi berelasi ke departemen (misal: Departemen IT → Divisi Development, Divisi Infra).",
        "CRUD lengkap dengan pilihan departemen.",
    ], y);
    y = addSpacer(y, 3);
    y = checkPage(doc, y, 30);
    y = addBody(doc, ["C. Jabatan:"], y);
    y = addBullet(doc, [
        "Daftar posisi/jabatan di perusahaan (misal: Staff, Supervisor, Manager).",
        "Digunakan sebagai referensi saat menambah karyawan baru.",
    ], y);
    y = addSpacer(y, 3);
    y = checkPage(doc, y, 40);
    y = addBody(doc, ["D. Lokasi Absensi (Geofencing):"], y);
    y = addBullet(doc, [
        "Tentukan titik-titik lokasi kantor/kerja yang valid untuk absensi.",
        "Setiap lokasi memiliki: nama, koordinat GPS (latitude/longitude), dan radius (meter).",
        "Karyawan hanya dapat absensi jika berada dalam radius lokasi yang ditentukan.",
        "Mendukung multi-lokasi — karyawan tertentu dapat di-assign ke lokasi tertentu.",
        "Terdapat fitur deteksi lokasi otomatis dan pencarian alamat.",
    ], y);

    // 5.6 Karyawan
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 60);
    y = addSubHeader(doc, "5.6. Manajemen Karyawan", y);
    y = addBody(doc, [
        "Halaman CRUD lengkap untuk mengelola data karyawan.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Cara Menambah Karyawan Baru:"], y);
    y = addNumbered(doc, [
        "Klik tombol \"Tambah Karyawan\".",
        "Isi data: ID Karyawan, Nama, Email, No. Telepon, Departemen, Divisi, Jabatan.",
        "Pilih Role: Employee atau HR.",
        "Set password awal.",
        "Tentukan tanggal bergabung dan jatah cuti.",
        "Assign shift kerja dan lokasi absensi.",
        "Opsi: Bypass Lokasi (untuk karyawan remote/WFH).",
        "Klik \"Simpan\".",
    ], y);
    y = addSpacer(y, 3);
    y = addBullet(doc, [
        "Edit dan nonaktifkan karyawan yang sudah resign.",
        "Kirim password via email langsung dari sistem.",
    ], y);

    // 5.7 Shift
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 60);
    y = addSubHeader(doc, "5.7. Manajemen Jam Kerja (Shift)", y);
    y = addBody(doc, [
        "Konfigurasi jadwal kerja fleksibel per hari dalam seminggu.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Cara Membuat Shift Baru:"], y);
    y = addNumbered(doc, [
        "Klik \"Tambah Shift\".",
        "Beri nama shift (contoh: Shift Reguler, Shift Malam).",
        "Untuk setiap hari (Senin-Minggu), atur:",
    ], y);
    y = addBullet(doc, [
        "Jam Masuk dan Jam Keluar.",
        "Tandai sebagai \"Libur\" jika hari tersebut tidak bekerja.",
    ], y, 30);
    y = addNumbered(doc, [
        "Atur toleransi: Terlambat Masuk, Lebih Awal Masuk, Terlambat Keluar, Lebih Awal Keluar (menit).",
        "Tandai sebagai \"Default\" jika ingin menjadi shift utama.",
        "Klik \"Simpan\".",
    ], y);
    y = addBullet(doc, [
        "Shift yang di-assign ke karyawan menentukan status hadir/terlambat secara otomatis.",
    ], y);

    // 5.8 Lembur
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 60);
    y = addSubHeader(doc, "5.8. Manajemen Lembur & Kalkulator PP 35/2021", y);
    y = addBullet(doc, [
        "Lihat pengajuan lembur dengan deteksi otomatis Hari Kerja/Libur.",
        "Sistem menghitung upah lembur otomatis berdasarkan aturan PP 35/2021.",
        "Approve atau reject pengajuan (jam lembur dapat diedit HR sebelum disetujui).",
        "Kalkulator Lembur Manual: Tersedia di Master Payroll untuk simulasi instan.",
    ], y);

    // 5.9 Payroll
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 90);
    y = addSubHeader(doc, "5.9. Payroll (Slip Gaji & Rekapitulasi)", y);
    y = addBody(doc, [
        "Modul komprehensif untuk mengelola, menerbitkan slip gaji, dan melihat",
        "rekapitulasi payroll bulanan serta riwayat penggajian perusahaan.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["A. Cara Membuat Slip Gaji:"], y);
    y = addNumbered(doc, [
        "Buka menu \"Payroll\" dan pilih tab \"Buat Slip Gaji\".",
        "Pilih karyawan.",
        "Isi komponen, tunjangan, potongan. Nilai lembur ditarik otomatis dari pengajuan.",
        "Gaji Bersih dihitung otomatis oleh sistem.",
        "Pilih periode dan tanggal terbit lalu klik \"Terbitkan\".",
    ], y);
    y = addSpacer(y, 3);
    y = checkPage(doc, y, 40);
    y = addBody(doc, ["B. Rekapitulasi & Riwayat Payroll:"], y);
    y = addBullet(doc, [
        "Menampilkan ringkasan total gaji serta detail histori gaji karyawan.",
        "Advanced Filtering: Dinamis berdasarkan Nama, Departemen, & Divisi.",
        "Export Laporan: Export file secara profesional ke format PDF & Excel (.xlsx).",
    ], y);

    // 5.10 Pengaturan Payroll
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 40);
    y = addSubHeader(doc, "5.10. Pengaturan Komponen Payroll", y);
    y = addBody(doc, [
        "Kelola daftar komponen tunjangan dan potongan yang dapat digunakan saat membuat slip gaji.",
    ], y);
    y = addBullet(doc, [
        "Tipe: Tunjangan (Allowance) atau Potongan (Deduction).",
        "Setiap komponen memiliki: nama, tipe, jumlah default, dan status aktif.",
        "Komponen yang tidak aktif tidak muncul saat pembuatan slip gaji.",
        "Contoh Tunjangan: Tunjangan Makan, Transport, Jabatan.",
        "Contoh Potongan: BPJS, Pinjaman, Keterlambatan.",
    ], y);

    // 5.11 PPh 21
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 70);
    y = addSubHeader(doc, "5.11. Kalkulator PPh 21 (TER)", y);
    y = addBody(doc, [
        "Kalkulator pajak penghasilan berdasarkan PP 58/2023 & PMK 168/2023.",
        "Menggunakan metode Tarif Efektif Rata-rata (TER) untuk Jan–Nov",
        "dan tarif progresif Pasal 17 untuk perhitungan Desember.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Cara Menggunakan:"], y);
    y = addNumbered(doc, [
        "Masukkan Penghasilan Bruto Bulanan.",
        "Pilih Status PTKP (TK/0, TK/1, K/0, K/1, K/2, K/3, dsb).",
        "Pilih Masa Pajak (bulan 1–12).",
        "Klik \"Hitung\" — sistem menampilkan:",
    ], y);
    y = addBullet(doc, [
        "Tarif TER yang berlaku (berdasarkan kategori A/B/C).",
        "PPh 21 bulanan (Jan–Nov).",
        "PPh 21 Desember (tarif progresif — biaya jabatan, PTKP, PKP).",
        "Total PPh 21 setahun dan tarif efektif tahunan.",
        "Rincian breakdown tarif progresif.",
    ], y, 30);

    // 5.12 BPJS
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 70);
    y = addSubHeader(doc, "5.12. Kalkulator BPJS", y);
    y = addBody(doc, [
        "Kalkulator iuran BPJS Kesehatan dan BPJS Ketenagakerjaan.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Program yang dihitung:"], y);
    y = addBullet(doc, [
        "BPJS Kesehatan: 5% (4% perusahaan + 1% karyawan), cap Rp12.000.000.",
        "JHT (Jaminan Hari Tua): 5,7% (3,7% perusahaan + 2% karyawan).",
        "JKK (Jaminan Kecelakaan Kerja): 0,24%–1,74% (sepenuhnya perusahaan, berdasarkan risiko).",
        "JKM (Jaminan Kematian): 0,3% (sepenuhnya perusahaan).",
        "JP (Jaminan Pensiun): 3% (2% perusahaan + 1% karyawan), cap Rp10.547.400.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Cara Menggunakan:"], y);
    y = addNumbered(doc, [
        "Masukkan Gaji Bruto Bulanan.",
        "Pilih Tingkat Risiko JKK (1-5).",
        "Klik \"Hitung\" — hasil menampilkan rincian per program dan total.",
    ], y);

    // 5.13 Laporan
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 40);
    y = addSubHeader(doc, "5.13. Laporan & Export", y);
    y = addBody(doc, [
        "Fitur untuk mengekspor data dalam format PDF atau Excel.",
    ], y);
    y = addBullet(doc, [
        "Export Laporan Absensi — rekap kehadiran per periode.",
        "Export Data Karyawan — daftar lengkap karyawan aktif.",
        "Export Laporan Cuti — rekap pengajuan dan penggunaan cuti.",
        "Export Payroll — rekap histori dan rekapitulasi penggajian.",
        "Format tersedia: PDF (jsPDF) dan Excel (xlsx).",
    ], y);

    // 5.14 News
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 50);
    y = addSubHeader(doc, "5.14. WIG News", y);
    y = addBody(doc, [
        "Modul untuk mempublikasikan berita dan pengumuman perusahaan.",
    ], y);
    y = addSpacer(y, 3);
    y = addBody(doc, ["Cara Membuat Berita:"], y);
    y = addNumbered(doc, [
        "Klik \"Buat Berita Baru\".",
        "Isi: Judul, Konten, Kategori (Pengumuman/Event/Kebijakan/Umum).",
        "Upload media/gambar (opsional).",
        "Centang \"Sematkan\" jika ingin berita selalu tampil di atas.",
        "Klik \"Publikasikan\".",
    ], y);

    // 5.15 Helpdesk & Manajemen SLA
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 60);
    y = addSubHeader(doc, "5.15. Helpdesk & Manajemen SLA", y);
    y = addBody(doc, [
        "Pusat pengelolaan tiket bantuan dari karyawan berstandar SLA.",
    ], y);
    y = addBullet(doc, [
        "Pantau tiket dengan status (Open, In Progress, Closed) dan live chat.",
        "Pemantauan SLA: First Response (batas respons awal) & Resolution Due.",
        "SLA berjalan di Jam Bisnis. Tiket otomatis dilabeli Breached jika telat.",
    ], y);

    // 5.16 Manajemen Knowledge Base
    y = addSpacer(y, 6);
    y = checkPage(doc, y, 50);
    y = addSubHeader(doc, "5.16. Manajemen Knowledge Base", y);
    y = addBody(doc, [
        "Fitur CMS untuk dokumentasi dan panduan mandiri perusahaan.",
    ], y);
    y = addBullet(doc, [
        "Kelola kategori (HR, IT, dll) dan buat artikel berbasis Rich Text.",
        "Lihat statistik artikel, seperti jumlah View dan persentase Helpful.",
    ], y);

    // ═══════════════════════════════════════════════════════════════════
    // BAB 6: FITUR KEAMANAN
    // ═══════════════════════════════════════════════════════════════════
    doc.addPage();
    y = 20;
    y = addHeader(doc, "6. FITUR KEAMANAN", y);
    y = addSpacer(y);

    y = addSubHeader(doc, "6.1. Verifikasi Wajah (Face Recognition)", y);
    y = addBody(doc, [
        "Sistem menggunakan library face-api.js untuk AI-based face recognition.",
    ], y);
    y = addBullet(doc, [
        "Karyawan wajib mendaftarkan wajah di menu Pengaturan sebelum dapat clock-in.",
        "Saat clock-in, sistem membandingkan wajah real-time dengan data yang tersimpan.",
        "Status verifikasi: Match (cocok), Mismatch (tidak cocok), Not Registered (belum daftar).",
        "Threshold kecocokan diatur untuk meminimalkan false positive.",
    ], y);
    y = addSpacer(y, 6);

    y = addSubHeader(doc, "6.2. Validasi GPS Anti-Fake", y);
    y = addBody(doc, [
        "Sistem mendeteksi penggunaan fake GPS/location spoofing.",
    ], y);
    y = addBullet(doc, [
        "Memeriksa akurasi GPS — akurasi terlalu rendah menghasilkan peringatan.",
        "Mendeteksi pola yang mencurigakan (perubahan lokasi instan, akurasi sempurna).",
        "Peringatan ditampilkan kepada karyawan dan dicatat oleh sistem.",
    ], y);
    y = addSpacer(y, 6);

    y = checkPage(doc, y, 40);
    y = addSubHeader(doc, "6.3. Geofencing Multi-Lokasi", y);
    y = addBody(doc, [
        "Setiap lokasi kerja dikonfigurasi dengan koordinat dan radius.",
    ], y);
    y = addBullet(doc, [
        "HR menentukan titik lokasi dan radius yang valid (di Master Data > Lokasi).",
        "Karyawan di-assign ke satu atau lebih lokasi yang diizinkan.",
        "Saat clock-in, sistem menghitung jarak karyawan ke semua lokasi yang di-assign.",
        "Jika karyawan berada di luar semua radius, clock-in akan ditolak.",
        "Opsi Bypass: HR dapat mengaktifkan bypass lokasi untuk karyawan remote/WFH.",
    ], y);

    // ═══════════════════════════════════════════════════════════════════
    // BAB 7: FAQ
    // ═══════════════════════════════════════════════════════════════════
    doc.addPage();
    y = 20;
    y = addHeader(doc, "7. FREQUENTLY ASKED QUESTIONS (FAQ)", y);
    y = addSpacer(y);

    const faqs = [
        { q: "Q: Saya lupa password, bagaimana cara membukanya?", a: "A: Hubungi HR Administrator. HR dapat mengirimkan password baru ke email Anda melalui fitur sistem." },
        { q: "Q: Clock-in saya ditolak karena lokasi tidak valid, padahal saya di kantor?", a: "A: Pastikan GPS aktif dan akurasi tinggi. Coba matikan dan nyalakan ulang GPS. Jika masih gagal, hubungi HR untuk dibuatkan bypass lokasi sementara." },
        { q: "Q: Wajah saya tidak terdeteksi saat absensi?", a: "A: Pastikan pencahayaan cukup dan wajah menghadap kamera dengan jelas. Jika masih gagal, daftarkan ulang wajah di menu Pengaturan." },
        { q: "Q: Saya lupa clock-out, apa yang harus dilakukan?", a: "A: Hubungi HR untuk koreksi data. HR dapat mengedit record absensi melalui Dashboard." },
        { q: "Q: Berapa jatah cuti saya?", a: "A: Secara default, setiap karyawan mendapat 12 hari cuti tahunan. Sisa cuti dapat dilihat di halaman Beranda atau Cuti di portal karyawan." },
        { q: "Q: Bagaimana cara melihat slip gaji?", a: "A: Buka menu \"Slip Gaji\" di portal karyawan. Slip gaji diterbitkan setiap bulan oleh HR." },
        { q: "Q: Apakah sistem bisa diakses di HP?", a: "A: Ya, sistem mendukung Progressive Web App (PWA). Anda bisa mengakses melalui browser mobile atau menginstalnya sebagai aplikasi dari browser." },
    ];

    for (const faq of faqs) {
        y = checkPage(doc, y, 25);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(128, 0, 0);
        const qLines = doc.splitTextToSize(faq.q, 178);
        doc.text(qLines, 14, y);
        y += qLines.length * 5.5;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(40, 40, 40);
        const aLines = doc.splitTextToSize(faq.a, 174);
        doc.text(aLines, 18, y);
        y += aLines.length * 5.5 + 5;
    }

    // ═══════════════════════════════════════════════════════════════════
    // FOOTER / PAGE NUMBERS
    // ═══════════════════════════════════════════════════════════════════
    addPageNumbers(doc);

    // Save
    doc.save(OUTPUT_PATH);
    console.log(`✅ PDF berhasil dibuat: ${OUTPUT_PATH}`);
}

generateGuideline();

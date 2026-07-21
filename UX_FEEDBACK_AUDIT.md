# UX Feedback Audit

Dokumen ini mencatat hasil audit feedback pengguna pada aplikasi HRIS. Fokus audit adalah pesan, notifikasi, loading state, success state, error state, peringatan, dan informasi tindak lanjut yang terlihat oleh pengguna admin HR, admin GA, dan pegawai.

Audit dilakukan dengan membaca kode aplikasi. Aplikasi tidak dijalankan. Semua temuan di bawah merujuk pada kondisi yang terlihat langsung dari kode. Jika ada kondisi yang tidak dapat dipastikan hanya dari pembacaan statis, temuan tersebut diberi tanda `[tidak yakin]`.

## Komponen Bersama, Shell, dan Notifikasi

### Kondisi yang sudah ditangani

- `ToastContainer` di `src/components/Toast.tsx` menyediakan toast global dengan varian `success`, `error`, `warning`, dan `info`.
- `ConfirmModal` di `src/components/ConfirmModal.tsx` menampilkan modal konfirmasi dengan loading spinner saat `onConfirm` berjalan.
- `AppShellLoading` di `src/components/layout/AppShell.tsx` memberi pesan loading untuk layout dashboard, employee, dan GA.
- Login utama di `src/app/page.tsx` menampilkan loading saat submit, error login, error koneksi, dan cooldown setelah beberapa percobaan gagal.

### Cacat atau belum ditangani

#### T-001

- Alur atau fitur: Notification Center HR (`src/components/NotificationCenter.tsx`)
- Kondisi spesifik yang bermasalah: Gagal memuat `/api/notifications`.
- Apa yang pengguna lihat sekarang: Error ditangkap dengan `catch { /* silent */ }`. Dropdown tetap menampilkan notifikasi lama atau teks `Tidak ada notifikasi`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak dapat membedakan kondisi benar-benar tidak ada notifikasi dengan kondisi notifikasi gagal dimuat.
- Tingkat keparahan: Sedang

#### T-002

- Alur atau fitur: Notification Panel Pegawai (`src/components/layout/EmployeeNotificationPanel.tsx`)
- Kondisi spesifik yang bermasalah: Gagal memuat `/api/notifications/employee` saat dropdown dibuka atau saat badge dihitung.
- Apa yang pengguna lihat sekarang: Fetch dropdown menangkap error tanpa pesan; fetch badge juga mengabaikan error. Panel dapat menampilkan `Tidak ada notifikasi terbaru`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak mengetahui apakah memang tidak ada notifikasi atau data notifikasi gagal dimuat.
- Tingkat keparahan: Sedang

#### T-003

- Alur atau fitur: Push notification browser (`src/components/PushNotificationManager.tsx`)
- Kondisi spesifik yang bermasalah: Browser tidak mendukung push, permission notification ditolak, service worker gagal, atau subscribe gagal.
- Apa yang pengguna lihat sekarang: Komponen selalu `return null`; kegagalan hanya dicatat ke console.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak mendapat informasi bahwa notifikasi push tidak aktif atau tidak berhasil dihubungkan.
- Tingkat keparahan: Sedang

#### T-004

- Alur atau fitur: Guard portal HR, pegawai, dan GA (`src/app/dashboard/layout.tsx`, `src/app/employee/layout.tsx`, `src/app/ga/layout.tsx`)
- Kondisi spesifik yang bermasalah: Sesi tidak valid, role tidak sesuai, atau user diarahkan ke portal lain.
- Apa yang pengguna lihat sekarang: Layout menampilkan loading lalu melakukan redirect tanpa pesan penyebab redirect.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak mendapat informasi apakah sesi berakhir, akses ditolak, atau role mengarah ke portal berbeda.
- Tingkat keparahan: Sedang

#### T-005

- Alur atau fitur: Logout dari AppShell/layout
- Kondisi spesifik yang bermasalah: Permintaan logout berjalan atau gagal.
- Apa yang pengguna lihat sekarang: Handler logout melakukan fetch dan redirect tanpa loading state, success message, atau error message.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Saat koneksi lambat atau gagal, pengguna tidak melihat status proses logout.
- Tingkat keparahan: Rendah

## Dashboard HR Utama

### Kondisi yang sudah ditangani

- Saat analytics belum tersedia, beberapa area dashboard memakai skeleton/loading visual.
- Setelah data berhasil dimuat, dashboard menampilkan ringkasan statistik, aktivitas, pending list, dan waktu pembaruan.

### Cacat atau belum ditangani

#### T-006

- Alur atau fitur: Dashboard HR utama (`src/app/dashboard/page.tsx`)
- Kondisi spesifik yang bermasalah: `fetchAllData` gagal saat memuat employees, attendance, leave, news, atau analytics.
- Apa yang pengguna lihat sekarang: Error ditangkap dengan `catch { /* silent refresh failure */ }`. Pada initial load, `analytics` dapat tetap `null`; beberapa bagian tetap skeleton atau data ringkasan kosong. Tombol refresh juga tidak menampilkan error.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak mengetahui bahwa dashboard gagal diperbarui dan tidak dapat membedakan data kosong dari data yang gagal dimuat.
- Tingkat keparahan: Tinggi

## Manajemen Karyawan HR

### Kondisi yang sudah ditangani

- Daftar karyawan menampilkan teks `Memuat karyawan...` saat fetch utama berjalan.
- Gagal memuat daftar karyawan ditampilkan melalui banner `passwordMsg`.
- Kirim password memakai confirm modal, spinner per baris, success message, error message, dan pesan khusus saat email gagal terkirim.
- Modal perubahan status karyawan menampilkan loading pemeriksaan dampak, error fetch dampak, warning dampak lintas modul, syarat alasan/tanggal efektif, dan state submit.
- Dokumen karyawan menampilkan loading, validasi input, upload/delete spinner, toast success, dan toast error.
- Bulk import karyawan menampilkan validasi file, dry-run, error validasi, peringatan master data yang hilang, loading, dan hasil eksekusi.

### Cacat atau belum ditangani

#### T-007

- Alur atau fitur: Daftar karyawan, data shift (`src/app/dashboard/employees/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/shifts` untuk kolom shift gagal.
- Apa yang pengguna lihat sekarang: Fetch shift tidak memiliki catch dan tidak menampilkan pesan. Kolom shift dapat menampilkan `-`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah karyawan tidak memiliki shift atau data shift gagal dimuat.
- Tingkat keparahan: Sedang

#### T-008

- Alur atau fitur: Form tambah/edit karyawan (`src/components/EmployeeForm.tsx`)
- Kondisi spesifik yang bermasalah: Gagal memuat master data departemen, divisi, jabatan, lokasi, shift, payroll component, atau daftar karyawan.
- Apa yang pengguna lihat sekarang: Saat fetch berjalan ada `Memuat data...`; jika gagal, error hanya dicatat ke console dan form tetap tampil dengan pilihan yang dapat kosong.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui bahwa pilihan form tidak lengkap karena master data gagal dimuat.
- Tingkat keparahan: Sedang

## Absensi HR dan Persetujuan Koreksi

### Kondisi yang sudah ditangani

- Tab log absensi dan tab koreksi memiliki empty state saat tidak ada data.
- Tombol approve/reject koreksi dinonaktifkan saat `processingId` aktif.
- Export absensi dinonaktifkan saat hasil filter kosong.

### Cacat atau belum ditangani

#### T-009

- Alur atau fitur: Halaman absensi HR (`src/app/dashboard/attendance/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal attendance, correction, employees, departments, atau divisions gagal.
- Apa yang pengguna lihat sekarang: Fetch awal memakai `.then` tanpa catch dan tidak memiliki loading/error state halaman. Tabel dapat menampilkan data kosong.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak dapat membedakan tidak ada data absensi dengan data absensi yang gagal dimuat.
- Tingkat keparahan: Sedang

#### T-010

- Alur atau fitur: Approve/reject koreksi absensi HR (`src/app/dashboard/attendance/page.tsx`)
- Kondisi spesifik yang bermasalah: Approve/reject berhasil.
- Apa yang pengguna lihat sekarang: Status item diperbarui di state lokal; tidak ada pesan sukses.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna hanya melihat perubahan status jika memperhatikan tabel; tidak ada konfirmasi eksplisit bahwa tindakan berhasil diproses.
- Tingkat keparahan: Rendah

#### T-011

- Alur atau fitur: Approve/reject koreksi absensi HR (`src/app/dashboard/attendance/page.tsx`)
- Kondisi spesifik yang bermasalah: Network error saat approve/reject.
- Apa yang pengguna lihat sekarang: Error hanya dicatat dengan `console.error(e)`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mendapat pesan bahwa tindakan gagal karena koneksi atau request gagal.
- Tingkat keparahan: Sedang

#### T-012

- Alur atau fitur: Approve/reject koreksi absensi HR (`src/app/dashboard/attendance/page.tsx`)
- Kondisi spesifik yang bermasalah: Server mengembalikan response non-OK.
- Apa yang pengguna lihat sekarang: Browser alert generik `Gagal memproses pengajuan`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pesan tidak menampilkan alasan dari server atau kondisi spesifik yang membuat pengajuan gagal diproses.
- Tingkat keparahan: Sedang

#### T-013

- Alur atau fitur: Halaman koreksi absensi di dashboard (`src/app/dashboard/attendance/correction/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch riwayat koreksi gagal.
- Apa yang pengguna lihat sekarang: `fetchHistory` tidak memiliki catch, tidak ada loading state, dan tabel dapat menampilkan `Belum ada riwayat pengajuan.`
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak mengetahui apakah riwayat kosong atau gagal dimuat.
- Tingkat keparahan: Sedang

## Cuti HR

### Kondisi yang sudah ditangani

- Daftar cuti menampilkan badge status dan empty state.
- Modal detail/update menonaktifkan tombol saat `isUpdating`.
- Kalender cuti menampilkan spinner saat memuat hari libur/ulang tahun dan menampilkan indikator `Data kalender belum lengkap` jika data pendukung kalender gagal dimuat.

### Cacat atau belum ditangani

#### T-014

- Alur atau fitur: Halaman cuti HR (`src/app/dashboard/leave/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal `/api/leave` gagal.
- Apa yang pengguna lihat sekarang: Tidak ada loading/error state khusus. Statistik dapat bernilai nol dan daftar menampilkan `Tidak ada pengajuan cuti ditemukan`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah tidak ada pengajuan cuti atau data cuti gagal dimuat.
- Tingkat keparahan: Sedang

#### T-015

- Alur atau fitur: Quick action dan update status cuti (`src/app/dashboard/leave/page.tsx`)
- Kondisi spesifik yang bermasalah: Server mengembalikan non-OK atau request update gagal.
- Apa yang pengguna lihat sekarang: Handler memakai `try/finally` tanpa catch dan hanya memproses `res.ok`; tidak ada pesan error untuk non-OK.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mendapat informasi bahwa perubahan status gagal atau mengapa gagal.
- Tingkat keparahan: Sedang

#### T-016

- Alur atau fitur: Quick action dan update status cuti (`src/app/dashboard/leave/page.tsx`)
- Kondisi spesifik yang bermasalah: Perubahan status berhasil.
- Apa yang pengguna lihat sekarang: Data direfresh dan modal ditutup; tidak ada success message.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Keberhasilan hanya tersirat dari perubahan daftar atau modal yang hilang.
- Tingkat keparahan: Rendah

## Lembur HR

### Kondisi yang sudah ditangani

- Daftar lembur memiliki filter status, empty state, dan tombol aksi dinonaktifkan saat baris sedang diperbarui.
- Modal detail menampilkan status dan data pengajuan lembur.

### Cacat atau belum ditangani

#### T-017

- Alur atau fitur: Halaman lembur HR (`src/app/dashboard/overtime/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal `/api/overtime` gagal.
- Apa yang pengguna lihat sekarang: Fetch awal tidak memiliki catch/loading/error state; tabel dapat menampilkan `Tidak ada pengajuan lembur ditemukan`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah daftar lembur kosong atau data gagal dimuat.
- Tingkat keparahan: Sedang

#### T-018

- Alur atau fitur: Approve/reject lembur HR (`src/app/dashboard/overtime/page.tsx`)
- Kondisi spesifik yang bermasalah: Update status lembur gagal atau server mengembalikan non-OK.
- Apa yang pengguna lihat sekarang: Catch hanya `console.error`; non-OK tidak menampilkan pesan.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui bahwa tindakan approve/reject gagal diproses.
- Tingkat keparahan: Sedang

#### T-019

- Alur atau fitur: Approve/reject lembur HR (`src/app/dashboard/overtime/page.tsx`)
- Kondisi spesifik yang bermasalah: Update status lembur berhasil.
- Apa yang pengguna lihat sekarang: State lokal diperbarui; tidak ada success message.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Keberhasilan hanya tersirat dari perubahan status pada UI.
- Tingkat keparahan: Rendah

## Kunjungan HR

### Kondisi yang sudah ditangani

- Halaman kunjungan menampilkan filter status dan empty state.
- Tabel kunjungan menonaktifkan tombol saat item sedang diperbarui.

### Cacat atau belum ditangani

#### T-020

- Alur atau fitur: Halaman kunjungan HR (`src/app/dashboard/visits/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal `/api/visits` gagal atau hasil bukan array.
- Apa yang pengguna lihat sekarang: Error dicatat ke console, `visits` diset kosong, dan halaman dapat menampilkan daftar kosong.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah kunjungan memang kosong atau data gagal dimuat.
- Tingkat keparahan: Sedang

#### T-021

- Alur atau fitur: Tandai kunjungan sebagai sudah dicek HR (`src/app/dashboard/visits/page.tsx`)
- Kondisi spesifik yang bermasalah: Update status gagal atau server mengembalikan non-OK.
- Apa yang pengguna lihat sekarang: Catch hanya mencatat `Gagal update status kunjungan`; non-OK tidak menampilkan pesan.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui bahwa status kunjungan gagal diperbarui.
- Tingkat keparahan: Sedang

#### T-022

- Alur atau fitur: Tandai kunjungan sebagai sudah dicek HR (`src/app/dashboard/visits/page.tsx`)
- Kondisi spesifik yang bermasalah: Update status berhasil.
- Apa yang pengguna lihat sekarang: State lokal diperbarui; tidak ada success message.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Keberhasilan hanya terlihat jika pengguna memperhatikan perubahan badge/status.
- Tingkat keparahan: Rendah

## Payroll HR

### Kondisi yang sudah ditangani

- Form pembuatan slip menampilkan loading pada tombol submit.
- Jika slip berhasil dibuat, halaman menampilkan pesan `Slip gaji berhasil dibuat!`.
- Bulk payroll menampilkan modal konfirmasi, loading `Memproses...`, dan hasil jumlah slip yang dibuat/dilewati.

### Cacat atau belum ditangani

#### T-023

- Alur atau fitur: Halaman payroll HR (`src/app/dashboard/payroll/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal employees, payslips, payroll components, departments, divisions, atau overtime gagal.
- Apa yang pengguna lihat sekarang: Fetch awal memakai beberapa `.then` tanpa catch dan tanpa loading/error halaman.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah data payroll kosong atau data pendukung gagal dimuat.
- Tingkat keparahan: Sedang

#### T-024

- Alur atau fitur: Buat slip gaji manual (`src/app/dashboard/payroll/page.tsx`)
- Kondisi spesifik yang bermasalah: Server mengembalikan non-OK atau fetch submit gagal.
- Apa yang pengguna lihat sekarang: Handler hanya memberi pesan jika `res.ok`. Tidak ada catch dan tidak ada pesan error untuk non-OK.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui bahwa pembuatan slip gagal atau alasan gagalnya.
- Tingkat keparahan: Tinggi

#### T-025

- Alur atau fitur: Hapus slip gaji dari riwayat (`src/app/dashboard/payroll/components/PayrollHistoryTab.tsx`)
- Kondisi spesifik yang bermasalah: Delete slip gagal, sedang berjalan, atau berhasil.
- Apa yang pengguna lihat sekarang: Ada browser confirm sebelum delete. Jika `res.ok`, item dihapus dari state. Tidak ada loading, success message, catch, atau error message untuk non-OK.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mendapat status proses delete dan tidak mendapat informasi saat delete gagal.
- Tingkat keparahan: Sedang

## Master Data HR

### Kondisi yang sudah ditangani

- Submit departemen, divisi, jabatan, dan lokasi menampilkan loading serta pesan success/error di modal.
- Pencarian lokasi dan deteksi GPS menampilkan toast untuk gagal GPS, lokasi tidak ditemukan, atau error pencarian.
- Hapus data memakai confirm modal.

### Cacat atau belum ditangani

#### T-026

- Alur atau fitur: Halaman master data (`src/app/dashboard/master-data/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal departments, divisions, positions, atau locations gagal.
- Apa yang pengguna lihat sekarang: Loading ditampilkan saat fetch berjalan; catch hanya `console.error`; setelah selesai tab dapat kosong.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui master data gagal dimuat.
- Tingkat keparahan: Sedang

#### T-027

- Alur atau fitur: Hapus divisi, jabatan, lokasi, dan departemen (`src/app/dashboard/master-data/page.tsx`)
- Kondisi spesifik yang bermasalah: Delete mengembalikan non-OK.
- Apa yang pengguna lihat sekarang: Delete departemen hanya menampilkan toast jika `data.error` tersedia. Delete divisi, jabatan, dan lokasi tidak menampilkan pesan untuk non-OK.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin dapat melihat modal tertutup atau loading selesai tanpa tahu bahwa delete tidak berhasil.
- Tingkat keparahan: Sedang

## Master Payroll HR

### Kondisi yang sudah ditangani

- Submit komponen payroll menampilkan loading serta pesan success/error.
- Delete komponen memakai confirm modal.

### Cacat atau belum ditangani

#### T-028

- Alur atau fitur: Master payroll (`src/app/dashboard/master-payroll/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal komponen payroll gagal.
- Apa yang pengguna lihat sekarang: Loading ditampilkan saat fetch berjalan; catch hanya `console.error`; halaman dapat menampilkan `Belum ada komponen payroll`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah komponen payroll kosong atau gagal dimuat.
- Tingkat keparahan: Sedang

#### T-029

- Alur atau fitur: Hapus komponen payroll (`src/app/dashboard/master-payroll/page.tsx`)
- Kondisi spesifik yang bermasalah: Delete mengembalikan non-OK atau berhasil.
- Apa yang pengguna lihat sekarang: Non-OK tidak menampilkan pesan; success hanya memanggil `fetchData`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mendapat informasi eksplisit saat delete gagal atau berhasil.
- Tingkat keparahan: Sedang

## News HR

### Kondisi yang sudah ditangani

- Upload media menampilkan loading dan toast error.
- Form membuat/mengedit berita menonaktifkan tombol saat loading/uploading.
- Hapus berita memakai confirm modal.

### Cacat atau belum ditangani

#### T-030

- Alur atau fitur: Halaman news HR (`src/app/dashboard/news/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal `/api/news` gagal.
- Apa yang pengguna lihat sekarang: Fetch awal tidak memiliki catch/loading/error state. Halaman dapat menampilkan `Belum ada berita`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah belum ada berita atau berita gagal dimuat.
- Tingkat keparahan: Sedang

#### T-031

- Alur atau fitur: Tambah/edit berita (`src/app/dashboard/news/page.tsx`)
- Kondisi spesifik yang bermasalah: Submit create/edit mengembalikan non-OK atau fetch submit gagal.
- Apa yang pengguna lihat sekarang: Jika `res.ok`, modal ditutup dan list diupdate. Untuk non-OK tidak ada pesan; tidak ada catch pada submit.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui bahwa berita gagal disimpan atau alasan gagalnya.
- Tingkat keparahan: Tinggi

#### T-032

- Alur atau fitur: Hapus berita dan toggle pin (`src/app/dashboard/news/page.tsx`)
- Kondisi spesifik yang bermasalah: Delete/toggle pin gagal atau berhasil.
- Apa yang pengguna lihat sekarang: Success hanya mengubah state lokal. Non-OK dan network error tidak ditampilkan untuk delete/toggle pin.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mendapat konfirmasi eksplisit ketika perubahan berhasil dan tidak mendapat pesan ketika perubahan gagal.
- Tingkat keparahan: Sedang

## Reports, Audit, Letter Requests, Shifts, dan Asset Monitoring HR

### Kondisi yang sudah ditangani

- Preview/download report menampilkan loading dan error jika export gagal.
- Calculator BPJS dan PPh21 menampilkan validasi input, loading `Menghitung...`, dan pesan error server/koneksi.
- User admin management menampilkan loading, toast success/error, warning saat email tidak terkirim, dan confirm modal untuk aksi sensitif.
- Letter request action modal menampilkan loading, toast success, dan toast error pada submit.

### Cacat atau belum ditangani

#### T-033

- Alur atau fitur: Filter reports (`src/app/dashboard/reports/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch master divisions, departments, atau employees gagal saat halaman reports dibuka.
- Apa yang pengguna lihat sekarang: Catch kosong `catch(() => {})`; filter dapat kosong tanpa pesan.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui bahwa pilihan filter laporan tidak lengkap karena data master gagal dimuat.
- Tingkat keparahan: Sedang

#### T-034

- Alur atau fitur: Informasi format report (`src/app/dashboard/reports/page.tsx`)
- Kondisi spesifik yang bermasalah: Halaman menyediakan tombol Excel dan PDF, tetapi info box menyatakan `Format: .xlsx (Excel)`.
- Apa yang pengguna lihat sekarang: Informasi format hanya menyebut `.xlsx` walaupun tombol PDF tersedia.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Informasi yang terlihat tidak mencakup semua format output yang dapat dipilih.
- Tingkat keparahan: Rendah

#### T-035

- Alur atau fitur: Audit log (`src/app/dashboard/audit/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch audit log gagal.
- Apa yang pengguna lihat sekarang: Loading row muncul saat fetch berjalan; catch hanya `console.error`; setelah loading selesai tabel dapat menampilkan `Tidak ada jejak audit yang ditemukan.`
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah tidak ada audit log atau data audit gagal dimuat.
- Tingkat keparahan: Sedang

#### T-036

- Alur atau fitur: Letter requests HR (`src/app/dashboard/letter-requests/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch list `/api/letter-requests` mengembalikan HTTP non-OK dengan body error.
- Apa yang pengguna lihat sekarang: Kode hanya memanggil `r.json()` lalu mengisi state jika data array; toast error hanya ada di catch network.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mendapat error jika server menjawab non-OK dengan payload error.
- Tingkat keparahan: Sedang

#### T-037

- Alur atau fitur: Shift kerja (`src/app/dashboard/shifts/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal `/api/shifts` gagal.
- Apa yang pengguna lihat sekarang: Tidak ada catch/loading awal; halaman dapat menampilkan `Belum ada shift`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah shift belum dibuat atau gagal dimuat.
- Tingkat keparahan: Sedang

#### T-038

- Alur atau fitur: Tambah/edit shift (`src/app/dashboard/shifts/page.tsx`)
- Kondisi spesifik yang bermasalah: Submit shift mengembalikan non-OK atau fetch gagal.
- Apa yang pengguna lihat sekarang: Tombol menampilkan spinner saat `loading`; jika `res.ok`, modal ditutup. Tidak ada pesan error untuk non-OK dan tidak ada catch pada request submit.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui bahwa shift gagal disimpan.
- Tingkat keparahan: Tinggi

#### T-039

- Alur atau fitur: Hapus shift dan set default shift (`src/app/dashboard/shifts/page.tsx`)
- Kondisi spesifik yang bermasalah: Delete atau set default gagal atau berhasil.
- Apa yang pengguna lihat sekarang: Delete memakai confirm modal. `onConfirm` hanya memproses `res.ok`; set default hanya refresh jika `res.ok`. Tidak ada success/error message.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mendapat feedback eksplisit bahwa aksi berhasil atau gagal.
- Tingkat keparahan: Sedang

#### T-040

- Alur atau fitur: Asset monitoring HR (`src/app/dashboard/assets/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch aset, stats, atau kategori gagal.
- Apa yang pengguna lihat sekarang: Catch hanya `console.error("Failed to load GA data")`; setelah loading selesai tabel dapat menampilkan `Tidak ada aset ditemukan`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin HR tidak mengetahui apakah data aset kosong atau gagal dimuat.
- Tingkat keparahan: Sedang

#### T-041

- Alur atau fitur: Modal riwayat aset di HR asset monitoring (`src/app/dashboard/assets/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch riwayat perpindahan aset gagal.
- Apa yang pengguna lihat sekarang: Fetch history tidak memiliki catch; modal dapat berhenti di empty state `Belum ada riwayat perpindahan`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin tidak mengetahui apakah aset tidak punya riwayat atau riwayat gagal dimuat.
- Tingkat keparahan: Sedang

## Portal Pegawai: Home, News, dan To-Do

### Kondisi yang sudah ditangani

- Home pegawai menampilkan fallback nama, jabatan, statistik, dan informasi aktif.
- News pegawai memiliki filter kategori, detail modal, preview media, dan download lampiran.
- To-do menampilkan loading saat menambah item baru.

### Cacat atau belum ditangani

#### T-042

- Alur atau fitur: Home pegawai (`src/app/employee/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/auth/me`, `/api/news`, atau `/api/attendance` gagal.
- Apa yang pengguna lihat sekarang: Fetch tidak memiliki catch/loading/error. UI dapat menampilkan fallback `Sobat`, `Tidak ada informasi aktif.`, total kehadiran 0, atau sisa cuti default.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui apakah data pribadinya kosong/default atau gagal dimuat.
- Tingkat keparahan: Sedang

#### T-043

- Alur atau fitur: News pegawai (`src/app/employee/news/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/news` gagal.
- Apa yang pengguna lihat sekarang: Tidak ada loading/error/catch; halaman menampilkan `Tidak ada berita`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak dapat membedakan tidak ada berita dengan berita gagal dimuat.
- Tingkat keparahan: Sedang

#### T-044

- Alur atau fitur: To-do pegawai (`src/app/employee/todos/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch awal `/api/todos` gagal.
- Apa yang pengguna lihat sekarang: Tidak ada loading/error/catch; halaman menampilkan `Belum ada catatan`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui apakah to-do kosong atau gagal dimuat.
- Tingkat keparahan: Sedang

#### T-045

- Alur atau fitur: Tambah, toggle, dan hapus to-do (`src/app/employee/todos/page.tsx`)
- Kondisi spesifik yang bermasalah: Request POST, PUT, atau DELETE gagal.
- Apa yang pengguna lihat sekarang: Add todo hanya memperbarui list jika `res.ok`; tidak ada error message untuk non-OK dan tidak ada catch. Toggle/delete juga tidak punya loading atau error message.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui bahwa perubahan to-do gagal disimpan.
- Tingkat keparahan: Tinggi

## Portal Pegawai: Absensi dan Riwayat Kehadiran

### Kondisi yang sudah ditangani

- Absensi pegawai menampilkan status GPS, status verifikasi wajah, warning GPS, error kamera, status face mismatch/no face/not registered, toast sukses, toast error submit, dan redirect setelah clock in/out berhasil.
- Tombol submit absensi dinonaktifkan sampai foto, GPS valid, dan verifikasi wajah memenuhi syarat.

### Cacat atau belum ditangani

#### T-046

- Alur atau fitur: Absensi pegawai, data absensi hari ini (`src/app/employee/attendance/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/attendance` untuk mencari record hari ini gagal.
- Apa yang pengguna lihat sekarang: Error hanya dicatat oleh client logger. `todayRecord` tetap `null`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui bahwa status absensi hari ini gagal dimuat; UI dapat tetap menganggap pegawai belum clock in.
- Tingkat keparahan: Tinggi

#### T-047

- Alur atau fitur: Absensi pegawai, descriptor wajah (`src/app/employee/attendance/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/auth/face` gagal. `[tidak yakin]`
- Apa yang pengguna lihat sekarang: Error hanya dicatat oleh client logger. Saat capture, `registeredDescriptor` tetap `null` dan UI memakai pesan `Wajah belum terdaftar. Daftarkan di Pengaturan.`
- Mengapa itu tidak cukup dari sudut pandang pengguna: Kondisi gagal memuat descriptor dan kondisi wajah belum terdaftar tidak dibedakan di UI.
- Tingkat keparahan: Sedang

#### T-048

- Alur atau fitur: Absensi pegawai, capture foto (`src/app/employee/attendance/page.tsx`)
- Kondisi spesifik yang bermasalah: Canvas 2D context gagal dibuat.
- Apa yang pengguna lihat sekarang: Kode hanya mencatat `Gagal mendapatkan 2D context dari canvas` dan return tanpa pesan pengguna.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui mengapa capture/verifikasi tidak berlanjut.
- Tingkat keparahan: Rendah

#### T-049

- Alur atau fitur: Riwayat kehadiran pegawai (`src/app/employee/attendance-history/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/attendance` gagal atau mengembalikan non-array.
- Apa yang pengguna lihat sekarang: Loading spinner hilang setelah `.finally`; halaman dapat menampilkan `Tidak ada data kehadiran` untuk periode yang dipilih.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui apakah riwayat kosong atau gagal dimuat.
- Tingkat keparahan: Sedang

## Portal Pegawai: Koreksi Absensi, Cuti, Lembur, dan Slip Gaji

### Kondisi yang sudah ditangani

- Koreksi absensi pegawai menampilkan info syarat pengajuan, validasi tanggal, validasi minimal jam masuk/keluar, upload feedback, loading submit, toast success, dan toast error submit.
- Pengajuan cuti menampilkan warning sisa cuti habis/rendah, validasi file, loading submit, toast success, dan toast error server.
- Pengajuan lembur menampilkan loading submit, success message, error message, dan status pengajuan.
- Slip gaji menampilkan detail modal dan tombol PDF.

### Cacat atau belum ditangani

#### T-050

- Alur atau fitur: Riwayat koreksi absensi pegawai (`src/app/employee/attendance/correction/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch list koreksi mengembalikan HTTP non-OK.
- Apa yang pengguna lihat sekarang: Kode langsung membaca JSON dan hanya update state jika data array. Toast error hanya ada di catch network.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mendapat error jika server menjawab non-OK dengan payload error.
- Tingkat keparahan: Sedang

#### T-051

- Alur atau fitur: Cuti pegawai, fetch awal (`src/app/employee/leave/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/leave` gagal.
- Apa yang pengguna lihat sekarang: Tidak ada loading/error/catch; saldo cuti tetap default `{ total: 12, used: 0 }` dan riwayat dapat menampilkan `Belum ada pengajuan`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai dapat melihat saldo/riwayat default tanpa mengetahui bahwa data cuti gagal dimuat.
- Tingkat keparahan: Tinggi

#### T-052

- Alur atau fitur: Submit pengajuan cuti pegawai (`src/app/employee/leave/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch submit cuti gagal karena network/exception.
- Apa yang pengguna lihat sekarang: Handler tidak memiliki try/catch; `setLoading(false)` hanya berada setelah response diproses.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mendapat pesan error koneksi saat pengajuan gagal terkirim.
- Tingkat keparahan: Tinggi

#### T-053

- Alur atau fitur: Lembur pegawai, fetch awal (`src/app/employee/overtime/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/overtime` gagal.
- Apa yang pengguna lihat sekarang: Fetch awal tidak memiliki catch/loading/error; halaman dapat menampilkan `Belum ada pengajuan lembur`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui apakah lembur kosong atau gagal dimuat.
- Tingkat keparahan: Sedang

#### T-054

- Alur atau fitur: Slip gaji pegawai (`src/app/employee/payslip/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/payslips` gagal.
- Apa yang pengguna lihat sekarang: Tidak ada loading/error/catch; halaman menampilkan `Belum ada slip gaji`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui apakah slip belum diterbitkan atau gagal dimuat.
- Tingkat keparahan: Sedang

## Portal Pegawai: Dokumen, Aset, Kunjungan, Monitoring, dan Settings

### Kondisi yang sudah ditangani

- Dokumen/surat pegawai menampilkan info cara kerja, validasi tujuan, loading submit, toast success, toast error submit, timeline status, dan catatan HR.
- Aset pegawai menampilkan loading awal, status tiket, tanggapan GA, loading submit, toast success, dan toast error submit.
- Kunjungan pegawai menampilkan error load list jika data bukan array atau catch network, success message untuk draft/clock in/clock out/delete, error delete, validasi lokasi, syarat minimal foto, dan loading submit.
- Settings password menampilkan validasi panjang password, mismatch confirmation, strength indicator, loading submit, success message, dan error message.
- Registrasi wajah menampilkan status model/kamera/deteksi/simpan, step indicator, success, error model, error kamera, error deteksi, dan error simpan.

### Cacat atau belum ditangani

#### T-055

- Alur atau fitur: Dokumen/surat pegawai, riwayat request (`src/app/employee/documents/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/letter-requests` mengembalikan HTTP non-OK.
- Apa yang pengguna lihat sekarang: Kode hanya mengisi state jika data array; toast error hanya muncul di catch network.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mendapat pesan saat server menolak/ gagal mengirim list dengan response non-OK.
- Tingkat keparahan: Sedang

#### T-056

- Alur atau fitur: Aset pegawai, fetch awal (`src/app/employee/assets/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/employee/assets` mengembalikan HTTP non-OK.
- Apa yang pengguna lihat sekarang: Jika `res.ok`, assets/tickets diset. Untuk non-OK tidak ada pesan. Setelah loading selesai, UI dapat menampilkan `Tidak ada aset` dan `Belum ada tiket`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui apakah benar tidak punya aset/tiket atau data gagal dimuat.
- Tingkat keparahan: Sedang

#### T-057

- Alur atau fitur: Kunjungan pegawai, foto bukti (`src/app/employee/visits/components/MultiPhotoCapture.tsx`)
- Kondisi spesifik yang bermasalah: Akses kamera ditolak atau gagal saat mengambil foto bukti.
- Apa yang pengguna lihat sekarang: Catch kamera kosong. Tombol kamera berhenti loading tanpa pesan error.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui bahwa kamera gagal diakses, sementara clock in/out mensyaratkan minimal dua foto.
- Tingkat keparahan: Tinggi

#### T-058

- Alur atau fitur: Buat draft kunjungan (`src/app/employee/visits/components/CreateDraftModal.tsx`)
- Kondisi spesifik yang bermasalah: Geolocation awal gagal.
- Apa yang pengguna lihat sekarang: Callback error `getCurrentPosition` mengembalikan `undefined`; peta tetap memakai koordinat default awal.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui bahwa posisi perangkat tidak berhasil dipakai sebagai titik awal peta.
- Tingkat keparahan: Rendah

#### T-059

- Alur atau fitur: Monitoring tim pegawai (`src/app/employee/monitoring/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/employees` gagal.
- Apa yang pengguna lihat sekarang: Catch hanya `setLoading(false)`; halaman dapat menampilkan `Tidak ada anggota tim yang ditemukan.`
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pegawai tidak mengetahui apakah memang tidak punya anggota tim atau data monitoring gagal dimuat.
- Tingkat keparahan: Sedang

#### T-060

- Alur atau fitur: Detail monitoring 360 pegawai (`src/app/employee/monitoring/[id]/page.tsx`)
- Kondisi spesifik yang bermasalah: User tidak diizinkan melihat employee yang dipilih.
- Apa yang pengguna lihat sekarang: Server component mengembalikan teks `Forbidden`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pesan tidak menjelaskan konteks akses monitoring atau langkah lanjutan.
- Tingkat keparahan: Rendah

#### T-061

- Alur atau fitur: Settings registrasi wajah, cek status wajah (`src/app/employee/settings/components/FaceRegistrationCard.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/auth/face` gagal saat cek status awal. `[tidak yakin]`
- Apa yang pengguna lihat sekarang: Catch mencatat error dan menyetel `faceStatus` menjadi `not_registered`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Status `Belum` dapat berarti wajah belum terdaftar atau status gagal dimuat.
- Tingkat keparahan: Sedang

#### T-062

- Alur atau fitur: Settings registrasi wajah, hapus data wajah (`src/app/employee/settings/components/FaceRegistrationCard.tsx`)
- Kondisi spesifik yang bermasalah: Pengguna menekan tombol `Hapus` data wajah.
- Apa yang pengguna lihat sekarang: Tombol langsung menjalankan DELETE dengan loading dan success/error message, tanpa dialog konfirmasi atau warning sebelum penghapusan.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak mendapat peringatan eksplisit sebelum aksi yang menghapus data biometrik login/absensi.
- Tingkat keparahan: Sedang

## GA: Dashboard, Listing Aset, Form, dan Assign

### Kondisi yang sudah ditangani

- GA dashboard menampilkan spinner saat loading.
- Listing aset GA menampilkan loading table, export loading, delete confirmation modal dengan warning permanen, dan alert error untuk delete/export.
- Create/edit asset menampilkan inline error dan saving state.
- Assign asset menampilkan loading konfigurasi, inline error submit, dan tombol `Memproses...`.

### Cacat atau belum ditangani

#### T-063

- Alur atau fitur: Dashboard GA (`src/app/ga/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch stats atau recent assets gagal.
- Apa yang pengguna lihat sekarang: `try/finally` tidak memiliki catch. Setelah loading false, stats dapat null dan recent kosong tanpa pesan.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui apakah aset tersedia kosong atau dashboard gagal memuat data.
- Tingkat keparahan: Sedang

#### T-064

- Alur atau fitur: Listing aset GA (`src/app/ga/assets/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch assets, stats, atau categories gagal.
- Apa yang pengguna lihat sekarang: Catch hanya `console.error`; table dapat menampilkan `Tidak ada aset ditemukan`, stats tetap default/null, dan filter kategori kosong.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak dapat membedakan hasil filter kosong dari kegagalan memuat data.
- Tingkat keparahan: Sedang

#### T-065

- Alur atau fitur: Asset form (`src/features/ga/components/AssetForm.tsx`)
- Kondisi spesifik yang bermasalah: Gagal memuat categories atau employees untuk form.
- Apa yang pengguna lihat sekarang: Saat loading tampil `Memuat konfigurasi form...`; jika gagal, error hanya dicatat ke console dan form tetap tampil dengan pilihan yang dapat kosong.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui bahwa pilihan kategori/karyawan tidak lengkap.
- Tingkat keparahan: Sedang

#### T-066

- Alur atau fitur: Assign asset (`src/app/ga/assets/[id]/assign/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch asset atau employees gagal/non-OK.
- Apa yang pengguna lihat sekarang: Catch hanya console. Jika asset tidak terisi, halaman menampilkan `Aset tidak ditemukan.`; jika employees gagal, combobox dapat kosong.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui apakah aset benar tidak ada atau data gagal dimuat, dan tidak tahu jika daftar karyawan gagal tersedia.
- Tingkat keparahan: Sedang

## GA: Detail Aset, Riwayat, Inspeksi, Maintenance, Scan, dan Print

### Kondisi yang sudah ditangani

- Detail aset menampilkan loading `Memuat aset...` dan fallback `Aset tidak ditemukan.`
- Retire memakai `ConfirmDialog` dengan loading.
- Form inspeksi dan maintenance menampilkan loading submit.
- History tab menampilkan loading, empty state, upload BAST loading, dan alert error upload.
- GA scanner menampilkan loading kamera, error QR invalid, error asset tidak ditemukan, action sheet hasil scan, dan loading `Mencari Data Aset...`.
- Print label menonaktifkan tombol cetak saat tidak ada aset dipilih.

### Cacat atau belum ditangani

#### T-067

- Alur atau fitur: Detail aset GA (`src/app/ga/assets/[id]/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch detail aset gagal karena network atau error selain 401/403.
- Apa yang pengguna lihat sekarang: Catch hanya `console.error`; setelah loading selesai, jika `asset` null halaman menampilkan `Aset tidak ditemukan.`
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak dapat membedakan aset benar tidak ada dengan data detail gagal dimuat.
- Tingkat keparahan: Sedang

#### T-068

- Alur atau fitur: Tab history aset GA (`src/app/ga/assets/[id]/page.tsx`, `src/app/ga/assets/[id]/components/HistoryTab.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/assets/history` gagal.
- Apa yang pengguna lihat sekarang: Error hanya dicatat ke console; `historyLoaded` tetap diset setelah promise selesai, lalu tab dapat menampilkan `Belum ada riwayat mutasi.`
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui apakah riwayat kosong atau gagal dimuat.
- Tingkat keparahan: Sedang

#### T-069

- Alur atau fitur: Tab inspeksi dan maintenance aset GA (`src/app/ga/assets/[id]/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/inspect` atau `/maintenance` gagal.
- Apa yang pengguna lihat sekarang: Fetch lazy-load tidak memiliki catch. Untuk response non-OK, data diubah menjadi array kosong; untuk exception, loaded flag tidak diset.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA dapat melihat empty state yang tidak membedakan gagal load, atau loading `Memuat inspeksi...`/`Memuat riwayat servis...` yang tidak selesai pada exception.
- Tingkat keparahan: Tinggi

#### T-070

- Alur atau fitur: Retire aset, simpan inspeksi, simpan maintenance (`src/app/ga/assets/[id]/page.tsx`)
- Kondisi spesifik yang bermasalah: Request submit gagal karena network atau server non-OK.
- Apa yang pengguna lihat sekarang: Non-OK memakai alert generik seperti `Gagal menyimpan inspeksi`; catch hanya `console.error` tanpa pesan pengguna.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mendapat alasan spesifik atau pesan apa pun untuk kegagalan network.
- Tingkat keparahan: Sedang

#### T-071

- Alur atau fitur: Hapus dokumen BAST (`src/app/ga/assets/[id]/components/HistoryTab.tsx`)
- Kondisi spesifik yang bermasalah: Delete BAST gagal karena network.
- Apa yang pengguna lihat sekarang: Catch hanya `console.error`; tidak ada pesan pengguna.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui bahwa dokumen BAST gagal dihapus.
- Tingkat keparahan: Rendah

#### T-072

- Alur atau fitur: Scan QR aset GA (`src/app/ga/scan/page.tsx`)
- Kondisi spesifik yang bermasalah: Error runtime scanner/kamera pada callback error `Html5QrcodeScanner.render`.
- Apa yang pengguna lihat sekarang: Callback error kedua kosong `(error) => {}`. UI dapat tetap menampilkan area scanner atau `Mempersiapkan Kamera...` tanpa pesan error.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui alasan kamera/scan tidak berjalan.
- Tingkat keparahan: Tinggi

#### T-073

- Alur atau fitur: Cetak label QR (`src/app/ga/assets/print/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch kategori atau aset gagal.
- Apa yang pengguna lihat sekarang: Catch hanya `console.error`; setelah loading selesai daftar pilihan dapat kosong tanpa pesan error.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui apakah memang tidak ada aset yang bisa dicetak atau data gagal dimuat.
- Tingkat keparahan: Sedang

## GA: Import, SIM Card, Categories, Tickets, dan Public QR

### Kondisi yang sudah ditangani

- Import aset massal menampilkan validasi format file, error parsing, error header/prefix, batas 300 baris, loading parsing, loading submit, error server, dan halaman sukses berisi jumlah aset terdaftar.
- Listing SIM menampilkan loading table, empty state, dan delete confirmation modal.
- Categories menampilkan loading awal, inline error create, confirm delete dengan peringatan jika kategori masih terhubung aset, dan alert error untuk delete/update.
- Tickets GA menampilkan loading list, toast error network, loading submit, toast success, dan toast error submit.
- Public QR login modal menampilkan loading login dan error login.
- Public QR sukses inspeksi menampilkan `Inspeksi Tersimpan` dan `Data berhasil tercatat`.

### Cacat atau belum ditangani

#### T-074

- Alur atau fitur: Import aset massal, template kategori (`src/app/ga/assets/import/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch kategori untuk template gagal. `[tidak yakin]`
- Apa yang pengguna lihat sekarang: Catch kategori kosong. Validasi upload nanti dapat menampilkan `Sistem gagal memuat daftar kategori. Harap segarkan halaman.`, tetapi tombol `Unduh Template` tetap memakai `categoryList` yang dapat kosong.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak diberi tahu saat template diunduh dengan daftar kategori yang tidak berhasil dimuat.
- Tingkat keparahan: Rendah

#### T-075

- Alur atau fitur: SIM card dashboard (`src/app/ga/sim/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch SIM list atau stats gagal.
- Apa yang pengguna lihat sekarang: Catch hanya `console.error`; halaman dapat menampilkan `Tidak ada SIM Card ditemukan` dan stats 0.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui apakah SIM kosong atau data SIM gagal dimuat.
- Tingkat keparahan: Sedang

#### T-076

- Alur atau fitur: Export SIM (`src/app/ga/sim/page.tsx`)
- Kondisi spesifik yang bermasalah: Pengguna menekan tombol `Export`.
- Apa yang pengguna lihat sekarang: Browser alert `Fitur Export Spreadsheet ditambahkan.`
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pesan menyatakan fitur ditambahkan, tetapi tidak ada file export yang dihasilkan oleh handler.
- Tingkat keparahan: Rendah

#### T-077

- Alur atau fitur: SIM card form (`src/features/ga/components/SimCardForm.tsx`)
- Kondisi spesifik yang bermasalah: Fetch employees untuk pilihan pemegang SIM gagal.
- Apa yang pengguna lihat sekarang: Saat fetch berjalan tampil `Memuat konfigurasi form...`; jika gagal, error hanya dicatat ke console dan form tetap tampil dengan select karyawan kosong.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui bahwa pilihan karyawan gagal dimuat.
- Tingkat keparahan: Sedang

#### T-078

- Alur atau fitur: Categories GA (`src/app/ga/categories/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch kategori awal gagal.
- Apa yang pengguna lihat sekarang: Catch hanya `console.error`; tabel dapat menampilkan `Tidak ada kategori data.`
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui apakah kategori belum ada atau gagal dimuat.
- Tingkat keparahan: Sedang

#### T-079

- Alur atau fitur: Categories GA create/edit/delete (`src/app/ga/categories/page.tsx`)
- Kondisi spesifik yang bermasalah: Create/edit/delete berhasil.
- Apa yang pengguna lihat sekarang: Create mengosongkan form dan refresh list. Edit menutup mode edit dan refresh list. Delete refresh list. Tidak ada success message.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Keberhasilan aksi hanya tersirat dari perubahan list/form.
- Tingkat keparahan: Rendah

#### T-080

- Alur atau fitur: Tickets GA, fetch awal (`src/app/ga/tickets/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/ga/tickets` mengembalikan HTTP non-OK.
- Apa yang pengguna lihat sekarang: Toast error hanya ada di catch network. Untuk non-OK, tickets tetap default dan halaman dapat menampilkan `Tidak ada tiket`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Admin GA tidak mengetahui apakah tidak ada tiket atau server menolak/gagal mengirim data tiket.
- Tingkat keparahan: Sedang

#### T-081

- Alur atau fitur: Tickets GA, tindak lanjut status (`src/app/ga/tickets/page.tsx`)
- Kondisi spesifik yang bermasalah: Update status tiket mengembalikan non-OK.
- Apa yang pengguna lihat sekarang: Toast generik `Gagal memperbarui status.`
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pesan tidak menampilkan alasan spesifik dari server jika ada.
- Tingkat keparahan: Rendah

#### T-082

- Alur atau fitur: Public QR asset page (`src/app/scan/[id]/page.tsx`)
- Kondisi spesifik yang bermasalah: Fetch `/api/public/assets/[id]` gagal karena network.
- Apa yang pengguna lihat sekarang: Fetch tidak memiliki catch/finally; loading spinner tetap menjadi state utama.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak mendapat informasi bahwa data QR gagal dimuat.
- Tingkat keparahan: Tinggi

#### T-083

- Alur atau fitur: Public QR inspection sheet (`src/app/scan/[id]/page.tsx`)
- Kondisi spesifik yang bermasalah: Submit inspeksi publik mengembalikan non-OK atau gagal network.
- Apa yang pengguna lihat sekarang: Handler hanya memanggil `onSuccess()` jika `res.ok`; non-OK tidak menampilkan pesan dan catch hanya `console.error`.
- Mengapa itu tidak cukup dari sudut pandang pengguna: Pengguna tidak mengetahui bahwa inspeksi gagal disimpan.
- Tingkat keparahan: Tinggi

## Ringkasan Keseluruhan

- Total temuan cacat atau belum ditangani: 83
- Kritis/Tinggi: 13
- Sedang: 56
- Rendah: 14
- Alur dengan celah terbanyak: Manajemen Aset GA dan Public QR, terutama listing aset, form aset, detail aset, riwayat/inspeksi/maintenance, scanner, print label, SIM, categories, tickets, dan public QR.
- Area HR dengan celah terbanyak: Operasional admin HR yang memuat data awal dan aksi status, terutama absensi, cuti, lembur, kunjungan, payroll, news, shifts, reports, audit, dan asset monitoring.
- Area pegawai dengan celah terbanyak: Data awal portal pegawai dan alur harian, terutama home, news, to-do, absensi, cuti, slip gaji, aset, dokumen, kunjungan, monitoring, dan settings wajah.

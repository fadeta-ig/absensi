# Scope: Modul Checklist Kebersihan GA

Modul internal untuk mendigitalisasi checklist kebersihan bulanan Sanitasi Grey Area dan Ruangan. WIG002 mengelola master dan periode, petugas mengerjakan checklist hari ini, lalu dua karyawan internal memberi tanda tangan bulanan.

**Build approach:** Tracer Bullet (buktikan satu alur nyata lintas akses, data, API, dan antarmuka sebelum menambah keluasan).
**Workflow:** Beta (`/check verify`, lalu `/test` setelah `/develop`). `/architect` tetap menjadi langkah pertama ketika keputusan data, akses, atau alur masih perlu dituangkan ke dalam spec.

_Ini rekomendasi untuk menjaga pembangunan tetap teratur. Anda dapat melewati langkah yang tidak diperlukan, dan Anda yang menentukan kapan fitur dianggap selesai._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Autentikasi dan kontrol akses | Existing | existing |
| B | Master karyawan dan akun internal | Existing | existing |
| C | Operasional portal GA | Existing | existing |
| D | Portal layanan mandiri karyawan | Existing | existing |
| 1 | Core cleaning loop | Slice 1 | done |
| 2 | Master dinamis dan identitas petugas | Slice 2 | planned |
| 3 | Tanda tangan bulanan | Slice 3 | planned |
| 4 | PDF dan audit | Slice 4 | planned |

## Existing product

### A. Autentikasi dan kontrol akses · existing
Login, sesi JWT, role, permission, revokasi sesi, serta pemisahan portal HR, GA, dan employee sudah aktif. code in `src/lib/auth.ts`, `src/lib/permissions.ts`, `src/proxy.ts` (basis: implementasi aktif dan root `AGENTS.md`)

### B. Master karyawan dan akun internal · existing
Master Employee dan UserAccount sudah menyediakan identitas karyawan, akun login, relasi role, serta portal employee. code in `src/app/dashboard/employees/`, `src/app/dashboard/users/`, `prisma/schema.prisma` (basis: implementasi aktif)

### C. Operasional portal GA · existing
Portal GA sudah memiliki master data, inspeksi berbentuk checklist, Green Meeting dengan konfigurasi dinamis, audit actor, serta pola ekspor. code in `src/app/ga/`, `src/lib/services/assets/`, `src/lib/services/greenMeetingService.ts` (basis: implementasi aktif)

### D. Portal layanan mandiri karyawan · existing
Karyawan internal sudah dapat masuk ke `/employee` dan menerima fitur yang dibatasi oleh identitas serta permission. code in `src/app/employee/` (basis: implementasi aktif)

## Slice 1: Core cleaning loop

### 1. Core cleaning loop · done
Bangun alur nyata paling tipis untuk ruang dan template yang dikelola WIG002. Petugas yang ditetapkan masuk ke portal khusus dan mengerjakan checklist bersama untuk tanggal WIB hari ini. WIG002 mengelola ruang, template, item, dan penetapan petugas, lalu melihat matriks bulanan. Beberapa petugas boleh mengubah item pada hari yang sama, dan petugas tidak dapat mengubah tanggal lampau atau mendatang.

**Spec:** [0001](../specs/0001-core-cleaning-loop/index.md)
**Code:** `prisma/schema.prisma` (cleaning models), `src/lib/services/cleaningService.ts`, `src/app/api/cleaning/`, `src/app/api/ga/cleaning/`, `src/app/cleaning/`, `src/app/ga/cleaning/`

**Done when:** petugas yang ditetapkan dapat masuk ke `/cleaning`, membuat atau membuka satu checklist bersama untuk ruangnya pada tanggal WIB hari ini, mengubah item aktif, dan hasilnya terlihat pada matriks WIG002. Tanggal masa depan hanya menampilkan pratinjau template tanpa membuat checklist.

* [x] Design it (spec): `/architect core cleaning loop`
* [x] Build it: `/develop core cleaning loop`
  * [x] Data, role Cleaning Worker, dan service checklist harian, covers AC 1, AC 3, AC 4, AC 6, AC 8, AC 9
  * [x] API yang diautentikasi dan portal petugas `/cleaning`, covers AC 1, AC 2, AC 3, AC 4, AC 8
  * [x] Konfigurasi dan matriks WIG002 di portal GA, covers AC 5, AC 6, AC 7, AC 8
  * [x] Test service dan API untuk akses, WIB, audit, dan perubahan bersama, covers AC 1 sampai AC 9
* [x] Verify it: `/check verify core cleaning loop`
* [x] Test it: `/test core cleaning loop`

## Slice 2: Master dinamis dan identitas petugas

### 2. Master dinamis dan identitas petugas · needs a decision
WIG002 menjadi satu satunya administrator modul dengan syarat username `WIG002` dan permission `ga.manage`. Ia mengelola petugas internal dari Master HR, akun outsourcing pribadi tanpa data vendor, ruangan, dua template, override item per ruangan, jadwal mingguan global, pengecualian hari libur atau wajib, serta default `Diperiksa Oleh` dan `Mengetahui` per ruangan. (basis: model akun dan RBAC yang sudah ada)

Template Sanitasi Grey Area dimulai dengan Pintu, Sudut Ruangan, Jendela, Langit langit, Lantai, Dinding, Stop Kontak, Saklar, Exhaust atau Kipas atau AC, Lampu, Meja, dan Kursi. Template Ruangan menambahkan Toilet, Teras, serta Dispenser atau Cool Box atau Kulkas, dan tidak memakai Saklar sebagai item awal.

**Done when:** WIG002 dapat mengelola seluruh master, akun outsourcing dengan email opsional dan password yang ia tetapkan, akses internal dan outsourcing yang terbatas, serta perubahan item yang berlaku pada bulan berjalan dan periode berikutnya tanpa mengubah bulan lampau.

* [ ] Design it (spec): `/architect cleaning master and worker access`

## Slice 3: Tanda tangan bulanan

### 3. Tanda tangan bulanan · needs a decision
WIG002 membuka proses tanda tangan secara manual, termasuk saat periode belum lengkap. Dua karyawan internal yang menjadi default ruangan melihat tugas di portal employee dan dapat menandatangani dalam urutan apa pun memakai kotak `react-signature-canvas`. (basis: identitas employee dan pola konfirmasi GA yang sudah ada)

**Done when:** `Diperiksa Oleh` dan `Mengetahui` dapat menyimpan tanda tangan khusus periode, tanda tangan tetap berlaku setelah perubahan berikutnya, serta waktu tanda tangan dan perubahan terakhir tetap dapat dilihat.

* [ ] Design it (spec): `/architect monthly cleaning approvals`

## Slice 4: PDF dan audit

### 4. PDF dan audit · needs a decision
WIG002 dapat mengubah data kapan saja tanpa membatalkan paraf atau tanda tangan. Setiap perubahan tetap mencatat actor dan waktu, lalu ekspor merangkum matriks, paraf, dua tanda tangan, kelengkapan, dan waktu pembaruan terakhir. (basis: `AuditLog` dan utilitas ekspor yang sudah ada)

**Done when:** WIG002 dapat mengekspor setiap ruangan dan bulan sebagai satu matriks 31 tanggal pada satu halaman yang ukurannya menyesuaikan jumlah item, dengan bukti pelaksana, penanda tangan, dan perubahan yang dapat ditelusuri.

* [ ] Design it (spec): `/architect cleaning PDF and audit`

## Deferred

Di luar rilis pertama, tetapi tetap dicatat agar batas scope jelas.

* Dashboard analitik lintas ruangan
* Ekspor Excel
* Email dan push notification
* Foto bukti dan catatan per item
* Master vendor outsourcing
* Kewajiban mengganti password pada login pertama
* Pengisian tanggal lampau atau mendatang oleh petugas
* Pembatalan paraf atau tanda tangan otomatis setelah perubahan
* SEO, akses publik, monetisasi, serta bahasa selain Bahasa Indonesia

## References

### Project sources

* `AGENTS.md`, aturan global dan peta konteks proyek
* `src/lib/permissions.ts`, role dan permission yang sedang aktif
* `prisma/schema.prisma`, UserAccount, Employee, AuditLog, dan pola data checklist
* `src/app/ga/layout.tsx`, struktur navigasi serta batas portal GA
* `src/lib/services/greenMeetingService.ts`, pola konfigurasi dinamis yang dikelola GA
* `src/lib/export.ts`, pola ekspor matriks dan area tanda tangan

### Practices and standards

* Tracer Bullet, satu alur produksi nyata lebih dahulu, lalu perluas setiap bagian secara bertahap
* Brownfield enrollment, kemampuan yang sudah berjalan dicatat sebagai `existing` dan tidak direncanakan ulang
* Beta workflow, verifikasi aplikasi nyata dilanjutkan dengan test terarah sebelum fitur dinyatakan selesai

## Legend

* `existing` berarti fitur sudah ada sebelum workflow scope ini dan tidak memiliki task pembangunan baru.
* `planned` berarti fitur baru sudah masuk urutan kerja tetapi belum dirancang atau dibangun.
* `needs a decision` berarti langkah pertama yang direkomendasikan adalah `/architect` untuk menangkap keputusan ke dalam spec.
* Pada workflow Beta, fitur biasanya melewati `/develop`, `/check verify`, lalu `/test` sebelum dinyatakan selesai.
* Langkah berikutnya selalu checkbox pertama yang belum selesai.

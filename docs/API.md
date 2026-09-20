# API Map & HTTP Contracts — Presensi & HRIS WIG

> **Purpose**: Peta rute API, struktur endpoint, dan kontrak payload HTTP.  
> **Source of Truth**: Route Handlers di `src/app/api/**/route.ts` dan middleware `src/lib/middleware/apiGuard.ts`.  
> **Last Verified**: 2026-09-10  

Dokumen ini mendokumentasikan konvensi antarmuka API RESTful, pola guard otorisasi, struktur envelope data, dan direktori endpoint backend platform **Presensi & HRIS WIG**.

---

## 1. Konvensi & Protokol Envelope API

Seluruh endpoint backend mengimplementasikan format envelope standar JSON untuk menjamin konsistensi integrasi antara frontend dan backend:

### A. Respons Sukses
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "...": "..."
  }
}
```

### B. Respons Error
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Deskripsi kegagalan permintaan yang dapat dibaca manusia"
  }
}
```

### C. Kode Status HTTP Standar
- `200 OK`: Permintaan berhasil diproses.
- `201 Created`: Entitas baru berhasil dibuat (misal pendaftaran aset atau pembuatan user baru).
- `400 Bad Request`: Format payload tidak valid atau parameter wajib tidak ada.
- `401 Unauthorized`: Cookie sesi tidak ditemukan atau tanda tangan JWT tidak valid.
- `403 Forbidden`: Pengguna terautentikasi tetapi tidak memiliki *atomic permission* yang diperlukan.
- `404 Not Found`: Sumber daya yang diminta tidak ditemukan di database.
- `429 Too Many Requests`: Melampaui batas frekuensi percobaan login (*rate limiting*).
- `500 Internal Server Error`: Kesalahan yang tidak tertangani pada layer server atau database.

---

## 2. Mekanisme Proteksi Endpoint (`apiGuard.ts`)

Rute API dilindungi secara deklaratif menggunakan pembungkus (*wrapper*) `apiGuard` yang diekspor dari `src/lib/middleware/apiGuard.ts`:

```typescript
import { apiGuard } from "@/lib/middleware/apiGuard";

export const POST = apiGuard(
  async (request, context, user) => {
    // Handler hanya dieksekusi jika pengguna memiliki sesi valid dan izin yang sesuai
    return NextResponse.json({ success: true, data: result });
  },
  {
    requiredPermissions: ["attendance:create"], // Hak akses atomik yang diwajibkan
  }
);
```

- Parameter `user` bertipe `UserPrincipal` menyuntikkan konteks pengguna aktif (`userId`, `username`, `roles`, `permissions`, `employeeId`).
- Endpoint publik (seperti login) memanggil handler langsung tanpa wrapper `apiGuard`.

---

## 3. Direktori & Pemetaan Endpoint API

### A. Autentikasi & Akun Pengguna (`/api/auth`)
| Rute | Metode | Permission / Akses | Deskripsi |
|---|---|---|---|
| `/api/auth/login` | `POST` | Publik | Otentikasi username/password, menyetel cookie `session`. |
| `/api/auth/logout` | `POST` | Publik / Auth | Menghapus cookie `session` dan mengakhiri sesi. |
| `/api/auth/me` | `GET` | Autentikasi | Mengambil identitas sesi, daftar role, dan daftar permissions aktif. |
| `/api/auth/profile` | `GET`, `PUT` | Autentikasi | Membaca dan memperbarui profil pribadi pengguna yang sedang login. |
| `/api/auth/change-password` | `POST` | Autentikasi | Mengganti kata sandi dan menaikkan nilai `session_version`. |
| `/api/auth/send-password` | `POST` | `users:manage` | Mengirimkan kredensial akun baru via email SMTP ke pegawai terkait. |

### B. Kehadiran & Presensi (`/api/attendance`)
| Rute | Metode | Permission / Akses | Deskripsi |
|---|---|---|---|
| `/api/attendance` | `GET` | `attendance:read` | Mengambil riwayat log kehadiran pegawai atau seluruh kantor. |
| `/api/attendance` | `POST` | `attendance:create` | Melakukan clock-in atau clock-out dengan validasi Wi-Fi, GPS, & Foto. Mendukung presensi hari libur (`offDayReason` wajib jika `isOffDay`). |
| `/api/attendance/correction` | `GET`, `POST`, `PUT` | `attendance:correct` | Pengajuan dan persetujuan koreksi jam kehadiran oleh atasan. |
| `/api/attendance/network` | `GET` | Autentikasi | Memeriksa status kesesuaian IP terhadap jaringan kantor, status bypass, serta status shift & jadwal lintas hari (`isOffDay`, `shiftName`, `todaySchedule`, `isOvernight`, `activeMode`, `shiftDate`). |

### C. Manajemen Karyawan (`/api/employees`)
| Rute | Metode | Permission / Akses | Deskripsi |
|---|---|---|---|
| `/api/employees` | `GET`, `POST` | `employees:read`, `create` | Katalog master karyawan dan penambahan data pegawai baru. |
| `/api/employees/[id]` | `GET`, `PUT`, `DELETE`| `employees:manage` | Detail data lengkap, pembaruan biodata, dan arsip data karyawan. |
| `/api/employees/[id]/documents`| `GET`, `POST` | `employees:documents` | Pengelolaan dokumen arsip kepegawaian (KTP, Ijazah, CV). |
| `/api/employees/[id]/status` | `PUT` | `employees:status` | Mengubah status kerja pegawai (Permanen, Probation, Resign) & riwayat. |
| `/api/employees/import` | `POST` | `employees:import` | Batch import data pegawai dari file lembar kerja Excel. |
| `/api/employees/import/template`| `GET` | `employees:import` | Mengunduh template spreadsheet resmi untuk import data massal. |

### D. General Affairs & Manajemen Aset (`/api/assets`, `/api/ga`)
| Rute | Metode | Permission / Akses | Deskripsi |
|---|---|---|---|
| `/api/assets` | `GET`, `POST` | `assets:read`, `create` | Katalog seluruh aset korporat dan pendaftaran aset baru. |
| `/api/assets/[id]` | `GET`, `PUT`, `DELETE`| `assets:manage` | Detail inventaris aset, update data perangkat, dan hapus aset. |
| `/api/assets/assign` | `POST` | `assets:assign` | Serah terima aset ke pegawai baru disertai unggahan berkas BAST. |
| `/api/assets/bast/[id]` | `GET` | `assets:read` | Mengunduh berkas pindaian dokumen BAST biner (`MediumBlob`). |
| `/api/assets/[id]/inspect` | `POST` | `assets:inspect` | Menyimpan formulir audit checklist inspeksi fisik kondisi aset. |
| `/api/assets/[id]/maintenance`| `POST` | `assets:maintenance` | Mencatat log servis perbaikan vendor eksternal dan nota biaya. |
| `/api/assets/[id]/retire` | `POST` | `assets:retire` | Mengafkirkan (*retire*) aset yang rusak permanen atau habis masa pakai. |
| `/api/assets/categories` | `GET`, `POST` | `assets:categories` | Pengelolaan kategori aset dan kode prefix inventaris unik. |
| `/api/assets/qr` | `POST` | `assets:qr` | Membuat kode QR/Barcode aset yang dapat dicetak pada stiker label. |
| `/api/ga/tickets` | `GET`, `POST`, `PUT` | `tickets:read`, `create` | Tiket keluhan kerusakan atau permintaan perangkat dari karyawan ke GA. |
| `/api/sim-cards` | `GET`, `POST` | `simcards:manage` | Manajemen inventaris kartu SIM korporat dan status peminjam. |

### E. Green Meeting (`/api/green-meeting`)

Semua endpoint memerlukan sesi aktif. Endpoint baca tersedia bagi pengguna terautentikasi untuk transparansi internal. Operasi mutasi memanggil `canManageGreenMeeting()` dan hanya menerima pengguna dengan `ga.manage`, role `GA_ADMIN`, atau override `SUPER_ADMIN`; HR biasa dan karyawan tidak dapat melakukan mutasi.

| Rute | Metode | Akses | Deskripsi |
|---|---|---|---|
| `/api/green-meeting/config` | `GET` | Autentikasi | Membaca konfigurasi dan flag `canManage`. |
| `/api/green-meeting/config` | `PATCH` | GA / Super Admin | Mengubah ruangan/jam default, hari libur mingguan, dan kuota perpanjangan. |
| `/api/green-meeting/units` | `GET` | Autentikasi | Membaca departemen peserta beserta divisinya. |
| `/api/green-meeting/units` | `PATCH` | GA / Super Admin | Mengaktifkan/menonaktifkan partisipasi departemen dan menyinkronkan presensi sesi. |
| `/api/green-meeting/sessions?date=YYYY-MM-DD` | `GET` | Autentikasi | Mengambil atau membuat sesi tanggal tertentu beserta presensi, notulen, dan info off-day. |
| `/api/green-meeting/sessions` | `POST` | Autentikasi | Mengambil/membuat sesi berdasarkan tanggal payload. |
| `/api/green-meeting/sessions` | `PATCH` | GA / Super Admin | Mengubah ruangan, jam mulai, atau atribut sesi yang divalidasi. |
| `/api/green-meeting/attendance` | `PATCH` | GA / Super Admin | Mengubah satu presensi (`HADIR`, `IZIN`, `ALPA`); alasan wajib untuk `IZIN`. |
| `/api/green-meeting/attendance` | `POST` | GA / Super Admin | Aksi massal `MARK_ALL_PRESENT`, `MARK_SELECTED_PRESENT`, atau `MARK_SELECTED_ALPA`. |
| `/api/green-meeting/notes` | `GET` | Autentikasi | Mengambil tugas aktif atau tugas relevan berdasarkan `departmentId`, `divisionId`, dan `employeeId`. |
| `/api/green-meeting/notes` | `POST` | GA / Super Admin | Membuat informasi/tugas dengan sumber DARI dan target KEPADA fleksibel; tugas wajib Deadline 1. |
| `/api/green-meeting/notes` | `PATCH` | GA / Super Admin | Mengubah status tugas. |
| `/api/green-meeting/notes/[id]` | `PATCH` | GA / Super Admin | Mengoreksi isi/jenis/DARI/KEPADA/deadline notulensi dengan alasan wajib; update atomik menyimpan snapshot revisi dan audit log. |
| `/api/green-meeting/notes/[id]/revisions` | `GET` | Autentikasi | Membaca riwayat revisi append-only suatu notulensi. |
| `/api/green-meeting/deadlines` | `POST` | GA / Super Admin | Menambah perpanjangan deadline beserta alasan dengan batas kuota konfigurasi. |
| `/api/green-meeting/holidays` | `GET` | Autentikasi | Membaca tanggal libur khusus. |
| `/api/green-meeting/holidays` | `POST`, `DELETE` | GA / Super Admin | Menambah atau menghapus tanggal libur khusus. |
| `/api/green-meeting/employees?q=...` | `GET` | Autentikasi | Autocomplete maksimal 20 karyawan aktif berdasarkan nama/ID, termasuk jabatan, departemen, dan divisi. |
| `/api/green-meeting/recap?startDate=...&endDate=...` | `GET` | Autentikasi | Rekap sesi dan agregasi kehadiran untuk rentang tanggal; default 30 hari terakhir. |

Kontrak notulen penting:
- `originType`: `DIREKSI | DEPARTMENT | DIVISION | EMPLOYEE | LAINNYA`.
- `targets[].targetType`: `DEPARTMENT | DIVISION | EMPLOYEE`.
- `isAllTarget = true` menyatakan sasaran seluruh perusahaan dan tidak memerlukan baris target.
- Respons Green Meeting saat ini dikembalikan langsung sebagai JSON domain atau `{ session, offDayInfo }`; endpoint ini belum memakai envelope generik `success/data`.

### F. Penggajian & Pajak (`/api/payslips`, `/api/overtime`, `/api/bpjs`, `/api/pph21`)
| Rute | Metode | Permission / Akses | Deskripsi |
|---|---|---|---|
| `/api/payslips` | `GET`, `POST` | `payroll:read`, `create` | Daftar slip gaji bulanan dan pembuatan slip gaji tunggal. |
| `/api/payslips/bulk` | `POST` | `payroll:bulk` | Pemrosesan massal penggajian seluruh pegawai aktif dalam satu periode. |
| `/api/overtime` | `GET`, `POST`, `PUT` | `overtime:read`, `create` | Pengajuan, persetujuan, dan rekap jam lembur (PP 35/2021). |
| `/api/bpjs/calculate` | `POST` | `payroll:calculate` | Mesin simulasi penghitungan iuran BPJS Kesehatan dan Ketenagakerjaan. |
| `/api/pph21/calculate` | `POST` | `payroll:calculate` | Mesin penghitungan pajak PPh 21 skema TER 2024 (Kategori A, B, C). |

### G. Pelaporan Kunjungan Lapangan (`/api/visits`)
| Rute | Metode | Permission / Akses | Deskripsi |
|---|---|---|---|
| `/api/visits` | `GET`, `POST` | `visits:read`, `create` | Daftar riwayat kunjungan dan pelaporan kunjungan baru (Clock-In/Out). |
| `/api/visits/photos/[photoId]`| `GET` | `visits:read` | Mengambil berkas foto kunjungan dinas yang telah distempel watermark. |

### H. Layanan Mandiri Karyawan (`/api/leave`, `/api/letter-requests`, `/api/todos`)
| Rute | Metode | Permission / Akses | Deskripsi |
|---|---|---|---|
| `/api/leave` | `GET`, `POST`, `PUT` | `leave:read`, `create` | Pengajuan cuti tahunan/sakit dan persetujuan atasan. |
| `/api/letter-requests` | `GET`, `POST`, `PUT` | `letters:read`, `create`| Permohonan surat keterangan resmi perusahaan (SK Kerja, Penghasilan). |
| `/api/todos` | `GET`, `POST`, `PUT` | Autentikasi | Manajemen papan tugas personal karyawan (*personal todo list*). |

### I. Master Data & Pengumuman (`/api/master`, `/api/news`)
| Rute | Metode | Permission / Akses | Deskripsi |
|---|---|---|---|
| `/api/master/divisions` | `GET`, `POST` | `master:manage` | Pengelolaan data divisi organisasi perusahaan. |
| `/api/master/departments`| `GET`, `POST` | `master:manage` | Pengelolaan data departemen di bawah divisi. |
| `/api/master/positions` | `GET`, `POST` | `master:manage` | Pengelolaan jabatan struktural dan fungsional. |
| `/api/master/locations` | `GET`, `POST` | `master:manage` | Pengelolaan lokasi titik kantor dan radius geofence presensi. |
| `/api/master/payroll-components`| `GET`, `POST`| `master:manage`| Komponen tunjangan dan potongan master gaji. |
| `/api/news` | `GET`, `POST`, `PUT` | `news:read`, `create` | Papan pengumuman dan berita internal perusahaan. |
| `/api/news/upload` | `POST` | `news:create` | Unggah gambar sampul untuk artikel pengumuman internal. |

### J. Endpoint Terjadwal Otomatis (`/api/cron`)
Seluruh endpoint cron wajib menyertakan header otorisasi rahasia: `Authorization: Bearer <CRON_SECRET>`.
| Rute | Jadwal Rekomendasi | Deskripsi Tugas |
|---|---|---|
| `/api/cron/birthday-reminder` | Harian (Pagi) | Mengirimkan email notifikasi pengingat ulang tahun H-30, H-14, H-7 ke HR. |
| `/api/cron/daily-greeting` | Harian (Pagi) | Mengirimkan ucapan selamat ulang tahun otomatis kepada staf yang berulang tahun. |
| `/api/cron/cleanup-photos` | Mingguan | Pembersihan cache foto selfie sementara yang sudah diverifikasi dan kadaluarsa. |
| `/api/cron/generate-payroll` | Bulanan | Otomasi kalkulasi draf rekapitulasi penggajian bulanan periode berjalan. |
| `/api/cron/reset-leave` | Tahunan | Reset dan alokasi ulang kuota saldo cuti tahunan karyawan setiap awal tahun. |

### K. Ekspor & Penarikan Laporan (`/api/export`)
| Rute | Metode | Permission / Akses | Deskripsi |
|---|---|---|---|
| `/api/export` | `GET` | Role `hr` | Penarikan data dan ekspor file laporan (Excel `.xlsx` atau JSON preview). Parameter wajib: `type` (`attendance`, `visits`, `overtime`, `leave`), `startDate` (`YYYY-MM-DD`), `endDate` (`YYYY-MM-DD`). Opsional: `mode=matrix`, `grouped=true`, `format=excel\|preview`, `divisionId`, `departmentId`, `employeeId`. Rentang waktu dihitung presisi menggunakan WIB offset (`+07:00`). |


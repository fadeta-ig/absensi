# Verify: monthly cleaning approvals · spec 0003 · updated 2026-09-22
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Buka `/ga/cleaning/approvals` sebagai WIG002 → melihat daftar periode bulanan beserta status turunan dan filter → AC-1, AC-12
- [x] Klik Buka Periode Baru pada portal GA lalu pilih ruangan dan dua karyawan internal berbeda → periode terbuka dalam status WAITING_FOR_SIGNATURES → AC-2, AC-3
- [x] Buka `/employee/cleaning/approvals` sebagai karyawan pemeriksa → melihat daftar tugas tanda tangan yang ditugaskan → AC-5
- [x] Klik Tanda Tangani Dokumen lalu buat tanda tangan pada kanvas dan klik Simpan → tanda tangan tersimpan dan status menjadi PARTIALLY_SIGNED → AC-4, AC-6, AC-7
- [x] Masuk sebagai karyawan kedua lalu tanda tangani peran Mengetahui → status periode berubah otomatis menjadi COMPLETE → AC-6, AC-8
- [x] Ubah data salah satu checklist harian pada ruangan dan bulan tersebut → buka detail persetujuan → tanda tangan tetap sah dan banner perubahan checklist tampil → AC-11
- [x] Masuk sebagai WIG002 lalu buka kembali slot tanda tangan dengan mengisi alasan wajib → tanda tangan lama diarsipkan dan slot siap ditandatangani ulang → AC-9, AC-10, AC-13
- [x] Pada kanvas tanda tangan karyawan lakukan simpan saat sambungan gagal → gambar tanda tangan tetap bertahan pada layar dan tombol coba lagi dapat ditekan kembali → AC-14

## Commands
- [x] `npx vitest run tests/services/cleaningApprovalService.test.ts` → semua skenario logika bisnis persetujuan lulus verifikasi → AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-9, AC-10, AC-13
- [x] `npx vitest run tests/api/cleaningApprovalRoutes.test.ts` → seluruh rute API GA dan karyawan lulus verifikasi otorisasi serta payload → AC-1, AC-5, AC-6, AC-7, AC-9, AC-10, AC-12
- [x] `npx vitest run tests/services/cleaningSchema.test.ts` → skema database persetujuan bulanan dan batasan unik terverifikasi → AC-2, AC-3, AC-4
- [x] `npx vitest run tests/components/SignaturePad.test.tsx` → komponen kanvas tanda tangan interaktif dan opsi aksesibilitas terverifikasi → AC-12, AC-14
- [x] `npx tsc --noEmit` → seluruh basis kode TypeScript bebas kesalahan tipe → AC-1 sampai AC-14
- [x] `npm run build` → seluruh halaman aplikasi App Router termasuk portal persetujuan berhasil dibangun untuk produksi → AC-12

## Acceptance criteria coverage
- AC-1 tercakup oleh langkah buka `/ga/cleaning/approvals` dan tes rute API GA
- AC-2 tercakup oleh langkah buka periode baru dengan dua karyawan internal aktif
- AC-3 tercakup oleh langkah verifikasi keunikan ruangan dan bulan serta tes transaksi atomik
- AC-4 tercakup oleh langkah simpan tanda tangan dengan validasi format dan batas 256 KB
- AC-5 tercakup oleh langkah buka portal `/employee/cleaning/approvals` dan filter tugas
- AC-6 tercakup oleh langkah penandatanganan kedua peran dalam urutan bebas oleh akun yang cocok
- AC-7 tercakup oleh langkah simpan tanda tangan dengan kunci idempotensi tanpa duplikasi
- AC-8 tercakup oleh langkah penurunan otomatis status periode dari kedua slot tanda tangan
- AC-9 tercakup oleh langkah buka kembali slot dengan alasan wajib dan penyimpanan riwayat
- AC-10 tercakup oleh langkah validasi karyawan aktif dan penolakan karyawan yang tidak aktif
- AC-11 tercakup oleh langkah pemeriksaan indikator perubahan checklist setelah tanda tangan
- AC-12 tercakup oleh antarmuka persetujuan WIG002 dan antarmuka tugas karyawan
- AC-13 tercakup oleh pencatatan entri audit log pada setiap aksi transaksi
- AC-14 tercakup oleh penanganan kegagalan simpan tanda tangan tanpa kehilangan coretan

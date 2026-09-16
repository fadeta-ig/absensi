# Task Plan: Konfigurasi Default Light Mode & Persistensi Dark Mode

## Goal
Mengubah konfigurasi tema aplikasi agar secara default menggunakan **Light Mode** untuk seluruh pengguna baru/tanpa preferensi, dengan tetap mempertahankan dan menyimpan pilihan pengguna ke **Dark Mode** secara persisten di `localStorage` melalui `next-themes`, serta memperbarui dokumentasi Project Brain di `/docs/CONVENTIONS.md`.

## Current Phase
Complete (Implemented, Verified, and Documented)

## Constraints & Principles
1. **Default Light Mode**:
   - `defaultTheme="light"`
   - `enableSystem={false}` agar tidak terpengaruh otomatis oleh OS dark mode saat pertama kali berkunjung.
2. **Persistence Guarantee**:
   - Pilihan pengguna saat menekan tombol `ThemeToggle` tetap tersimpan ke `localStorage` (kunci `"theme"`).
   - Saat pengguna memilih dark mode, aplikasi langsung mengingatnya pada reload/kunjungan berikutnya.
3. **Project Brain Documentation**:
   - Dokumentasikan aturan tema di `docs/CONVENTIONS.md` (Poin 8).
4. **Git Rule**:
   - Dilarang keras melakukan `git commit` / `git push` tanpa perintah eksplisit dari pengguna.

---

## Planned Phases

### Phase 1 — Planning & Design
- [x] Rancang konfigurasi `ThemeProvider` di `src/app/layout.tsx`.
- [x] Verifikasi mekanisme `setTheme` dan penyimpanan `localStorage` pada `src/components/ThemeToggle.tsx`.
- [x] Siapkan materi dokumentasi standar tema untuk `docs/CONVENTIONS.md`.
- **Status:** complete

### Phase 2 — Implementation in Codebase & Project Brain
- [x] Ubah konfigurasi `ThemeProvider` di `src/app/layout.tsx` (`defaultTheme="light"`, `enableSystem={false}`).
- [x] Tambahkan poin konvensi tema ke `docs/CONVENTIONS.md` (Poin 8: Standarisasi Tema & Persistensi).
- **Status:** complete

### Phase 3 — Verification Pass
- [x] Jalankan ESLint pada `src/app/layout.tsx` (0 errors).
- [x] Jalankan `npx tsc --noEmit` (0 error).
- [x] Jalankan Vitest test suite (52 passed).
- [x] Pastikan tidak ada server background yang tertinggal.
- **Status:** complete

### Phase 4 — Delivery to User
- [x] Berikan penjelasan perubahan dan status Project Brain kepada pengguna.
- **Status:** complete

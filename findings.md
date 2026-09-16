# Findings: Audit Konfigurasi Tema (Dark Mode / Light Mode & Preferensi Pengguna)

## 1. Lokasi Berkas & Arsitektur Setup Tema

Sistem tema aplikasi diatur secara modular menggunakan pustaka industri **`next-themes`** yang dipadukan dengan **Tailwind CSS (`darkMode: "class"`)** dan **CSS Custom Properties (Variables)**:

1. **Root Layout Provider**:
   - **Lokasi**: `src/app/layout.tsx` (baris 29–34)
   - **Implementasi**:
     ```tsx
     <ThemeProvider
       attribute="class"
       defaultTheme="system"
       enableSystem
       disableTransitionOnChange
     >
       {children}
       <ConfirmModal />
       <ToastContainer />
     </ThemeProvider>
     ```
2. **Komponen Pembungkus Provider**:
   - **Lokasi**: `src/components/ThemeProvider.tsx`
   - **Isi**: Menginisialisasi `NextThemesProvider` dari package `next-themes`.
3. **Komponen Pengubah Tema (Toggle Button)**:
   - **Lokasi**: `src/components/ThemeToggle.tsx`
   - **Mekanisme**: Membaca `useTheme()` (`theme`, `setTheme`, `resolvedTheme`), merender ikon `Sun` (jika gelap) atau `Moon` (jika terang), dan mengeksekusi `setTheme(isDark ? "light" : "dark")`.
4. **Penempatan UI Toggle**:
   - Terintegrasi di bagian bawah sidebar pada `src/components/layout/AppShell.tsx` (baris 357–360):
     ```tsx
     <div className={`mt-auto pt-3 flex ${sidebarCollapsed ? "justify-center" : "justify-between items-center"}`}>
         {!sidebarCollapsed && <span className="text-xs font-medium text-[var(--text-muted)] pl-1">Tema Tampilan</span>}
         <ThemeToggle />
     </div>
     ```
   - Shell ini membungkus seluruh portal aplikasi:
     - `/dashboard` (HR Admin Portal)
     - `/employee` (Employee Self Service Portal)
     - `/ga` (General Affairs Portal)
5. **Konfigurasi Tailwind**:
   - **Lokasi**: `tailwind.config.js` (baris 9)
   - **Atribut**: `darkMode: "class"`, artinya Tailwind mengaktifkan varian kelas `dark:` saat tag `<html class="dark">` memiliki kelas `dark`.
6. **Definisi Token Warna Global**:
   - **Lokasi**: `src/app/globals.css` (baris 7–91)
   - Menggunakan token variabel CSS untuk `:root` (Light) dan `.dark` (Dark).

---

## 2. Nilai Default Tema Aplikasi

- **Default Theme**: **`"system"`** (`defaultTheme="system"`).
- **Perilaku**: Saat pengguna pertama kali membuka aplikasi tanpa ada preferensi tersimpan:
  - Jika perangkat/OS pengguna (Windows, macOS, Android, iOS) sedang dalam mode gelap (*Dark Mode*), aplikasi otomatis merender tema **Gelap**.
  - Jika perangkat/OS pengguna dalam mode terang (*Light Mode*), aplikasi otomatis merender tema **Terang**.
- **Opsi Aktif**: `enableSystem={true}` memastikan deteksi media query `(prefers-color-scheme: dark)` berjalan otomatis.

---

## 3. Penyimpanan Preferensi Pengguna (Persistence)

- **Apakah Preferensi Sudah Disimpan?**: **SUDAH (100% Tersimpan Otomatis).**
- **Media Penyimpanan**: **`localStorage` peramban (browser client-side)**.
- **Kunci Penyimpanan (Storage Key)**: **`"theme"`** (kunci standar bawaan `next-themes`).
- **Nilai yang Disimpan**:
  - `"light"` saat pengguna memilih mode terang.
  - `"dark"` saat pengguna memilih mode gelap.
  - `"system"` saat pengguna memilih mengikuti sistem.
- **Pencegahan Kedipan Layar (Anti-FOUC)**:
  `next-themes` menyuntikkan script inline berukuran sangat kecil ke dalam tag `<head>` sebelum halaman digambar (*paint*). Script ini langsung membaca `localStorage.getItem("theme")` dan menambahkan kelas `class="dark"` atau `class="light"` ke elemen `<html>`, sehingga tidak terjadi kedipan putih saat pengguna dalam mode gelap. Hal ini didukung oleh atribut `suppressHydrationWarning` pada tag `<html>` dan `<body>` di `src/app/layout.tsx`.

---

## 4. Rincian Palet Warna Token (`src/app/globals.css`)

| Token CSS | Light Mode (`:root`) | Dark Mode (`.dark`) | Fungsi / Penggunaan |
|---|---|---|---|
| `--background` | `#FAFAFA` (Abu-abu sangat terang) | `#0D0D11` (Hitam pekat lembut) | Latar belakang halaman |
| `--card` | `#FFFFFF` (Putih bersih) | `#15151C` (Abu-abu gelap pekat) | Kartu, modal, dropdown |
| `--foreground` | `#1A1A2E` | `#F1EDED` | Teks utama body |
| `--primary` | `#800020` (Corporate Burgundy/Dark Red) | `#9B1B30` (Crimson Red terang) | Tombol utama, branding |
| `--secondary` | `#F5F0F0` | `#1F1F2A` | Background sekunder, zebra row |
| `--border` | `#E5DEDE` | `#272736` / border gelap | Garis tepi tabel, input, modal |
| `--text-primary` | `#1A1A2E` | `#F1EDED` | Judul, label penting |
| `--text-secondary`| `#4A4A5A` | `#E5DEDE` | Teks keterangan, deskripsi |
| `--text-muted` | `#71717A` | `#A1A1AA` | Teks placeholder, waktu, info |

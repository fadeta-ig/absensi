# AI Agent Rules & Operational Contract — Absensi & HRIS WIG

> **Purpose**: Cara AI agent harus menggunakan Project Brain dan batasan operasional.  
> **Source of Truth**: Panduan operasional repositori dan protokol Project Brain.  
> **Last Verified**: 2026-09-10  

Dokumen ini adalah kontrak operasional wajib bagi setiap AI coding agent (Codex, Antigravity, Claude Code, Cursor, dll.) yang bekerja pada codebase ini. Setiap agent terikat pada aturan di bawah ini tanpa pengecualian.

---

## 1. Rules Before Coding

Sebelum menulis atau memodifikasi kode:

1. **Read Relevant `/docs` Files**: Wajib membaca berkas dokumentasi inti di `/docs/`:
   - [README.md](./README.md) (Entry point & routing index)
   - [PROJECT.md](./PROJECT.md) (Domain & tujuan project)
   - [CODEBASE_MAP.md](./CODEBASE_MAP.md) (Peta repositori & lokasi kode)
   - [ARCHITECTURE.md](./ARCHITECTURE.md) (Arsitektur & runtime boundaries)
   - [CONSTRAINTS.md](./CONSTRAINTS.md) (Batasan teknis & aturan hukum)
   - [GOTCHAS.md](./GOTCHAS.md) (Jebakan implementasi & perilaku mengejutkan)
2. **Consult Task-Specific Brain**: Baca dokumen spesifik tugas sesuai tabel routing di [README.md](./README.md) (misal: [DATA_MODEL.md](./DATA_MODEL.md) untuk basis data, [DOMAIN.md](./DOMAIN.md) untuk aturan bisnis, [API.md](./API.md) untuk endpoint).
3. **Inspect Actual Source Code**: Bangun model mental dari Project Brain terlebih dahulu, lalu periksa kode sumber implementasi aktual sebelum mengasumsikan ketersediaan fungsi, tipe data, atau service layer.
4. **Do Not Assume Undocumented Behavior**: Jangan pernah mengasumsikan perilaku yang tidak memiliki bukti (*evidence*) di kode sumber atau konfigurasi.
5. **Identify Constraints & Architectural Decisions**: Identifikasi batasan di [CONSTRAINTS.md](./CONSTRAINTS.md) dan keputusan terdahulu di [DECISIONS.md](./DECISIONS.md) sebelum merancang solusi.

---

## 2. Do Not Audit Unless Asked

**Project Brain bukan alat audit kode berdiri (*standing code audit*).**

Kecuali pengguna secara eksplisit meminta audit atau evaluasi:
- **JANGAN** melakukan pencarian bug tanpa diminta (*bug hunting*).
- **JANGAN** melakukan pencarian celah keamanan tanpa diminta (*vulnerability hunting*).
- **JANGAN** melakukan analisis kode duplikat (*duplicate-code analysis*).
- **JANGAN** melakukan analisis kode mati (*dead-code analysis*).
- **JANGAN** melakukan analisis *code smell* atau *refactoring analysis*.
- **JANGAN** melakukan penilaian skor kualitas (*quality scoring*).
- **JANGAN** membuat daftar TODO atau backlog teknis (*TODO/technical debt discovery*).

Jika menemukan perilaku tak terduga secara incidental, hanya catat ke dalam Project Brain jika hal tersebut merupakan **pengetahuan tahan lama (*durable knowledge*)** yang mutlak dibutuhkan agent di masa mendatang untuk memahami sistem secara aman (seperti entri di [GOTCHAS.md](./GOTCHAS.md)).

---

## 3. Rules During Coding

Selama mengimplementasikan kode:

1. **Follow Existing Architecture**: Ikuti arsitektur yang sudah mapan (Next.js App Router, pemisahan portal HR/GA/Employee, Next.js 16 Edge proxy di `src/proxy.ts`, layer service di `src/lib/services/`, dan Prisma singleton `@/lib/prisma`).
2. **Follow Existing Coding Conventions**: Ikuti standar konvensi koding di [CONVENTIONS.md](./CONVENTIONS.md) (PascalCase untuk komponen React, camelCase untuk fungsi/variabel, snake_case untuk tabel database, penggunaan wrapper `apiGuard.ts` untuk API route).
3. **Avoid Unrelated Changes (Minimal Diffs)**: Jangan melakukan refactoring liar atau mengubah file di luar cakupan tugas yang diminta oleh user.
4. **Do Not Introduce Unnecessary Dependencies**: Jangan menambahkan pustaka baru jika kebutuhan dapat dipenuhi oleh pustaka yang sudah terpasang.
5. **Do Not Silently Change Public Behavior**: Jangan mengubah kontrak API publik, parameter request, format respons JSON, atau hak akses RBAC secara diam-diam tanpa persetujuan eksplisit.
6. **Do Not Bypass Existing Security Controls**: Jangan melewati validasi input (`validateBody`), sanitasi XSS (`sanitizeObject`), pengecekan sesi (`requireAuth`), atau proteksi route guard di `src/proxy.ts`.
7. **Do Not Modify Documentation to Make Incorrect Implementation Appear Correct**: Dilarang keras mengubah dokumentasi di `/docs/` hanya agar implementasi yang keliru tampak benar.

---

## 4. Mandatory Project Brain Assessment (Before Finishing)

Sebelum menyatakan suatu tugas selesai, agent **WAJIB** mengevaluasi pertanyaan penentu berikut:

> *"Apakah tugas ini membuat, menghapus, atau mengubah pengetahuan proyek yang tahan lama (durable project knowledge)?"*

### Jika JAWABANNYA TIDAK:
- **JANGAN** memodifikasi file di `/docs/`.

### Jika JAWABANNYA YA:
- Perbarui dokumen `/docs/` terkait sebelum tugas dianggap selesai:
  - Fitur baru / berubah → [FEATURES.md](./FEATURES.md)
  - Aturan bisnis baru / berubah → [DOMAIN.md](./DOMAIN.md)
  - Alur sistem baru / berubah → [FLOWS.md](./FLOWS.md)
  - Skema / entitas / relasi basis data berubah → [DATA_MODEL.md](./DATA_MODEL.md)
  - Kontrak HTTP / rute API baru / berubah → [API.md](./API.md)
  - Modul / struktur folder penting baru → [CODEBASE_MAP.md](./CODEBASE_MAP.md)
  - Keputusan arsitektur baru → [DECISIONS.md](./DECISIONS.md)
  - Integrasi eksternal baru / berubah → [INTEGRATIONS.md](./INTEGRATIONS.md)
  - Konvensi koding berubah → [CONVENTIONS.md](./CONVENTIONS.md)
  - Model keamanan / batas otorisasi berubah → [SECURITY.md](./SECURITY.md)
  - Batasan teknis penting baru → [CONSTRAINTS.md](./CONSTRAINTS.md)
  - Perilaku mengejutkan / gotcha baru → [GOTCHAS.md](./GOTCHAS.md)
  - Alur pengujian berubah → [TESTING.md](./TESTING.md)
  - Prosedur deployment / build berubah → [WORKFLOWS.md](./WORKFLOWS.md)

---

## 5. Rules Before Finishing

Sebelum menyelesaikan tugas:

1. **Run Relevant Tests**: Jalankan pengujian yang relevan (`npx vitest run tests/services/` atau `npm test`).
2. **Review Git Diff**: Periksa secara teliti hasil `git diff` untuk memastikan kerapian kode dan zero unintended changes.
3. **Verify No Unrelated Modifications**: Pastikan tidak ada berkas sementara, file log, atau perubahan formatting yang tidak disengaja.
4. **Check for Security Issues**: Pastikan tidak ada data sensitif atau celah keamanan baru yang terbuka.
5. **Perform Project Brain Assessment**: Jalankan evaluasi di atas dan perbarui dokumen jika ada durable knowledge baru.
6. **Laporan Status Project Brain**: Di akhir respons, sertakan status ringkas:
   - `Project Brain: UPDATED` (sebutkan dokumen mana saja yang diperbarui dan alasannya), ATAU
   - `Project Brain: NO UPDATE REQUIRED` (jelaskan singkat mengapa tidak ada durable knowledge baru).

---

## 6. Memory Integrity & Cleanliness

- **Never Invent**: Dilarang mengarang arsitektur, aturan bisnis, dependensi, keputusan historis, alur kerja, atau syarat keamanan yang tidak memiliki bukti konkret pada repository.
- **Tandai Ketidakpastian**: Jika informasi tidak dapat diverifikasi secara pasti dari kode sumber atau konfigurasi, tandai secara eksplisit sebagai `UNKNOWN — requires verification`.
- **Jaga Kebersihan Memory**: Dilarang menggunakan `/docs/` sebagai tempat menyimpan:
  - Daftar TODO sementara
  - Log progres tugas
  - Laporan audit kualitas kode
  - Catatan debugging temporer
  - Transkrip percakapan sesi AI

---

## 7. Secrets Policy

**DILARANG KERAS** memasukkan hal-hal berikut ke dalam file dokumentasi di `/docs/`:
- Kata sandi mentah (*passwords*) atau hash kata sandi pengguna riil.
- Kunci API (*API keys*) aktif.
- Token akses atau JWT token riil (*access tokens*).
- Kunci privat kriptografis (*private keys*).
- Kredensial basis data produksi (*credentials*).
- Data identitas pribadi asli karyawan (*sensitive personal information* seperti NIK/No KK riil).

---

## 8. Source of Truth Hierarchy

Dalam mengevaluasi kebenaran teknis, selalu ikuti hierarki berikut dari prioritas tertinggi ke terendah:

```text
1. Actual Implementation (Source code in src/, proxy.ts)
2. Executable Configuration (package.json, next.config.ts, tsconfig.json)
3. Tests, Schemas & Migrations (schema.prisma, tests/)
4. Project Brain (/docs/*.md)
5. Other Documentation (.env.example, inline comments)
6. AI Assumptions (Lowest priority)
```

Jika dokumentasi di `/docs/` bertentangan dengan implementasi kode sumber:
- Sumber kebenaran implementasi adalah **kode sumber aktual**.
- **JANGAN** mengubah kode hanya agar cocok dengan dokumentasi yang usang.
- Laporkan konflik tersebut dan perbarui dokumen yang sudah usang agar kembali selaras dengan kode aktual.

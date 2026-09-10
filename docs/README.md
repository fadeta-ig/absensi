# Project Brain Entry Point — Absensi & HRIS WIG

> **Purpose**: Entry point dan navigation map untuk AI coding agents.  
> **Source of Truth**: Struktur repository dan spesifikasi Project Brain.  
> **Last Verified**: 2026-09-10  

Direktori `/docs/` adalah **Project Brain** resmi untuk repository ini: lapisan pengetahuan tahan lama (*durable knowledge layer*) berbasis Markdown yang dirancang agar AI coding agent (Codex, Antigravity, Claude Code, Cursor, dll.) dapat langsung memahami konteks, arsitektur, domain, aturan bisnis, dan relasi teknis sistem tanpa harus merekonstruksi model mental dari nol pada setiap sesi.

> [!IMPORTANT]
> **Project Brain adalah pengetahuan sistem, bukan laporan audit, issue tracker, TODO list, atau refactoring backlog.**  
> Dokumen ini berfokus pada **MEMAHAMI** dan **MENGINGAT** bagaimana sistem bekerja.

---

## 1. Quick Start for AI Agents

Ketika AI agent memasuki repository ini:

1. Baca [README.md](./README.md) (dokumen ini).
2. Baca [AGENT_RULES.md](./AGENT_RULES.md) (aturan perilaku dan kontrak operasional).
3. Baca [PROJECT.md](./PROJECT.md) (tujuan sistem dan pengguna utama).
4. Baca [CODEBASE_MAP.md](./CODEBASE_MAP.md) (peta direktori dan lokasi implementasi penting).
5. Baca [ARCHITECTURE.md](./ARCHITECTURE.md) (struktur sistem dan batasan runtime).
6. Baca [CONSTRAINTS.md](./CONSTRAINTS.md) (batasan teknis dan operasional).
7. Baca [GOTCHAS.md](./GOTCHAS.md) (perilaku tak terduga dan jebakan implementasi).
8. Baca dokumentasi spesifik tugas (lihat tabel routing di bawah).
9. Periksa kode sumber aktual (*actual source code*) yang berkaitan dengan tugas.
10. Laksanakan pekerjaan yang diminta dengan perubahan minimal dan terarah (*minimal diffs*).

*AI agent tidak perlu membaca seluruh isi `/docs/` setiap saat. Gunakan dokumen ini sebagai indeks routing.*

---

## 2. Task Mental Model & Routing Index

Gunakan panduan routing berikut untuk menentukan dokumen pertama yang harus dibaca sesuai jenis tugas:

| Bidang Tugas | Dokumen yang Wajib Dibaca Terlebih Dahulu |
|---|---|
| **Orientasi Umum Sistem** | [PROJECT.md](./PROJECT.md), [CODEBASE_MAP.md](./CODEBASE_MAP.md), [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **Fitur Baru / Perubahan Fitur** | [DOMAIN.md](./DOMAIN.md), [FEATURES.md](./FEATURES.md), [FLOWS.md](./FLOWS.md), [CONSTRAINTS.md](./CONSTRAINTS.md) |
| **Investigasi Bug / Masalah** | Dokumen domain/fitur/flow terkait + [GOTCHAS.md](./GOTCHAS.md), lalu kode sumber |
| **Basis Data / Perubahan Skema** | [DATA_MODEL.md](./DATA_MODEL.md), [CONSTRAINTS.md](./CONSTRAINTS.md), [FLOWS.md](./FLOWS.md) terkait |
| **Routing / HTTP / Validasi API**| [API.md](./API.md), [CONVENTIONS.md](./CONVENTIONS.md), [SECURITY.md](./SECURITY.md) |
| **Autentikasi & Otorisasi RBAC** | [SECURITY.md](./SECURITY.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [API.md](./API.md) |
| **Desain & Arsitektur Sistem** | [ARCHITECTURE.md](./ARCHITECTURE.md), [DECISIONS.md](./DECISIONS.md), [CODEBASE_MAP.md](./CODEBASE_MAP.md) |
| **Integrasi Eksternal (SMTP/WebPush)**| [INTEGRATIONS.md](./INTEGRATIONS.md), [SECURITY.md](./SECURITY.md), [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **Gaya Koding & Konvensi Kode**| [CONVENTIONS.md](./CONVENTIONS.md), [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **Pengujian & Automated Tests** | [TESTING.md](./TESTING.md), [WORKFLOWS.md](./WORKFLOWS.md), dokumen fitur terkait |
| **Workflow Build & Deployment** | [WORKFLOWS.md](./WORKFLOWS.md), [CONSTRAINTS.md](./CONSTRAINTS.md) |
| **Perilaku Tak Terduga / Kejutan**| [GOTCHAS.md](./GOTCHAS.md), lalu dokumen domain/arsitektur terkait |

---

## 3. Direktori Berkas Project Brain (18 Berkas Canonical)

Setiap file di `/docs/` memiliki kepemilikan dan batas cakupan yang jelas:

| Berkas | Kepemilikan & Tujuan Utama |
|---|---|
| [README.md](./README.md) | Entry point dan peta navigasi untuk AI agent. |
| [AGENT_RULES.md](./AGENT_RULES.md) | Kontrak operasional dan cara AI agent menggunakan Project Brain. |
| [PROJECT.md](./PROJECT.md) | Apa project ini, tujuannya, aktor pengguna, dan kapabilitas utama. |
| [CODEBASE_MAP.md](./CODEBASE_MAP.md) | Peta repository dan lokasi implementasi penting (entry points, layer, services). |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Bagaimana sistem disusun (App Router, Edge Proxy, boundaries, data flows). |
| [DOMAIN.md](./DOMAIN.md) | Pengetahuan domain bisnis (Presensi 3-faktor, PPh 21 TER, BPJS, GA). |
| [DATA_MODEL.md](./DATA_MODEL.md) | Data model dan hubungan antar entitas (47 model Prisma, 50 tabel MariaDB). |
| [FEATURES.md](./FEATURES.md) | Pengetahuan kapabilitas sistem dan batas-batas fungsional fitur. |
| [FLOWS.md](./FLOWS.md) | Alur sistem end-to-end (Auth flow, Attendance 3-factor, Payroll, Visits, BAST). |
| [API.md](./API.md) | Peta API, kontrak JSON envelope, dan mekanisme otorisasi `apiGuard`. |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | Integrasi eksternal & internal (Citranet/MikroTik, SMTP, Web Push, Cron). |
| [CONVENTIONS.md](./CONVENTIONS.md) | Konvensi koding (struktur folder, apiGuard wrapper, penamaan, error handling). |
| [DECISIONS.md](./DECISIONS.md) | Keputusan arsitektural teknis dan alasan faktual (*Architectural Decision Records*). |
| [CONSTRAINTS.md](./CONSTRAINTS.md) | Batasan teknis, runtime boundary, statutory rules, dan batasan operasional. |
| [SECURITY.md](./SECURITY.md) | Model keamanan, boundary otorisasi, enkripsi PII blind-index, anti-fraud. |
| [TESTING.md](./TESTING.md) | Pendekatan pengujian, struktur suite Vitest, dan prosedur eksekusi test. |
| [WORKFLOWS.md](./WORKFLOWS.md) | Alur kerja pengembangan lokal, perintah script npm, build, dan deployment. |
| [GOTCHAS.md](./GOTCHAS.md) | Perilaku mengejutkan, jebakan teknis, dan pitfalls yang harus diwaspadai. |

---

## 4. Source-of-Truth Hierarchy

Jika terjadi ketidaksesuaian antara dokumentasi dan kode nyata, patuhi hierarki berikut:

```text
1. Actual Implementation (Source code aktif di src/, proxy.ts)
      ↓
2. Executable Configuration (package.json, next.config.ts, tsconfig.json)
      ↓
3. Tests, Schemas & Migrations (schema.prisma, tests/)
      ↓
4. Project Brain (/docs/*.md)
      ↓
5. Other Documentation (.env.example, komentar lama)
      ↓
6. AI Assumptions (DILARANG dijadikan dasar tanpa verifikasi)
```

> **Prinsip Utama**: Sumber kebenaran implementasi adalah kode sumber aktual (*source code is the source of truth for implementation*). Project Brain adalah konteks dan model mental. Dilarang mengubah kode hanya agar cocok dengan dokumentasi yang usang. Selalu verifikasi ke kode aktual dan laporkan konfliknya.

---

## 5. Kebijakan Pemeliharaan Memory (Memory Update Policy)

Perbarui Project Brain **hanya ketika terdapat pengetahuan tahan lama (*durable knowledge*)** yang berubah:

- **Contoh Pengetahuan Tahan Lama**:
  - Arsitektur sistem atau batas runtime berubah.
  - Aturan bisnis atau formula perhitungan berubah.
  - Skema data, model entitas, atau relasi basis data berubah.
  - Kontrak endpoint API atau header bertambah/berubah.
  - Integrasi eksternal atau konfigurasi jaringan berubah.
  - Keputusan arsitektur baru diambil.
  - Ditemukan *gotcha* teknis penting yang mengejutkan.
- **Dilarang Memperbarui Memory Untuk**:
  - Perbaikan typo atau pemformatan sepele.
  - Penggantian nama variabel lokal.
  - Langkah-langkah debugging sementara (*ephemeral steps*).
  - Riwayat log percakapan AI.
  - Task progress sementara.

---

## 6. Kebijakan Keamanan & Kerahasiaan (Secrets Policy)

Dilarang keras menyimpan rahasia ke dalam `/docs/`:
- Password mentah atau hash password pengguna riil.
- Kunci API (*API keys*), access tokens, atau JWT secrets.
- Kredensial database atau connection strings produksi.
- Kunci privat kriptografis (*private keys*).
- Data identitas pribadi mentah karyawan (NIK asli, nomor rekening asli, nomor HP riil).

Dokumentasikan *bagaimana* mekanisme keamanan bekerja tanpa menyimpan nilai rahasia aktualnya.

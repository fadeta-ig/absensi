# Coding Conventions — Absensi & HRIS WIG

> **Purpose**: How code is normally written.  
> **Source of Truth**: Established patterns in `src/` and project styling.  
> **Last Verified**: 2026-09-10  

Dokumen ini memuat standar konvensi koding, struktur file, pola error handling, dan pola implementasi yang sudah mapan dalam codebase ini.


---

## 1. Naming Conventions

### File & Direktori
- **API Routes**: Mengikuti standar Next.js App Router: `src/app/api/[module]/route.ts` atau `src/app/api/[module]/[id]/route.ts`.
- **Halaman & Layout**: `page.tsx`, `layout.tsx`, `loading.tsx`.
- **Domain Services**: CamelCase dengan akhiran `Service.ts` (contoh: `attendanceService.ts`, `birthdayService.ts`, `bpjsService.ts`).
- **Komponen React**: PascalCase (contoh: `Employee360View.tsx`, `ConfirmModal.tsx`, `LeaveCalendar.tsx`).
- **Hooks Kustom**: CamelCase diawali `use` (contoh: `useAuth.ts`, `useToast.ts`).
- **Modul Utilitas**: CamelCase (contoh: `timezone.ts`, `networkValidator.ts`, `datePresets.ts`).

### Basis Data & Prisma
- **Model Prisma**: PascalCase (contoh: `Employee`, `UserAccount`, `AttendanceRecord`).
- **Tabel Basis Data**: Snake_case dalam bentuk jamak melalui anotasi `@@map` (contoh: `employees`, `user_accounts`, `attendance_records`).
- **Field Model**: CamelCase pada skema Prisma, di-map ke snake_case pada basis data melalui `@map` (contoh: `employeeId String @map("employee_id")`, `passwordHash String @map("password_hash")`).
- **Foreign Keys**: Anotasi eksplisit nama index/constraint `map: "idx_..."` atau `map: "..._fkey"`.

### Variabel & Fungsi
- **Fungsi & Variabel**: camelCase (contoh: `calculateDistance`, `isOfficeWifiNetwork`, `activeSession`).
- **Konstanta Global & Enums**: UPPER_SNAKE_CASE (contoh: `OFFICE_ALLOWED_IPS`, `SYSTEM_ROLES`, `PERMISSIONS`).
- **Tipe & Interface**: PascalCase (contoh: `SessionPayload`, `UserPrincipal`, `AttendanceRecord`).

---

## 2. Project Structure Conventions

Kode sumber diorganisasikan dalam folder `src/` dengan pembagian peran yang tegas:

```
src/
├── app/                  # Next.js App Router (Halaman, Layout, dan API Endpoints)
│   ├── (auth)/login      # Halaman utama login
│   ├── dashboard/        # HR Admin Portal UI (/dashboard/*)
│   ├── ga/               # General Affairs Portal UI (/ga/*)
│   ├── employee/         # Employee Mobile PWA Portal UI (/employee/*)
│   └── api/              # 29 modul REST API backend
├── components/           # Komponen UI bersama (React)
│   ├── dashboard/        # Komponen khusus dashboard HR
│   ├── ui/               # Primitif shadcn / Radix UI
│   └── ...               # Komponen modal, form, dan kartu
├── features/             # Fitur mandiri dengan scoped components & styles (contoh: features/ga)
├── hooks/                # Kumpulan kustom React hooks
├── lib/                  # Backend utilities, security, service layer, dan client helpers
│   ├── constants/        # Nilai konstan aplikasi
│   ├── middleware/       # API guard, sanitasi, dan otorisasi
│   ├── security/         # Enkripsi AES-256-GCM dan hashing PII
│   ├── services/         # 25 Domain Services (business logic murni)
│   ├── validations/      # Skema validasi Zod
│   ├── auth.ts           # Manajemen sesi dan enkripsi JWT (jose)
│   ├── logger.ts         # Logger Winston terpusat
│   └── prisma.ts         # Singleton client Prisma
├── proxy.ts              # Route guard Edge Runtime (Next.js 16)
└── types/                # Definisi tipe TypeScript global
```

---

## 3. Error Handling Patterns

Aplikasi mewajibkan pola penanganan error yang konsisten di semua API route:

### Pola Standar API Route Handler
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { mySchema } from "@/lib/validations/validationSchemas";
import { doSomethingService } from "@/lib/services/myService";

export async function POST(request: NextRequest) {
    // 1. Verifikasi Sesi
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    // 2. Otorisasi Peran / Izin
    if (!session.permissions.includes("hr.manage")) {
        return forbiddenResponse();
    }

    try {
        // 3. Sanitasi & Validasi Input (Zod)
        const result = await validateBody(request, mySchema);
        if ("error" in result) return result.error;
        const body = result.data;

        // 4. Eksekusi Logika Bisnis di Service Layer
        const data = await doSomethingService(body, session);

        // 5. Respons Berhasil
        return NextResponse.json({ success: true, data });
    } catch (err) {
        // 6. Tangani Error Server dengan Logging Terpusat
        return serverErrorResponse("MyModulePOST", err, { userId: session.userId });
    }
}
```

### Karakteristik Respons Error:
- **400 Bad Request**: `{ error: "Data tidak valid", details: ["pesan error 1", "pesan error 2"] }`
- **401 Unauthorized**: `{ error: "Sesi Anda telah berakhir. Silakan login kembali." }` (menghapus cookie `session`).
- **403 Forbidden**: `{ error: "Anda tidak memiliki akses untuk melakukan tindakan ini." }`
- **500 Internal Server Error**: `{ error: "Terjadi kesalahan pada server. Silakan coba lagi." }` (stack trace dan detail internal dicatat ke Winston, *tidak pernah* dikirim ke browser).

---

## 4. Established Implementation Patterns

1. **Pemisahan Antara Akun Pengguna (`UserAccount`) dan Profil Pegawai (`Employee`)**:
   - Akun admin dapat berdiri sendiri di `UserAccount` tanpa keharusan memiliki entitas `Employee`.
   - Pegawai memiliki relasi 1-ke-1 opsional dengan `UserAccount` untuk login portal mandiri.

2. **Sanitasi Otomatis Sebelum Validasi (XSS Prevention)**:
   - Fungsi `validateBody()` secara otomatis memanggil `sanitizeObject()` yang menyaring tag HTML dari string sebelum di-parse oleh skema Zod.

3. **Enkripsi PII Dua Lapis (Encryption + Blind Index)**:
   - Data identitas sensitif (NIK, BPJS, No Rekening) dienkripsi dengan AES-256-GCM (`enc:v1:...`).
   - Nilai hash HMAC-SHA256 (`*_hash`) disimpan di kolom terpisah untuk menjamin keunikan (*unique constraint*) dan pencarian cepat.

4. **Edge Runtime Proxy**:
   - Next.js 16 menggunakan file `src/proxy.ts` yang mengekspor fungsi `proxy()`. File ini ringan dan tidak menggunakan Node module yang tidak kompatibel dengan Edge Runtime.

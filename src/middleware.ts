/**
 * Next.js Middleware — Server-Side Route Guard
 *
 * File ini berjalan di Edge Runtime SEBELUM halaman/API di-render.
 * Dengan ini, proteksi tidak lagi bergantung pada client-side useEffect fetch.
 *
 * Alur:
 * - Request ke /dashboard/* atau /employee/* → cek cookie "session"
 * - Token valid + role sesuai → lanjut
 * - Token tidak ada / tidak valid → redirect ke /
 * - Role salah (employee ke dashboard, HR ke employee) → redirect ke halaman yang sesuai
 *
 * Catatan: middleware.ts HARUS di root src/ atau root project, bukan di dalam app/
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// ─── Secret ──────────────────────────────────────────────────
// Harus sama dengan yang digunakan di lib/auth.ts
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
    // Ini akan throw saat build/startup — intentional fail-fast
    throw new Error(
        "JWT_SECRET wajib diisi di .env dan minimal 16 karakter. Middleware tidak dapat berjalan."
    );
}

const SECRET = new TextEncoder().encode(JWT_SECRET);

// ─── Route Groups ─────────────────────────────────────────────
const HR_ONLY_PREFIX = "/dashboard";
const EMPLOYEE_PREFIX = "/employee";

// ─── Helper ───────────────────────────────────────────────────
interface SessionPayload {
    id: string;
    employeeId: string;
    name: string;
    role: "employee" | "hr";
    level: string;
}

async function getSessionFromCookie(
    request: NextRequest
): Promise<SessionPayload | null> {
    const token = request.cookies.get("session")?.value;
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, SECRET);
        return payload as unknown as SessionPayload;
    } catch {
        // Token expired, invalid signature, or malformed
        return null;
    }
}

// ─── Middleware ────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isDashboardRoute = pathname.startsWith(HR_ONLY_PREFIX);
    const isEmployeeRoute = pathname.startsWith(EMPLOYEE_PREFIX);

    // Bukan route yang perlu dilindungi — lewatkan
    if (!isDashboardRoute && !isEmployeeRoute) {
        return NextResponse.next();
    }

    const session = await getSessionFromCookie(request);

    // Tidak ada session valid → redirect ke login
    if (!session) {
        const loginUrl = new URL("/", request.url);
        // Simpan halaman yang ingin dituju, opsional untuk redirect setelah login
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Route HR-only: hanya role "hr" yang boleh masuk /dashboard
    if (isDashboardRoute && session.role !== "hr") {
        // Employee yang coba akses dashboard → arahkan ke employee portal
        return NextResponse.redirect(new URL(EMPLOYEE_PREFIX, request.url));
    }

    // Route employee: role "hr" yang mengakses /employee → arahkan ke dashboard
    if (isEmployeeRoute && session.role === "hr") {
        return NextResponse.redirect(new URL(HR_ONLY_PREFIX, request.url));
    }

    // Session valid, role sesuai → lanjutkan request
    return NextResponse.next();
}

// ─── Route Matcher ────────────────────────────────────────────
// Middleware hanya aktif untuk route yang relevan.
// Pattern ini mengecualikan file statis, _next internal, favicon, dll.
export const config = {
    matcher: [
        /*
         * Match semua request path KECUALI yang dimulai dengan:
         * - /api (API routes — punya auth guard sendiri via requireAuth())
         * - /_next/static (file statis Next.js)
         * - /_next/image (image optimization)
         * - /favicon.ico
         * - /assets (folder public/assets)
         * - /models (face-api.js model files di /public/models)
         * - /icons (PWA icons)
         */
        "/((?!api|_next/static|_next/image|favicon\\.ico|assets|models|icons).*)",
    ],
};

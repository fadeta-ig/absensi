/**
 * Next.js Proxy (Route Guard) — Next.js 16
 *
 * Di Next.js 16, file ini harus bernama "proxy.ts" dan export fungsi bernama "proxy".
 * Berjalan di Edge Runtime SEBELUM halaman/API di-render.
 *
 * Alur:
 * - Request ke /dashboard/* → hanya role "hr"
 * - Request ke /employee/* → hanya role "employee"
 * - Token tidak valid / tidak ada → redirect ke / (login)
 * - Role salah → redirect ke portal yang sesuai
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// ─── Route Groups ─────────────────────────────────────────────
const HR_ONLY_PREFIX = "/dashboard";
const EMPLOYEE_PREFIX = "/employee";
const GA_PREFIX = "/ga";


// ─── Session Helper ───────────────────────────────────────────
interface SessionPayload {
    id: string;
    employeeId: string;
    name: string;
    role: "employee" | "hr" | "ga";
    level: string;
}

async function getSession(request: NextRequest): Promise<SessionPayload | null> {
    const jwtSecret = process.env.JWT_SECRET;

    // Jika JWT_SECRET tidak dikonfigurasi, lewatkan tanpa crash
    if (!jwtSecret || jwtSecret.length < 16) return null;

    const token = request.cookies.get("session")?.value;
    if (!token) return null;

    try {
        const secret = new TextEncoder().encode(jwtSecret);
        const { payload } = await jwtVerify(token, secret);
        return payload as unknown as SessionPayload;
    } catch {
        // Token expired, invalid signature, atau malformed
        return null;
    }
}

// ─── Proxy Function (Next.js 16) ──────────────────────────────
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isDashboard = pathname.startsWith(HR_ONLY_PREFIX);
    const isEmployee = pathname.startsWith(EMPLOYEE_PREFIX);
    const isGa = pathname.startsWith(GA_PREFIX);


    // Route tidak memerlukan auth → lewatkan
    if (!isDashboard && !isEmployee && !isGa) {
        return NextResponse.next();
    }

    const session = await getSession(request);

    // Tidak ada session valid → redirect ke halaman login
    if (!session) {
        const loginUrl = new URL("/", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // /dashboard/* → hanya HR
    if (isDashboard && session.role !== "hr") {
        if (session.role === "ga") return NextResponse.redirect(new URL(GA_PREFIX, request.url));
        return NextResponse.redirect(new URL(EMPLOYEE_PREFIX, request.url));
    }

    // /employee/* → HR dan GA diarahkan ke portal masing-masing
    if (isEmployee && session.role !== "employee") {
        if (session.role === "ga") return NextResponse.redirect(new URL(GA_PREFIX, request.url));
        return NextResponse.redirect(new URL(HR_ONLY_PREFIX, request.url));
    }

    // /ga/* → hanya GA
    if (isGa && session.role !== "ga") {
        if (session.role === "hr") return NextResponse.redirect(new URL(HR_ONLY_PREFIX, request.url));
        return NextResponse.redirect(new URL(EMPLOYEE_PREFIX, request.url));
    }

    return NextResponse.next();
}

// ─── Route Matcher ────────────────────────────────────────────
export const config = {
    matcher: [
        /**
         * Aktif di semua path KECUALI:
         * - /api (punya auth guard sendiri)
         * - /_next/* (Next.js internals)
         * - /favicon.ico, /assets, /models, /icons
         */
        "/((?!api|_next/static|_next/image|favicon\\.ico|assets|models|icons).*)",
    ],
};

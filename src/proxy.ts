/**
 * Next.js Proxy (Route Guard) — Next.js 16
 *
 * Di Next.js 16, file ini harus bernama "proxy.ts" dan export fungsi bernama "proxy".
 * Berjalan di Edge Runtime SEBELUM halaman/API di-render.
 *
 * Alur:
 * - Request ke / (login) → jika sudah login, redirect ke portal sesuai role
 * - Request ke /dashboard/* → hanya role "hr"
 * - Request ke /employee/* → karyawan internal (employeeId + employee.self)
 * - Request ke /ga/* → hanya role "ga"
 * - Request ke /outsource/* → akun outsource (permission "outsource.portal")
 * - Request ke /cleaning/* → permission "cleaning.execute"
 * - Token tidak valid / tidak ada → redirect ke / (login)
 * - Role salah → redirect ke portal yang sesuai
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, JWTPayload } from "jose";
import { PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";

// ─── Route Groups ─────────────────────────────────────────────
const HR_ONLY_PREFIX = "/dashboard";
const EMPLOYEE_PREFIX = "/employee";
const GA_PREFIX = "/ga";
const OUTSOURCE_PREFIX = "/outsource";
const CLEANING_PREFIX = "/cleaning";

// ─── Session Helper ───────────────────────────────────────────
/**
 * @mirror Canonical source: src/lib/auth.ts → SessionPayload
 * Duplicated from @/lib/auth — cannot import in Edge Runtime.
 * Jika mengubah field di auth.ts, update juga di sini.
 */
interface SessionPayload extends JWTPayload {
    userId: string;
    username: string;
    employeeId: string | null;
    name: string;
    roles: string[];
    permissions: string[];
    sessionVersion?: number;
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
        return payload as SessionPayload;
    } catch {
        // Token expired, invalid signature, atau malformed
        return null;
    }
}

function resolvePortalFlags(session: SessionPayload) {
    const permissions = Array.isArray(session.permissions) ? session.permissions : [];
    const roles = Array.isArray(session.roles) ? session.roles : [];
    const canHr = permissions.includes(PERMISSIONS.HR_MANAGE);
    const canGa = permissions.includes(PERMISSIONS.GA_MANAGE);
    const canManageUsers = permissions.includes(PERMISSIONS.USER_MANAGE);
    const canOutsource = permissions.includes(PERMISSIONS.OUTSOURCE_PORTAL);
    const canCleaning =
        roles.includes(SYSTEM_ROLES.CLEANING_WORKER) &&
        permissions.includes(PERMISSIONS.CLEANING_EXECUTE);
    const canEmployee = Boolean(session.employeeId) && permissions.includes(PERMISSIONS.EMPLOYEE_SELF);
    const landing = canHr
        ? HR_ONLY_PREFIX
        : canGa
            ? GA_PREFIX
            : canOutsource
                ? OUTSOURCE_PREFIX
                : canCleaning
                    ? CLEANING_PREFIX
                    : canEmployee
                        ? EMPLOYEE_PREFIX
                        : null;
    return { canHr, canGa, canManageUsers, canOutsource, canCleaning, canEmployee, landing };
}

// ─── Proxy Function (Next.js 16) ──────────────────────────────
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isDashboard = pathname.startsWith(HR_ONLY_PREFIX);
    const isUserManagement = pathname.startsWith("/dashboard/users");
    const isEmployee = pathname.startsWith(EMPLOYEE_PREFIX);
    const isGa = pathname.startsWith(GA_PREFIX);
    const isOutsource = pathname.startsWith(OUTSOURCE_PREFIX);
    const isCleaning = pathname.startsWith(CLEANING_PREFIX);

    // Route root login (/) → jika sesi masih aktif, arahkan langsung ke portal
    if (pathname === "/") {
        const session = await getSession(request);
        if (session) {
            const { landing } = resolvePortalFlags(session);
            if (landing) {
                return NextResponse.redirect(new URL(landing, request.url));
            }
        }
        return NextResponse.next();
    }

    // Route tidak memerlukan auth → lewatkan
    if (!isDashboard && !isEmployee && !isGa && !isOutsource && !isCleaning) {
        return NextResponse.next();
    }

    const session = await getSession(request);

    // Tidak ada session valid → redirect ke halaman login
    if (!session) {
        const loginUrl = new URL("/", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    const { canHr, canGa, canManageUsers, canOutsource, canCleaning, canEmployee, landing } =
        resolvePortalFlags(session);
    const fallbackLanding = landing ?? "/";

    if (isDashboard && !canHr) return NextResponse.redirect(new URL(fallbackLanding, request.url));
    if (isUserManagement && !canManageUsers) return NextResponse.redirect(new URL(HR_ONLY_PREFIX, request.url));

    // /employee/* → khusus karyawan internal
    if (isEmployee && !canEmployee) return NextResponse.redirect(new URL(fallbackLanding, request.url));

    // /ga/* → hanya GA
    if (isGa && !canGa) return NextResponse.redirect(new URL(fallbackLanding, request.url));

    // /outsource/* → khusus portal outsource (permission outsource.portal)
    if (isOutsource && !canOutsource) return NextResponse.redirect(new URL(fallbackLanding, request.url));

    // /cleaning/* → permission cleaning.execute (karyawan internal maupun OS)
    if (isCleaning && !canCleaning) return NextResponse.redirect(new URL(fallbackLanding, request.url));

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

/**
 * In-Memory Rate Limiter
 *
 * ⚠️  KETERBATASAN PENTING:
 * Rate limiter ini menggunakan Map JavaScript di memori proses Node.js.
 * Ini berfungsi dengan baik untuk deployment single-instance (PM2, VPS, Docker single container).
 *
 * TIDAK efektif jika:
 * - Deploy di beberapa instance / multi-server (load balancer)
 * - Platform serverless (Vercel, Netlify Functions) — setiap invocation adalah proses baru
 *
 * Untuk production multi-instance, migrasi ke Redis-based rate limiter:
 * - Upstash Redis (serverless-friendly): https://upstash.com/
 * - ioredis + custom sliding window
 *
 * Untuk single-server (PM2 cluster mode), gunakan `cluster.isMaster` + IPC,
 * atau `@cluster-key-value/rate-limiter`.
 */

import { NextResponse } from "next/server";

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// ─── Cleanup Task ──────────────────────────────────────────────
// Hapus entry yang sudah expired setiap 5 menit untuk mencegah memory leak
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Guard: jangan jalankan setInterval di Edge Runtime (middleware)
if (typeof globalThis.setInterval !== "undefined") {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of rateLimitStore) {
            if (now > entry.resetTime) {
                rateLimitStore.delete(key);
            }
        }
    }, CLEANUP_INTERVAL_MS);
}

// ─── IP Extraction ─────────────────────────────────────────────
/**
 * Ambil IP client dari header request.
 * Mendukung: Nginx reverse proxy (x-forwarded-for), Cloudflare (cf-connecting-ip),
 * dan fallback ke "unknown" jika tidak tersedia.
 */
function getClientIp(headers: Headers): string {
    return (
        headers.get("cf-connecting-ip") ||           // Cloudflare
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() || // Nginx / Load Balancer
        headers.get("x-real-ip") ||                   // Alternative proxy header
        "unknown"
    );
}

// ─── Core Rate Limit Function ──────────────────────────────────
/**
 * Periksa apakah request dari IP ini sudah melebihi batas.
 * Menggunakan algoritma Fixed Window Counter.
 *
 * @returns null jika masih dalam batas, NextResponse 429 jika rate-limited
 */
export function checkRateLimit(
    headers: Headers,
    prefix: string,
    maxRequests: number,
    windowMs: number
): NextResponse | null {
    const ip = getClientIp(headers);
    const key = `${prefix}:${ip}`;
    const now = Date.now();

    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
        // Window baru atau window lama sudah expired
        rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
        return null;
    }

    entry.count++;

    if (entry.count > maxRequests) {
        const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);
        return NextResponse.json(
            {
                error: "Terlalu banyak permintaan. Silakan coba lagi nanti.",
                retryAfter: retryAfterSeconds,
            },
            {
                status: 429,
                headers: {
                    "Retry-After": String(retryAfterSeconds),
                    "X-RateLimit-Limit": String(maxRequests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": String(entry.resetTime),
                },
            }
        );
    }

    return null;
}

// ─── Presets ──────────────────────────────────────────────────

/**
 * Login: 5 request per 60 detik per IP.
 * Mencegah brute-force password.
 */
export function checkLoginRateLimit(headers: Headers): NextResponse | null {
    return checkRateLimit(headers, "login", 5, 60_000);
}

/**
 * General API: 60 request per 60 detik per IP.
 * Batasan longgar untuk operasi normal karyawan.
 */
export function checkApiRateLimit(headers: Headers): NextResponse | null {
    return checkRateLimit(headers, "api", 60, 60_000);
}

/**
 * Sensitive actions (ganti password, register wajah, dll): 10 request per 60 detik.
 */
export function checkSensitiveRateLimit(headers: Headers): NextResponse | null {
    return checkRateLimit(headers, "sensitive", 10, 60_000);
}

import { NextResponse } from "next/server";
import logger from "@/lib/logger";

interface RateLimitEntry {
    count: number;
    resetTime: number;
    exceededLogged: boolean;
}

interface RateLimitLogMeta {
    prefix: string;
    ip?: string;
    identifier?: string;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

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

function getClientIp(headers: Headers): string {
    return (
        headers.get("cf-connecting-ip")
        || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || headers.get("x-real-ip")
        || "unknown"
    );
}

function checkRateLimitKey(
    key: string,
    meta: RateLimitLogMeta,
    maxRequests: number,
    windowMs: number
): NextResponse | null {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
        rateLimitStore.set(key, { count: 1, resetTime: now + windowMs, exceededLogged: false });
        return null;
    }

    entry.count++;

    if (entry.count > maxRequests) {
        const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);
        if (!entry.exceededLogged) {
            logger.warn("Rate limit exceeded", {
                ...meta,
                count: entry.count,
                maxRequests,
                windowMs,
                retryAfterSeconds,
            });
            entry.exceededLogged = true;
        }

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

export function checkRateLimit(
    headers: Headers,
    prefix: string,
    maxRequests: number,
    windowMs: number
): NextResponse | null {
    const ip = getClientIp(headers);
    return checkRateLimitKey(`${prefix}:${ip}`, { prefix, ip }, maxRequests, windowMs);
}

function normalizeIdentifier(identifier: string): string {
    return identifier.trim().toLowerCase();
}

export function checkLoginRateLimit(headers: Headers, identifier: string): NextResponse | null {
    const ipLimited = checkRateLimit(headers, "login:ip", 30, 60_000);
    if (ipLimited) return ipLimited;

    const normalizedIdentifier = normalizeIdentifier(identifier);
    if (!normalizedIdentifier) return null;

    return checkRateLimitKey(
        `login:account:${normalizedIdentifier}`,
        { prefix: "login:account", identifier: normalizedIdentifier },
        5,
        60_000
    );
}

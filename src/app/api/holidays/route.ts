import { NextRequest, NextResponse } from "next/server";
import {
    forbiddenResponse,
    requireAuth,
    unauthorizedResponse,
} from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { normalizeHolidayPayload } from "@/lib/services/holidayService";
import logger from "@/lib/logger";

const HOLIDAY_API_URL = "https://api-hari-libur.vercel.app/api";
const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    const rawYear = request.nextUrl.searchParams.get("year");
    const year = Number(rawYear);

    if (!rawYear || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
        return NextResponse.json(
            { error: `Tahun harus berupa angka antara ${MIN_YEAR} dan ${MAX_YEAR}.` },
            { status: 400 }
        );
    }

    try {
        const upstreamResponse = await fetch(`${HOLIDAY_API_URL}?year=${year}`, {
            headers: { Accept: "application/json" },
            next: { revalidate: 86_400 },
            signal: AbortSignal.timeout(8_000),
        });

        if (!upstreamResponse.ok) {
            throw new Error(`Holiday API returned HTTP ${upstreamResponse.status}`);
        }

        const payload: unknown = await upstreamResponse.json();
        const holidays = normalizeHolidayPayload(payload, year);

        return NextResponse.json(
            {
                data: holidays,
                year,
                source: "API Hari Libur Indonesia",
            },
            {
                headers: {
                    "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
                },
            }
        );
    } catch (error) {
        logger.error("[HolidaysGET] Gagal mengambil kalender nasional", {
            year,
            error: error instanceof Error ? error.message : String(error),
        });

        return NextResponse.json(
            { error: "Data hari libur nasional sedang tidak tersedia. Silakan coba lagi nanti." },
            { status: 502 }
        );
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getGlobalHolidays } from "@/lib/services/holidayService";
import { toWIBDateString } from "@/lib/timezone";

const MIN_YEAR = 1995;
const MAX_YEAR = 2100;

/**
 * Kalender libur global (nasional + cuti bersama, logic kalenderbali.com).
 * Data publik tanpa PII: cukup sesi aktif, tanpa gate HR.
 * Bentuk: { success, data: [{ date, name, type }], year, month, source }.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const searchParams = request.nextUrl.searchParams;
        const rawYear = searchParams.get("year");
        const rawMonth = searchParams.get("month");

        const year = rawYear === null ? Number(toWIBDateString().slice(0, 4)) : Number(rawYear);
        if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
            return NextResponse.json(
                { error: `Tahun harus berupa angka antara ${MIN_YEAR} dan ${MAX_YEAR}.` },
                { status: 400 }
            );
        }

        let month: number | undefined;
        if (rawMonth !== null) {
            month = Number(rawMonth);
            if (!Number.isInteger(month) || month < 1 || month > 12) {
                return NextResponse.json({ error: "Bulan harus berupa angka 1-12." }, { status: 400 });
            }
        }

        const { data, source } = await getGlobalHolidays(year, month);
        return NextResponse.json(
            { success: true, data, year, month: month ?? null, source },
            {
                headers: {
                    "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
                },
            }
        );
    } catch (error) {
        return serverErrorResponse("CalendarHolidaysGET", error);
    }
}

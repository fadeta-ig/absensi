import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "unauthorized" }, { status: 401 })),
    forbiddenResponse: vi.fn(() => NextResponse.json({ error: "forbidden" }, { status: 403 })),
    serverErrorResponse: vi.fn((scope: string) => NextResponse.json({ error: `internal:${scope}` }, { status: 500 })),
}));

import { requireAuth } from "@/lib/middleware/apiGuard";
import { clearHolidayCache } from "@/lib/services/holidayService";
import { GET as calendarHolidaysGET } from "@/app/api/calendar/holidays/route";

describe("Calendar Holidays API (global, mock auth + real vendored service)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearHolidayCache();
    });

    it("401 tanpa sesi", async () => {
        vi.mocked(requireAuth).mockResolvedValue(null);

        const res = await calendarHolidaysGET(new NextRequest("http://localhost/api/calendar/holidays?year=2026"));

        expect(res.status).toBe(401);
    });

    it("200 + 16 libur nasional 2026 dari vendored (tanpa gate HR)", async () => {
        vi.mocked(requireAuth).mockResolvedValue({ employeeId: "EMP001" } as never);

        const res = await calendarHolidaysGET(new NextRequest("http://localhost/api/calendar/holidays?year=2026"));

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.year).toBe(2026);
        expect(json.source).toBe("vendored");
        expect(json.data).toHaveLength(16);
        expect(json.data[0].date).toBe("2026-01-01");
    });

    it("filter bulan mengembalikan hanya bulan itu", async () => {
        vi.mocked(requireAuth).mockResolvedValue({ employeeId: "EMP001" } as never);

        const res = await calendarHolidaysGET(new NextRequest("http://localhost/api/calendar/holidays?year=2026&month=8"));

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.month).toBe(8);
        expect(json.data.map((holiday: { date: string }) => holiday.date)).toEqual([
            "2026-08-17",
            "2026-08-25",
        ]);
    });

    it("400 untuk tahun dan bulan invalid", async () => {
        vi.mocked(requireAuth).mockResolvedValue({ employeeId: "EMP001" } as never);

        const badYear = await calendarHolidaysGET(new NextRequest("http://localhost/api/calendar/holidays?year=abcd"));
        expect(badYear.status).toBe(400);

        const badMonth = await calendarHolidaysGET(
            new NextRequest("http://localhost/api/calendar/holidays?year=2026&month=13")
        );
        expect(badMonth.status).toBe(400);
    });
});

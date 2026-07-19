import { describe, expect, it } from "vitest";
import { normalizeHolidayPayload } from "@/lib/services/holidayService";

describe("normalizeHolidayPayload", () => {
    it("normalizes the current API envelope and identifies joint leave", () => {
        const result = normalizeHolidayPayload({
            status: "success",
            data: [
                { date: "2026-01-01", description: "Tahun Baru 2026 Masehi" },
                { date: "2026-03-20", description: "Cuti Bersama Hari Raya Idul Fitri" },
            ],
        }, 2026);

        expect(result).toEqual([
            { date: "2026-01-01", name: "Tahun Baru 2026 Masehi", type: "national" },
            { date: "2026-03-20", name: "Cuti Bersama Hari Raya Idul Fitri", type: "joint-leave" },
        ]);
    });

    it("accepts the legacy array shape and removes invalid, duplicate, or out-of-year data", () => {
        const result = normalizeHolidayPayload([
            { holiday_date: "2026-08-17", holiday_name: "Hari Kemerdekaan Republik Indonesia" },
            { holiday_date: "2026-08-17", holiday_name: "Hari Kemerdekaan Republik Indonesia" },
            { holiday_date: "2025-12-25", holiday_name: "Hari Raya Natal" },
            { holiday_date: "not-a-date", holiday_name: "Invalid" },
            { holiday_date: "2026-12-25", holiday_name: "" },
        ], 2026);

        expect(result).toEqual([
            {
                date: "2026-08-17",
                name: "Hari Kemerdekaan Republik Indonesia",
                type: "national",
            },
        ]);
    });

    it("returns an empty list for an unsupported payload", () => {
        expect(normalizeHolidayPayload({ data: null }, 2026)).toEqual([]);
    });
});

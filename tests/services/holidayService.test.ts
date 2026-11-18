import { beforeEach, describe, expect, it } from "vitest";
import {
    normalizeHolidayPayload,
    normalizeKalenderBaliPayload,
    padHolidayDate,
    getGlobalHolidays,
    findHolidaysInDates,
    clearHolidayCache,
} from "@/lib/services/holidayService";

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

describe("normalizeKalenderBaliPayload (logic kalenderbali.com)", () => {
    it("keeps national holidays and zero-pads dates", () => {
        const result = normalizeKalenderBaliPayload(
            [
                { holiday_date: "2026-08-17", holiday_name: "Hari Proklamasi Kemerdekaan RI", is_national_holiday: true },
                { holiday_date: "2026-6-1", holiday_name: "Hari Lahirnya Pancasila", is_national_holiday: true },
            ],
            2026
        );

        expect(result).toEqual([
            { date: "2026-06-01", name: "Hari Lahirnya Pancasila", type: "national" },
            { date: "2026-08-17", name: "Hari Proklamasi Kemerdekaan RI", type: "national" },
        ]);
    });

    it("discards Bali/regional days (is_national_holiday false)", () => {
        const result = normalizeKalenderBaliPayload(
            [
                { holiday_date: "2026-06-17", holiday_name: "Hari Raya Galungan", is_national_holiday: false },
                { holiday_date: "2026-01-17", holiday_name: "Hari Siwa Ratri", is_national_holiday: false },
                { holiday_date: "2026-08-17", holiday_name: "Hari Proklamasi Kemerdekaan RI", is_national_holiday: true },
            ],
            2026
        );

        expect(result).toEqual([
            { date: "2026-08-17", name: "Hari Proklamasi Kemerdekaan RI", type: "national" },
        ]);
    });

    it("classifies cuti bersama by name and drops invalid or out-of-year rows", () => {
        const result = normalizeKalenderBaliPayload(
            [
                { holiday_date: "2026-12-24", holiday_name: "Cuti Bersama Hari Raya Natal", is_national_holiday: true },
                { holiday_date: "2026-08-17", holiday_name: "Hari Proklamasi Kemerdekaan RI", is_national_holiday: true },
                { holiday_date: "2026-08-17", holiday_name: "Hari Proklamasi Kemerdekaan RI", is_national_holiday: true },
                { holiday_date: "2025-12-25", holiday_name: "Hari Raya Natal", is_national_holiday: true },
                { holiday_date: "2026-02-30", holiday_name: "Tanggal tak nyata", is_national_holiday: true },
                { holiday_date: "not-a-date", holiday_name: "Invalid", is_national_holiday: true },
                { holiday_date: "2026-12-25", holiday_name: "", is_national_holiday: true },
                { holiday_date: "2026-12-25", holiday_name: "Hari Raya Natal", is_national_holiday: "yes" },
            ],
            2026
        );

        expect(result).toEqual([
            { date: "2026-08-17", name: "Hari Proklamasi Kemerdekaan RI", type: "national" },
            { date: "2026-12-24", name: "Cuti Bersama Hari Raya Natal", type: "joint-leave" },
        ]);
    });
});

describe("padHolidayDate", () => {
    it("zero-pads month and day", () => {
        expect(padHolidayDate("2026-6-1")).toBe("2026-06-01");
        expect(padHolidayDate("2026-08-17")).toBe("2026-08-17");
    });

    it("returns empty string for non YYYY-M-D shapes", () => {
        expect(padHolidayDate("not-a-date")).toBe("");
        expect(padHolidayDate("2026/06/01")).toBe("");
    });
});

describe("getGlobalHolidays (vendored kalenderbali)", () => {
    beforeEach(() => {
        clearHolidayCache();
    });

    it("loads 16 national holidays for 2026 from vendored data", async () => {
        const { data, source } = await getGlobalHolidays(2026);

        expect(source).toBe("vendored");
        expect(data).toHaveLength(16);
        expect(data[0].date).toBe("2026-01-01");
        expect(data.find((holiday) => holiday.date === "2026-08-17")).toMatchObject({
            name: "Hari Proklamasi Kemerdekaan RI",
            type: "national",
        });
        // Hari Bali tidak ikut: Galungan 2026-06-17 dibuang.
        expect(data.some((holiday) => holiday.date === "2026-06-17")).toBe(false);
        // Tanggal non-padded ternormalisasi.
        expect(data.some((holiday) => holiday.date === "2026-06-01")).toBe(true);
        expect(data.some((holiday) => holiday.date === "2026-06-1")).toBe(false);
    });

    it("filters by month", async () => {
        const { data } = await getGlobalHolidays(2026, 8);

        expect(data.map((holiday) => holiday.date).sort()).toEqual(["2026-08-17", "2026-08-25"]);
    });

    it("findHolidaysInDates returns only matching holidays sorted by date", async () => {
        const found = await findHolidaysInDates(["2026-08-18", "2026-08-17", "2026-08-25"]);

        expect(found.map((holiday) => holiday.date)).toEqual(["2026-08-17", "2026-08-25"]);
    });
});

import { describe, it, expect } from "vitest";
import {
    getToday,
    getYesterday,
    getThisWeekRange,
    getThisMonthRange,
    getLastMonthRange,
    isDateInRange,
} from "@/lib/datePresets";

describe("datePresets utilities", () => {
    it("returns formatted YYYY-MM-DD for today and yesterday", () => {
        const today = getToday();
        const yesterday = getYesterday();
        expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns valid week range", () => {
        const { start, end } = getThisWeekRange();
        expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(start <= end).toBe(true);
    });

    it("returns valid month range for this month and last month", () => {
        const thisMonth = getThisMonthRange();
        expect(thisMonth.start).toMatch(/^\d{4}-\d{2}-01$/);
        expect(thisMonth.start <= thisMonth.end).toBe(true);

        const lastMonth = getLastMonthRange();
        expect(lastMonth.start).toMatch(/^\d{4}-\d{2}-01$/);
        expect(lastMonth.start <= lastMonth.end).toBe(true);
    });

    it("evaluates isDateInRange correctly", () => {
        expect(isDateInRange("2026-05-15", "2026-05-01", "2026-05-31")).toBe(true);
        expect(isDateInRange("2026-06-01", "2026-05-01", "2026-05-31")).toBe(false);
        expect(isDateInRange("2026-04-30", "2026-05-01", "2026-05-31")).toBe(false);
        // Open bounds
        expect(isDateInRange("2026-05-15", "2026-05-01", undefined)).toBe(true);
        expect(isDateInRange("2026-05-15", undefined, "2026-05-31")).toBe(true);
        expect(isDateInRange("2026-05-15", undefined, undefined)).toBe(true);
        // ISO string with time
        expect(isDateInRange("2026-05-15T08:30:00.000Z", "2026-05-15", "2026-05-15")).toBe(true);
    });
});

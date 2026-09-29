import { describe, expect, it } from "vitest";
import {
    addCalendarDays,
    formatWIBDateTime,
    getWIBDayOfWeek,
    getWIBHoursMinutes,
    isValidCalendarDate,
    toUTCDateKey,
    toWIBDateString,
    toWIBISOString,
    wibDateTimeToDate,
} from "@/lib/timezone";
import { formatIndonesianDate, toDateDisplay, toDateString, toTimeString } from "@/lib/utils";

describe("WIB timezone helpers", () => {
    it("validates YYYY-MM-DD calendar dates strictly", () => {
        expect(isValidCalendarDate("2024-02-29")).toBe(true);
        expect(isValidCalendarDate("2026-02-29")).toBe(false);
        expect(isValidCalendarDate("2026-09-31")).toBe(false);
        expect(isValidCalendarDate("2026-9-01")).toBe(false);
        expect(isValidCalendarDate("0000-01-01")).toBe(false);
    });

    it("preserves the historical attendance date key at exact UTC midnight", () => {
        expect(toUTCDateKey("2026-09-18").toISOString()).toBe("2026-09-18T00:00:00.000Z");
        expect(() => toUTCDateKey("2026-02-29")).toThrow(RangeError);
    });

    it("adds date-only calendar days safely across month and leap-year boundaries", () => {
        expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
        expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
        expect(addCalendarDays("2024-02-29", 1)).toBe("2024-03-01");
        expect(() => addCalendarDays("2026-01-01", 0.5)).toThrow(RangeError);
    });

    it("converts WIB wall-clock values with an explicit +07:00 offset", () => {
        expect(wibDateTimeToDate("2026-09-18", "00:00").toISOString()).toBe("2026-09-17T17:00:00.000Z");
        expect(wibDateTimeToDate("2026-09-18", "23:59:59.123").toISOString()).toBe("2026-09-18T16:59:59.123Z");
        expect(toWIBISOString(new Date("2026-09-18T17:30:00.000Z"))).toBe("2026-09-19T00:30:00.000+07:00");
        expect(() => wibDateTimeToDate("2026-09-18", "24:00")).toThrow(RangeError);
    });

    it("derives WIB dates, weekdays, and midnight as hour zero", () => {
        const midnightWIB = new Date("2026-09-17T17:00:00.000Z");

        expect(toWIBDateString(midnightWIB)).toBe("2026-09-18");
        expect(getWIBDayOfWeek(midnightWIB)).toBe(5);
        expect(getWIBHoursMinutes(midnightWIB)).toEqual({ hours: 0, minutes: 0 });
    });

    it("formats dates and times in Asia/Jakarta independently of the host timezone", () => {
        const instant = new Date("2026-09-18T17:30:00.000Z");

        expect(toDateString(instant)).toBe("2026-09-19");
        expect(toDateDisplay(instant)).toBe("2026-09-19");
        expect(toTimeString(instant)).toBe("00:30");
        expect(formatIndonesianDate(instant)).toBe("Sabtu, 19 September 2026");
        expect(formatWIBDateTime(instant, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, "en-GB"))
            .toBe("00:30");
    });
});

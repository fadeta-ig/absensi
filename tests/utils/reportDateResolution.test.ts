import { describe, it, expect } from "vitest";

describe("Report Date Resolution & Matrix Headers", () => {
    function generateMatrixDates(startDateStr: string, endDateStr: string): string[] {
        const [sY, sM, sD] = startDateStr.split("-").map(Number);
        const [eY, eM, eD] = endDateStr.split("-").map(Number);
        const currCalendar = new Date(Date.UTC(sY, sM - 1, sD, 12, 0, 0));
        const endCalendar = new Date(Date.UTC(eY, eM - 1, eD, 12, 0, 0));

        const dateList: string[] = [];
        while (currCalendar <= endCalendar && dateList.length <= 31) {
            const y = currCalendar.getUTCFullYear();
            const m = String(currCalendar.getUTCMonth() + 1).padStart(2, "0");
            const d = String(currCalendar.getUTCDate()).padStart(2, "0");
            dateList.push(`${y}-${m}-${d}`);
            currCalendar.setUTCDate(currCalendar.getUTCDate() + 1);
        }
        return dateList;
    }

    it("generates exactly 2026-09-15 when filtering 2026-09-15 to 2026-09-15", () => {
        const dateList = generateMatrixDates("2026-09-15", "2026-09-15");
        expect(dateList).toEqual(["2026-09-15"]);

        const headers = dateList.map((d) => d.split("-").slice(1).join("-"));
        expect(headers).toEqual(["09-15"]);
    });

    it("does not shift back to previous day regardless of environment timezone", () => {
        const dateList = generateMatrixDates("2026-09-15", "2026-09-16");
        expect(dateList).toEqual(["2026-09-15", "2026-09-16"]);

        const headers = dateList.map((d) => d.split("-").slice(1).join("-"));
        expect(headers).toEqual(["09-15", "09-16"]);
    });

    it("handles month-boundary transitions smoothly", () => {
        const dateList = generateMatrixDates("2026-08-31", "2026-09-02");
        expect(dateList).toEqual(["2026-08-31", "2026-09-01", "2026-09-02"]);

        const headers = dateList.map((d) => d.split("-").slice(1).join("-"));
        expect(headers).toEqual(["08-31", "09-01", "09-02"]);
    });

    it("correctly identifies MM-DD headers as date columns", () => {
        const dateRegex = /^\d{2}-\d{2}$/;
        expect(dateRegex.test("09-15")).toBe(true);
        expect(dateRegex.test("08-31")).toBe(true);
        expect(dateRegex.test("Nama Karyawan")).toBe(false);
        expect(dateRegex.test("Departemen")).toBe(false);
        expect(dateRegex.test("Hadir")).toBe(false);
    });

    it("properly calculates leave overlapping condition", () => {
        // Filter range: 2026-09-15 to 2026-09-30
        const filterStart = new Date("2026-09-15T00:00:00+07:00");
        const filterEnd = new Date("2026-09-30T23:59:59.999+07:00");

        // Leave requested in August for 2026-09-10 to 2026-09-20 (overlaps!)
        const leave1Start = new Date("2026-09-10T00:00:00+07:00");
        const leave1End = new Date("2026-09-20T23:59:59+07:00");
        const isOverlapping1 = leave1Start <= filterEnd && leave1End >= filterStart;
        expect(isOverlapping1).toBe(true);

        // Leave in October (does not overlap)
        const leave2Start = new Date("2026-10-01T00:00:00+07:00");
        const leave2End = new Date("2026-10-05T23:59:59+07:00");
        const isOverlapping2 = leave2Start <= filterEnd && leave2End >= filterStart;
        expect(isOverlapping2).toBe(false);
    });
});

import { describe, expect, it } from "vitest";
import {
    assertMonthSignable,
    formatMonthWibId,
    formatWibDateShortId,
    getLastDateOfMonth,
    getMonthSignInfo,
} from "@/lib/services/cleaningApprovalService";
import { CleaningError } from "@/lib/services/cleaningService";

describe("Kunci TTD akhir bulan cleaning", () => {
    it("tanggal terakhir benar termasuk kabisat", () => {
        expect(getLastDateOfMonth("2026-10")).toBe("2026-10-31");
        expect(getLastDateOfMonth("2026-02")).toBe("2026-02-28");
        expect(getLastDateOfMonth("2024-02")).toBe("2024-02-29");
        expect(getLastDateOfMonth("2026-12")).toBe("2026-12-31");
    });

    it("format Indonesia konsisten", () => {
        expect(formatMonthWibId("2026-10")).toBe("Oktober 2026");
        expect(formatWibDateShortId("2026-10-31")).toBe("31 Okt 2026");
    });

    it("belum boleh sebelum tanggal terakhir (kedua peran sama)", () => {
        expect(getMonthSignInfo("2026-10", "2026-10-01").isSignable).toBe(false);
        expect(getMonthSignInfo("2026-10", "2026-10-30").isSignable).toBe(false);
        expect(() => assertMonthSignable("2026-10", "INSPECTED_BY", "2026-10-15")).toThrowError(CleaningError);
        expect(() => assertMonthSignable("2026-10", "KNOWN_BY", "2026-10-15")).toThrowError(CleaningError);
    });

    it("boleh tepat tanggal terakhir dan susulan bulan lalu", () => {
        expect(getMonthSignInfo("2026-10", "2026-10-31").isSignable).toBe(true);
        expect(getMonthSignInfo("2026-09", "2026-10-05").isSignable).toBe(true);
        expect(() => assertMonthSignable("2026-10", "INSPECTED_BY", "2026-10-31")).not.toThrow();
        expect(() => assertMonthSignable("2026-10", "KNOWN_BY", "2026-10-31")).not.toThrow();
    });

    it("bulan depan ditolak dengan pesan 422 konsisten", () => {
        try {
            assertMonthSignable("2026-11", "KNOWN_BY", "2026-10-05");
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(CleaningError);
            expect((err as CleaningError).statusCode).toBe(422);
            expect((err as Error).message).toContain("Mengetahui");
            expect((err as Error).message).toContain("November 2026");
            expect((err as Error).message).toContain("akhir bulan");
        }
    });
});

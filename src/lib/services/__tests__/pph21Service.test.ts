import { describe, it, expect } from "vitest";
import {
    calculateMonthlyPph21,
    findTerRate,
    getTerCategory,
    getPtkpAmount,
    isValidPtkpStatus,
} from "../pph21Service";

describe("pph21Service — PP 58/2023 & PMK 168/2023", () => {
    // ─── Utility Functions ───────────────────────────────────────
    describe("isValidPtkpStatus", () => {
        it("should accept valid PTKP statuses", () => {
            expect(isValidPtkpStatus("TK/0")).toBe(true);
            expect(isValidPtkpStatus("K/0")).toBe(true);
            expect(isValidPtkpStatus("K/3")).toBe(true);
        });

        it("should reject invalid statuses", () => {
            expect(isValidPtkpStatus("INVALID")).toBe(false);
            expect(isValidPtkpStatus("")).toBe(false);
        });
    });

    describe("getTerCategory", () => {
        it("should return category A for TK/0", () => {
            expect(getTerCategory("TK/0")).toBe("A");
        });

        it("should return category A for TK/1 and B for TK/2", () => {
            expect(getTerCategory("TK/1")).toBe("A"); // PP 58/2023: TK/1 → A
            expect(getTerCategory("TK/2")).toBe("B");
        });

        it("should return category B for K/2 and C for K/3", () => {
            expect(getTerCategory("K/2")).toBe("B"); // PP 58/2023: K/2 → B
            expect(getTerCategory("K/3")).toBe("C");
        });
    });

    describe("getPtkpAmount", () => {
        it("should return 54.000.000 for TK/0", () => {
            expect(getPtkpAmount("TK/0")).toBe(54_000_000);
        });

        it("should return amount with tanggungan increment for K/1", () => {
            expect(getPtkpAmount("K/1")).toBe(63_000_000);
        });
    });

    // ─── TER Rate Lookup ─────────────────────────────────────────
    describe("findTerRate", () => {
        it("should return 0 rate for very low income (category A)", () => {
            const rate = findTerRate(4_000_000, "A");
            expect(rate).toBe(0);
        });

        it("should return a positive rate for moderate income (category A)", () => {
            const rate = findTerRate(10_000_000, "A");
            expect(rate).toBeGreaterThan(0);
            expect(rate).toBeLessThan(1);
        });

        it("should return highest rate for very high income", () => {
            const rate = findTerRate(1_000_000_000, "A");
            expect(rate).toBeGreaterThan(0);
        });
    });

    // ─── Monthly Calculation ─────────────────────────────────────
    describe("calculateMonthlyPph21", () => {
        it("should calculate correct monthly PPh21 for typical salary", () => {
            const result = calculateMonthlyPph21({
                grossMonthlyIncome: 10_000_000,
                ptkpStatus: "TK/0",
                month: 1,
            });

            expect(result.grossMonthlyIncome).toBe(10_000_000);
            expect(result.ptkpStatus).toBe("TK/0");
            expect(result.terCategory).toBe("A");
            expect(result.terRate).toBeGreaterThanOrEqual(0);
            expect(result.pph21Monthly).toBeGreaterThanOrEqual(0);
            expect(result.isDecember).toBe(false);
        });

        it("should mark December correctly", () => {
            const result = calculateMonthlyPph21({
                grossMonthlyIncome: 10_000_000,
                ptkpStatus: "TK/0",
                month: 12,
            });

            expect(result.isDecember).toBe(true);
        });

        it("should return 0 tax for zero income", () => {
            const result = calculateMonthlyPph21({
                grossMonthlyIncome: 0,
                ptkpStatus: "TK/0",
                month: 1,
            });

            expect(result.pph21Monthly).toBe(0);
        });

        it("should use category C for K/3 status", () => {
            const result = calculateMonthlyPph21({
                grossMonthlyIncome: 15_000_000,
                ptkpStatus: "K/3",
                month: 3,
            });

            expect(result.terCategory).toBe("C");
        });

        it("pph21Monthly should equal round(gross × terRate)", () => {
            const gross = 12_500_000;
            const result = calculateMonthlyPph21({
                grossMonthlyIncome: gross,
                ptkpStatus: "TK/0",
                month: 6,
            });

            expect(result.pph21Monthly).toBe(Math.round(gross * result.terRate));
        });
    });
});

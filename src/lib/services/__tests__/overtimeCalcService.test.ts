import { describe, it, expect } from "vitest";
import {
    getHourlyRate,
    getMultipliers,
    calculateOvertimePay,
} from "../overtimeCalcService";

describe("overtimeCalcService — PP No. 35 Tahun 2021", () => {
    const MONTHLY_SALARY = 5_000_000; // Rp 5.000.000
    const HOURLY_RATE = Math.round(MONTHLY_SALARY / 173); // ~Rp 28.902

    // ─── Hourly Rate ─────────────────────────────────────────────
    describe("getHourlyRate", () => {
        it("should calculate 1/173 of monthly salary", () => {
            expect(getHourlyRate(MONTHLY_SALARY)).toBeCloseTo(MONTHLY_SALARY / 173, 0);
        });

        it("should return 0 for zero salary", () => {
            expect(getHourlyRate(0)).toBe(0);
        });

        it("should return 0 for negative salary", () => {
            expect(getHourlyRate(-100)).toBe(0);
        });
    });

    // ─── Workday Multipliers ─────────────────────────────────────
    describe("getMultipliers — Hari Kerja", () => {
        it("should return 1.5x for first hour", () => {
            const result = getMultipliers(1, false);
            expect(result).toEqual([1.5]);
        });

        it("should return 1.5x, 2x for 2 hours", () => {
            const result = getMultipliers(2, false);
            expect(result).toEqual([1.5, 2]);
        });

        it("should return 1.5x, 2x, 2x, 2x for 4 hours", () => {
            const result = getMultipliers(4, false);
            expect(result).toEqual([1.5, 2, 2, 2]);
        });
    });

    // ─── Holiday Multipliers (5-day week) ────────────────────────
    describe("getMultipliers — Hari Libur (5-day)", () => {
        it("should return 2x for hours 1-8", () => {
            const result = getMultipliers(8, true, 5);
            expect(result).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
        });

        it("should return 3x for hour 9", () => {
            const result = getMultipliers(9, true, 5);
            expect(result[8]).toBe(3);
        });

        it("should return 4x for hours 10+", () => {
            const result = getMultipliers(11, true, 5);
            expect(result[9]).toBe(4);
            expect(result[10]).toBe(4);
        });
    });

    // ─── Holiday Multipliers (6-day week) ────────────────────────
    describe("getMultipliers — Hari Libur (6-day)", () => {
        it("should return 2x for hours 1-7", () => {
            const result = getMultipliers(7, true, 6);
            expect(result).toEqual([2, 2, 2, 2, 2, 2, 2]);
        });

        it("should return 3x for hour 8", () => {
            const result = getMultipliers(8, true, 6);
            expect(result[7]).toBe(3);
        });

        it("should return 4x for hours 9+", () => {
            const result = getMultipliers(10, true, 6);
            expect(result[8]).toBe(4);
            expect(result[9]).toBe(4);
        });
    });

    // ─── Full Calculation ────────────────────────────────────────
    describe("calculateOvertimePay", () => {
        it("should return correct total for 2 workday hours", () => {
            const result = calculateOvertimePay({
                monthlySalary: MONTHLY_SALARY,
                hours: 2,
                isHoliday: false,
            });

            expect(result.hourlyRate).toBe(HOURLY_RATE);
            expect(result.breakdown).toHaveLength(2);
            expect(result.breakdown[0].multiplier).toBe(1.5);
            expect(result.breakdown[1].multiplier).toBe(2);
            // The service rounds per-hour, so total = sum of individually rounded amounts
            const expectedTotal = result.breakdown.reduce((sum, h) => sum + h.amount, 0);
            expect(result.totalPay).toBe(expectedTotal);
            // Verify it's in the expected ballpark (1.5x + 2x = 3.5x hourly)
            expect(result.totalPay).toBeCloseTo(3.5 * HOURLY_RATE, -1);
        });

        it("should return zero for zero hours", () => {
            const result = calculateOvertimePay({
                monthlySalary: MONTHLY_SALARY,
                hours: 0,
                isHoliday: false,
            });
            expect(result.totalPay).toBe(0);
            expect(result.breakdown).toHaveLength(0);
        });

        it("should return zero for zero salary", () => {
            const result = calculateOvertimePay({
                monthlySalary: 0,
                hours: 3,
                isHoliday: false,
            });
            expect(result.totalPay).toBe(0);
        });

        it("should calculate holiday overtime correctly (5-day)", () => {
            const result = calculateOvertimePay({
                monthlySalary: MONTHLY_SALARY,
                hours: 9,
                isHoliday: true,
                workDaySystem: 5,
            });

            // The service rounds per-hour individually
            const expectedTotal = result.breakdown.reduce((sum, h) => sum + h.amount, 0);
            expect(result.totalPay).toBe(expectedTotal);
            // Verify it's in the expected ballpark (8×2x + 1×3x = 19x hourly)
            expect(result.totalPay).toBeCloseTo(19 * HOURLY_RATE, -2);
        });

        it("should handle fractional hours (e.g. 1.5 hours workday)", () => {
            const result = calculateOvertimePay({
                monthlySalary: MONTHLY_SALARY,
                hours: 1.5,
                isHoliday: false,
            });

            // Hour 1 full (1.5x) + Hour 2 half (0.5 × 2x)
            expect(result.breakdown).toHaveLength(2);
            expect(result.breakdown[0].amount).toBe(Math.round(1.5 * HOURLY_RATE));
            expect(result.breakdown[1].amount).toBe(Math.round(2 * HOURLY_RATE * 0.5));
        });
    });
});

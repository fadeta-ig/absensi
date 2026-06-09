import { describe, it, expect } from "vitest";
import { 
    calculateBpjsKesehatan, 
    calculateBpjsKetenagakerjaan, 
    calculateAllBpjs,
    isValidJkkRiskLevel
} from "@/lib/services/bpjsService";
import { BPJS_KES_SALARY_CAP } from "@/lib/constants/bpjsConstants";

describe("BPJS Service", () => {
    describe("isValidJkkRiskLevel", () => {
        it("should return true for valid levels (1-5)", () => {
            expect(isValidJkkRiskLevel(1)).toBe(true);
            expect(isValidJkkRiskLevel(5)).toBe(true);
        });

        it("should return false for invalid levels", () => {
            expect(isValidJkkRiskLevel(0)).toBe(false);
            expect(isValidJkkRiskLevel(6)).toBe(false);
        });
    });

    describe("calculateBpjsKesehatan", () => {
        it("should correctly calculate without cap", () => {
            const result = calculateBpjsKesehatan(10_000_000);
            expect(result.baseSalary).toBe(10_000_000);
            expect(result.isCapped).toBe(false);
            // 4% company = 400,000
            expect(result.contribution.company).toBe(400_000);
            // 1% employee = 100,000
            expect(result.contribution.employee).toBe(100_000);
        });

        it("should correctly calculate with cap", () => {
            const result = calculateBpjsKesehatan(20_000_000);
            expect(result.baseSalary).toBe(BPJS_KES_SALARY_CAP);
            expect(result.isCapped).toBe(true);
            
            const expectedCompany = Math.round(BPJS_KES_SALARY_CAP * 0.04);
            const expectedEmployee = Math.round(BPJS_KES_SALARY_CAP * 0.01);
            
            expect(result.contribution.company).toBe(expectedCompany);
            expect(result.contribution.employee).toBe(expectedEmployee);
        });
    });

    describe("calculateBpjsKetenagakerjaan", () => {
        it("should correctly calculate JHT, JKK, JKM, JP", () => {
            // Gross: 10,000,000, Level 1 (0.24%)
            const result = calculateBpjsKetenagakerjaan(10_000_000, 1);
            
            // JHT: 3.7% company, 2% employee
            expect(result.jht.contribution.company).toBe(370_000);
            expect(result.jht.contribution.employee).toBe(200_000);

            // JKK Level 1: 0.24% company
            expect(result.jkk.contribution.company).toBe(24_000);
            expect(result.jkk.contribution.employee).toBe(0);

            // JKM: 0.3% company
            expect(result.jkm.contribution.company).toBe(30_000);
            expect(result.jkm.contribution.employee).toBe(0);

            // JP: 2% company, 1% employee (capped at JP_SALARY_CAP ~ 10,042,300, so 10,000,000 is NOT capped)
            expect(result.jp.contribution.company).toBe(200_000);
            expect(result.jp.contribution.employee).toBe(100_000);

            // Totals
            expect(result.totalCompany).toBe(370_000 + 24_000 + 30_000 + 200_000);
            expect(result.totalEmployee).toBe(200_000 + 100_000);
        });
    });

    describe("calculateAllBpjs", () => {
        it("should correctly aggregate Kesehatan and Ketenagakerjaan", () => {
            const input = { grossMonthlyIncome: 10_000_000, jkkRiskLevel: 1 as const };
            const result = calculateAllBpjs(input);
            
            const expectedCompanyKes = 400_000;
            const expectedEmployeeKes = 100_000;
            const expectedCompanyTk = 624_000; // 370k + 24k + 30k + 200k
            const expectedEmployeeTk = 300_000; // 200k + 100k
            
            expect(result.kesehatan.contribution.company).toBe(expectedCompanyKes);
            expect(result.kesehatan.contribution.employee).toBe(expectedEmployeeKes);
            
            expect(result.ketenagakerjaan.totalCompany).toBe(expectedCompanyTk);
            expect(result.ketenagakerjaan.totalEmployee).toBe(expectedEmployeeTk);
            
            expect(result.grandTotal.company).toBe(expectedCompanyKes + expectedCompanyTk);
            expect(result.grandTotal.employee).toBe(expectedEmployeeKes + expectedEmployeeTk);
            
            expect(result.takeHomePay).toBe(10_000_000 - (expectedEmployeeKes + expectedEmployeeTk));
        });
    });
});

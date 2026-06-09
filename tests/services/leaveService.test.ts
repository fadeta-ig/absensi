import { describe, it, expect } from "vitest";
import { calculateWorkingDays } from "@/lib/services/leaveService";

describe("Leave Service - calculateWorkingDays", () => {
    it("should correctly calculate working days without off days", () => {
        // Monday to Friday
        const startDate = new Date("2024-01-01T00:00:00Z"); // Monday
        const endDate = new Date("2024-01-05T00:00:00Z"); // Friday
        
        // Default off days: Sunday (0)
        const offDays = new Set([0]);
        
        const workingDays = calculateWorkingDays(startDate, endDate, offDays);
        expect(workingDays).toBe(5); // Mon, Tue, Wed, Thu, Fri
    });

    it("should skip off days (e.g. Saturday and Sunday)", () => {
        // Friday to Tuesday (5 days total)
        const startDate = new Date("2024-01-05T00:00:00Z"); // Friday
        const endDate = new Date("2024-01-09T00:00:00Z"); // Tuesday
        
        // Off days: Saturday (6) and Sunday (0)
        const offDays = new Set([0, 6]);
        
        const workingDays = calculateWorkingDays(startDate, endDate, offDays);
        expect(workingDays).toBe(3); // Fri, Mon, Tue
    });

    it("should handle same day leave", () => {
        const startDate = new Date("2024-01-03T00:00:00Z"); // Wednesday
        const endDate = new Date("2024-01-03T00:00:00Z"); // Wednesday
        
        const offDays = new Set([0]);
        
        const workingDays = calculateWorkingDays(startDate, endDate, offDays);
        expect(workingDays).toBe(1);
    });

    it("should return 0 if the only day is an off day", () => {
        const startDate = new Date("2024-01-07T00:00:00Z"); // Sunday
        const endDate = new Date("2024-01-07T00:00:00Z"); // Sunday
        
        const offDays = new Set([0]);
        
        const workingDays = calculateWorkingDays(startDate, endDate, offDays);
        expect(workingDays).toBe(0);
    });
});

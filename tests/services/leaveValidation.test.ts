import { describe, expect, it } from "vitest";
import { leaveRequestSchema, leaveUpdateSchema } from "@/lib/validations/validationSchemas";
import { validateLeaveDateRange } from "@/lib/services/leaveDateRange";

const baseRequest = {
    type: "annual" as const,
    reason: "Keperluan keluarga",
};

describe("leave calendar range validation", () => {
    it("accepts the exact inclusive 366-day boundary on create and update", () => {
        const dates = { startDate: "2024-01-01", endDate: "2024-12-31" };

        expect(validateLeaveDateRange(dates.startDate, dates.endDate)).toEqual({
            success: true,
            calendarDays: 366,
        });
        expect(leaveRequestSchema.safeParse({ ...baseRequest, ...dates }).success).toBe(true);
        expect(leaveUpdateSchema.safeParse({ id: "leave-1", ...dates }).success).toBe(true);
    });

    it("rejects an inclusive 367-day range on create and update", () => {
        const dates = { startDate: "2024-01-01", endDate: "2025-01-01" };

        expect(validateLeaveDateRange(dates.startDate, dates.endDate)).toEqual({
            success: false,
            field: "endDate",
            message: "Rentang cuti maksimal 366 hari kalender.",
        });
        const createResult = leaveRequestSchema.safeParse({ ...baseRequest, ...dates });
        const updateResult = leaveUpdateSchema.safeParse({ id: "leave-1", ...dates });

        expect(createResult.success).toBe(false);
        expect(updateResult.success).toBe(false);
        if (!createResult.success) {
            expect(createResult.error.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    path: ["endDate"],
                    message: "Rentang cuti maksimal 366 hari kalender.",
                }),
            ]));
        }
        if (!updateResult.success) {
            expect(updateResult.error.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    path: ["endDate"],
                    message: "Rentang cuti maksimal 366 hari kalender.",
                }),
            ]));
        }
    });
});

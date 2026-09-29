import { describe, expect, it } from "vitest";
import { shiftCreateSchema, shiftUpdateSchema } from "@/lib/validations/validationSchemas";

const validDays = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startTime: "08:00",
    endTime: "17:00",
    isOff: dayOfWeek === 0,
}));

describe("strict shift validation", () => {
    it("accepts exactly seven unique valid days", () => {
        expect(shiftCreateSchema.safeParse({ name: "Reguler", days: validDays }).success).toBe(true);
        expect(shiftUpdateSchema.safeParse({ id: "shift-1", days: validDays }).success).toBe(true);
    });

    it("rejects missing, duplicate, or invalid days", () => {
        expect(shiftCreateSchema.safeParse({ name: "Kurang", days: validDays.slice(0, 6) }).success).toBe(false);
        expect(shiftCreateSchema.safeParse({ name: "Duplikat", days: [...validDays.slice(0, 6), validDays[5]] }).success).toBe(false);
        expect(shiftCreateSchema.safeParse({ name: "Invalid", days: validDays.map((d, i) => i === 0 ? { ...d, dayOfWeek: 7 } : d) }).success).toBe(false);
    });

    it("rejects invalid times, equal working hours, and invalid tolerances", () => {
        expect(shiftCreateSchema.safeParse({ name: "Jam", days: validDays.map((d, i) => i === 1 ? { ...d, startTime: "25:99" } : d) }).success).toBe(false);
        expect(shiftCreateSchema.safeParse({ name: "Nol", days: validDays.map((d, i) => i === 1 ? { ...d, startTime: "08:00", endTime: "08:00", isOff: false } : d) }).success).toBe(false);
        expect(shiftCreateSchema.safeParse({ name: "Negatif", days: validDays, lateCheckIn: -1 }).success).toBe(false);
        expect(shiftUpdateSchema.safeParse({ id: "shift-1", lateCheckIn: 1.5 }).success).toBe(false);
    });
});

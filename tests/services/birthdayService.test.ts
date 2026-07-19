import { describe, expect, it } from "vitest";
import {
    groupBirthdaysByDay,
    normalizeBirthdayPayload,
    toEmployeeBirthday,
} from "@/lib/services/birthdayService";

describe("birthdayService", () => {
    it("serializes a birth date without timezone date shifting", () => {
        expect(toEmployeeBirthday(
            "EMP001",
            "Budi",
            new Date("2000-08-17T00:00:00.000Z"),
        )).toEqual({ employeeId: "EMP001", name: "Budi", month: 8, day: 17 });
    });

    it("validates, deduplicates, and sorts birthday API data", () => {
        expect(normalizeBirthdayPayload([
            { employeeId: "EMP002", name: " Citra ", month: 12, day: 25 },
            { employeeId: "EMP001", name: "Budi", month: 8, day: 17 },
            { employeeId: "EMP001", name: "Budi Baru", month: 8, day: 18 },
            { employeeId: "EMP003", name: "Tanggal Salah", month: 2, day: 30 },
            { employeeId: "", name: "Tanpa ID", month: 1, day: 1 },
        ])).toEqual([
            { employeeId: "EMP001", name: "Budi Baru", month: 8, day: 18 },
            { employeeId: "EMP002", name: "Citra", month: 12, day: 25 },
        ]);
    });

    it("groups birthdays as an annual event for the displayed month", () => {
        const birthdays = normalizeBirthdayPayload([
            { employeeId: "EMP001", name: "Budi", month: 8, day: 17 },
            { employeeId: "EMP002", name: "Citra", month: 8, day: 17 },
            { employeeId: "EMP003", name: "Dewi", month: 9, day: 1 },
        ]);

        expect(groupBirthdaysByDay(birthdays, 8).get(17)).toHaveLength(2);
        expect(groupBirthdaysByDay(birthdays, 8).has(1)).toBe(false);
    });
});

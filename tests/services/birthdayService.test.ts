import { describe, expect, it } from "vitest";
import {
    groupBirthdaysByDay,
    normalizeBirthdayPayload,
    toEmployeeBirthday,
    calculateBirthdayMetrics,
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

    describe("calculateBirthdayMetrics", () => {
        it("identifies H-0 (Today) correctly", () => {
            // Reference date: 2026-09-08 (today)
            const refDate = new Date("2026-09-08T03:00:00.000Z");
            // Employee born on Sept 8, 1995
            const birthDate = new Date("1995-09-08T00:00:00.000Z");

            const metrics = calculateBirthdayMetrics(birthDate, refDate);
            expect(metrics.isToday).toBe(true);
            expect(metrics.daysUntil).toBe(0);
            expect(metrics.milestone).toBe("H-0");
            expect(metrics.ageTurning).toBe(31);
            expect(metrics.birthDateFormatted).toBe("8 September");
            expect(metrics.weekCategory).toBe("week-2");
        });

        it("identifies H-7 milestone (within 7 days)", () => {
            const refDate = new Date("2026-09-08T03:00:00.000Z");
            // Birthday on Sept 15 (7 days later)
            const birthDate = new Date("1998-09-15T00:00:00.000Z");

            const metrics = calculateBirthdayMetrics(birthDate, refDate);
            expect(metrics.isToday).toBe(false);
            expect(metrics.daysUntil).toBe(7);
            expect(metrics.milestone).toBe("H-7");
            expect(metrics.weekCategory).toBe("next-weeks");
        });

        it("identifies H-14 milestone (8 to 14 days later)", () => {
            const refDate = new Date("2026-09-08T03:00:00.000Z");
            // Birthday on Sept 22 (14 days later)
            const birthDate = new Date("2000-09-22T00:00:00.000Z");

            const metrics = calculateBirthdayMetrics(birthDate, refDate);
            expect(metrics.daysUntil).toBe(14);
            expect(metrics.milestone).toBe("H-14");
            expect(metrics.weekCategory).toBe("next-weeks");
        });

        it("identifies H-30 milestone (15 to 30 days later)", () => {
            const refDate = new Date("2026-09-08T03:00:00.000Z");
            // Birthday on Oct 8 (30 days later)
            const birthDate = new Date("1992-10-08T00:00:00.000Z");

            const metrics = calculateBirthdayMetrics(birthDate, refDate);
            expect(metrics.daysUntil).toBe(30);
            expect(metrics.milestone).toBe("H-30");
            expect(metrics.weekCategory).toBe("week-2");
        });

        it("categorizes weeks properly (week-1: 1-7, week-2: 8-14, next-weeks: 15+)", () => {
            const refDate = new Date("2026-09-08T03:00:00.000Z");

            const day3 = calculateBirthdayMetrics(new Date("1990-09-03T00:00:00.000Z"), refDate);
            expect(day3.weekCategory).toBe("week-1");

            const day10 = calculateBirthdayMetrics(new Date("1990-09-10T00:00:00.000Z"), refDate);
            expect(day10.weekCategory).toBe("week-2");

            const day25 = calculateBirthdayMetrics(new Date("1990-09-25T00:00:00.000Z"), refDate);
            expect(day25.weekCategory).toBe("next-weeks");
        });

        it("handles year transition gracefully (e.g. December to January)", () => {
            // Reference date: Dec 28, 2026
            const refDate = new Date("2026-12-28T03:00:00.000Z");
            // Birthday on Jan 4, 1996
            const birthDate = new Date("1996-01-04T00:00:00.000Z");

            const metrics = calculateBirthdayMetrics(birthDate, refDate);
            // From Dec 28 to Jan 4 is 7 days
            expect(metrics.daysUntil).toBe(7);
            expect(metrics.milestone).toBe("H-7");
            expect(metrics.ageTurning).toBe(31); // In 2027 turns 31
            expect(metrics.weekCategory).toBe("week-1");
        });
    });

    describe("database operations", () => {
        it("retrieves birthday overview and verifies default statuses", async () => {
            const {
                getBirthdayOverview,
                getBirthdayPreparationStatuses,
                upsertEmployeeBirthdayPreparation,
                getBirthdayReminderSettings,
                updateBirthdayReminderSettings,
            } = await import("@/lib/services/birthdayService");

            // 1. Statuses should contain initial 3 statuses
            const statuses = await getBirthdayPreparationStatuses();
            expect(statuses.length).toBeGreaterThanOrEqual(3);
            const statusNames = statuses.map((s) => s.name);
            expect(statusNames).toContain("Kirim Ucapan");
            expect(statusNames).toContain("Kue Dipesan");
            expect(statusNames).toContain("Selesai");

            // 2. Overview should return structured data
            const overview = await getBirthdayOverview();
            expect(overview).toHaveProperty("currentMonth");
            expect(overview).toHaveProperty("upcoming");
            expect(overview).toHaveProperty("summary");
            expect(overview.summary.totalEmployeesWithBirthDate).toBeGreaterThan(0);

            // 3. Upsert preparation
            const targetEmp = overview.allEmployees[0];
            const kueStatus = statuses.find((s) => s.name === "Kue Dipesan")!;
            const updatedPrep = await upsertEmployeeBirthdayPreparation(
                targetEmp.employeeId,
                overview.selectedYear,
                kueStatus.id,
                "Catatan test kue ulang tahun",
                "Unit Test HR"
            );
            expect(updatedPrep.statusId).toBe(kueStatus.id);
            expect(updatedPrep.notes).toBe("Catatan test kue ulang tahun");

            // 4. Settings update
            const updatedSettings = await updateBirthdayReminderSettings({
                isEmailEnabled: true,
                recipientEmails: "test-hr@wig.co.id, manager@wig.co.id",
                reminderDays: "30,14,7",
            }, "Unit Test HR");
            expect(updatedSettings.isEmailEnabled).toBe(true);
            expect(updatedSettings.recipientEmails).toBe("test-hr@wig.co.id, manager@wig.co.id");

            const retrievedSettings = await getBirthdayReminderSettings();
            expect(retrievedSettings?.isEmailEnabled).toBe(true);
        });
    });
});



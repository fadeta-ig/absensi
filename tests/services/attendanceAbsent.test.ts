import { describe, it, expect } from "vitest";
import { resolveAbsentEmployees } from "@/lib/services/attendanceAbsentResolver";
import type { Employee, LeaveRecordLite, WorkShiftInfo } from "@/app/dashboard/attendance/types";

describe("Attendance Absent Employee Resolution Logic", () => {
    const mockEmployees: Employee[] = [
        { id: "1", employeeId: "EMP001", name: "Budi Santoso", department: "IT", division: "Technology", position: "Software Engineer", phone: "08123456789", isActive: true },
        { id: "2", employeeId: "EMP002", name: "Siti Aminah", department: "HR", division: "Operations", position: "HR Specialist", phone: "08234567890", isActive: true },
        { id: "3", employeeId: "EMP003", name: "Dewi Lestari", department: "Finance", division: "Operations", position: "Accountant", phone: null, isActive: true },
        { id: "4", employeeId: "EMP004", name: "Ahmad Nonaktif", department: "IT", division: "Technology", position: "Intern", isActive: false },
    ];

    const standardDefaultShift: WorkShiftInfo = {
        id: "shift-reguler",
        name: "Shift Reguler",
        isDefault: true,
        days: [
            { dayOfWeek: 0, startTime: "08:00", endTime: "17:00", isOff: true }, // Minggu
            { dayOfWeek: 1, startTime: "08:00", endTime: "17:00", isOff: false }, // Senin
            { dayOfWeek: 2, startTime: "08:00", endTime: "17:00", isOff: false }, // Selasa
            { dayOfWeek: 3, startTime: "08:00", endTime: "17:00", isOff: false }, // Rabu
            { dayOfWeek: 4, startTime: "08:00", endTime: "17:00", isOff: false }, // Kamis
            { dayOfWeek: 5, startTime: "08:00", endTime: "17:00", isOff: false }, // Jumat
            { dayOfWeek: 6, startTime: "08:00", endTime: "13:00", isOff: false }, // Sabtu
        ],
    };

    it("should filter out inactive employees from absent calculation", () => {
        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18",
            employees: mockEmployees,
            records: [],
            leaves: [],
        });
        const empIds = result.map((e) => e.employeeId);
        expect(empIds).not.toContain("EMP004");
        expect(result.length).toBe(3);
    });

    it("should exclude employees who have already clocked in on targetDate", () => {
        const mockRecords = [{ employeeId: "EMP001", date: "2026-09-18" }];
        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18",
            employees: mockEmployees,
            records: mockRecords,
            leaves: [],
        });
        const empIds = result.map((e) => e.employeeId);
        expect(empIds).not.toContain("EMP001");
        expect(empIds).toContain("EMP002");
        expect(empIds).toContain("EMP003");
        expect(result.length).toBe(2);
    });

    it("should correctly classify employees on approved leave as on_leave with proper label and notes", () => {
        const mockLeaves: LeaveRecordLite[] = [
            {
                id: "leave-1",
                employeeId: "EMP002",
                type: "annual",
                startDate: "2026-09-17",
                endDate: "2026-09-19",
                reason: "Liburan Keluarga",
                status: "approved",
            },
        ];

        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18", // Jumat
            employees: mockEmployees,
            records: [],
            leaves: mockLeaves,
            shifts: [standardDefaultShift],
        });
        const emp2 = result.find((e) => e.employeeId === "EMP002");
        expect(emp2).toBeDefined();
        expect(emp2?.statusType).toBe("on_leave");
        expect(emp2?.statusLabel).toBe("Cuti Tahunan");
        expect(emp2?.notes).toBe("Liburan Keluarga");

        const emp1 = result.find((e) => e.employeeId === "EMP001");
        expect(emp1?.statusType).toBe("unpresent");
        expect(emp1?.statusLabel).toBe("Belum Hadir");
    });

    it("should not consider rejected leaves as on_leave", () => {
        const status = "rejected";
        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18",
            employees: mockEmployees,
            records: [],
            leaves: [{
                id: `leave-${status}`,
                employeeId: "EMP003",
                type: "sick",
                startDate: "2026-09-18",
                endDate: "2026-09-18",
                reason: "Demam",
                status,
            }],
            shifts: [standardDefaultShift],
        });
        const emp3 = result.find((e) => e.employeeId === "EMP003");
        expect(emp3?.statusType).toBe("unpresent");
        expect(emp3?.statusLabel).toBe("Belum Hadir");
    });

    it("should mark employees as off_day ('Libur Shift') on Sunday (2026-09-20) when shift isOff is true", () => {
        const result = resolveAbsentEmployees({
            targetDate: "2026-09-20", // Minggu
            employees: mockEmployees,
            records: [],
            leaves: [],
            shifts: [standardDefaultShift],
        });

        expect(result.length).toBe(3);
        for (const emp of result) {
            expect(emp.statusType).toBe("off_day");
            expect(emp.statusLabel).toBe("Libur Shift");
        }
    });

    it("should identify national holidays as off_day with holiday name", () => {
        const holidays = [{ date: "2026-08-17", name: "Hari Kemerdekaan RI" }];
        const result = resolveAbsentEmployees({
            targetDate: "2026-08-17",
            employees: mockEmployees,
            records: [],
            leaves: [],
            shifts: [standardDefaultShift],
            holidays,
        });

        const emp1 = result.find((e) => e.employeeId === "EMP001");
        expect(emp1?.statusType).toBe("off_day");
        expect(emp1?.statusLabel).toContain("Hari Kemerdekaan RI");
    });

    it("should keep approved leave ahead of a national holiday", () => {
        const result = resolveAbsentEmployees({
            targetDate: "2026-08-17",
            employees: mockEmployees,
            records: [],
            leaves: [{
                id: "leave-holiday",
                employeeId: "EMP001",
                type: "annual",
                startDate: "2026-08-17",
                endDate: "2026-08-17",
                reason: "Cuti yang sudah disetujui",
                status: "approved",
            }],
            holidays: [{ date: "2026-08-17", name: "Hari Kemerdekaan RI" }],
        });

        const emp1 = result.find((emp) => emp.employeeId === "EMP001");
        expect(emp1?.statusType).toBe("on_leave");
        expect(emp1?.statusLabel).toBe("Cuti Tahunan");
    });

    it("should not mark an employee absent while an overnight H-1 shift is active", () => {
        const overnightShift: WorkShiftInfo = {
            id: "shift-overnight",
            name: "Shift Malam",
            isDefault: true,
            days: [
                { dayOfWeek: 4, startTime: "23:00", endTime: "07:00", isOff: false }, // Thursday -> Friday
                { dayOfWeek: 5, startTime: "23:00", endTime: "07:00", isOff: false },
            ],
        };

        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18", // Friday, 02:00 WIB
            employees: [mockEmployees[0]],
            records: [{
                employeeId: "EMP001",
                date: "2026-09-17",
                clockIn: "2026-09-17T16:00:00.000Z", // 23:00 WIB
                clockOut: null,
            }],
            leaves: [],
            shifts: [overnightShift],
            now: new Date("2026-09-17T19:00:00.000Z"), // 02:00 WIB on H
        });

        expect(result).toHaveLength(0);
    });

    it("uses the H-1 roster at a rotation boundary for an active overnight shift", () => {
        const dayShift: WorkShiftInfo = {
            id: "shift-day",
            name: "Shift Dini Hari",
            isDefault: true,
            days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                dayOfWeek,
                startTime: "00:00",
                endTime: "08:00",
                isOff: false,
            })),
        };
        const nightShift: WorkShiftInfo = {
            id: "shift-night-before-rotation",
            name: "Shift Malam Sebelum Rotasi",
            isDefault: false,
            days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                dayOfWeek,
                startTime: "23:00",
                endTime: "07:00",
                isOff: false,
            })),
        };

        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18",
            employees: [{ ...mockEmployees[0], shiftId: "shift-day" }],
            records: [{
                employeeId: "EMP001",
                date: "2026-09-17",
                clockIn: "2026-09-17T16:00:00.000Z",
                clockOut: null,
            }],
            leaves: [],
            shifts: [dayShift, nightShift],
            now: new Date("2026-09-17T19:00:00.000Z"), // 02:00 WIB on targetDate
            targetDateShiftOverrides: { EMP001: "shift-day" },
            previousDateShiftOverrides: { EMP001: "shift-night-before-rotation" },
        });

        expect(result).toEqual([]);
    });

    it("should not mark a night-shift employee absent before today's clock-in window", () => {
        const overnightShift: WorkShiftInfo = {
            id: "shift-night-today",
            name: "Shift Malam",
            isDefault: true,
            earlyCheckIn: 30,
            days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                dayOfWeek,
                startTime: "23:00",
                endTime: "07:00",
                isOff: false,
            })),
        };

        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18",
            employees: [mockEmployees[0]],
            records: [],
            leaves: [],
            shifts: [overnightShift],
            now: new Date("2026-09-18T03:00:00.000Z"), // 10:00 WIB
        });

        expect(result).toEqual([]);
    });

    it("should respect custom shift assignments for specific employees", () => {
        const customShift: WorkShiftInfo = {
            id: "shift-weekend",
            name: "Shift Weekend Duty",
            isDefault: false,
            days: [
                { dayOfWeek: 0, startTime: "08:00", endTime: "16:00", isOff: false }, // Masuk di hari Minggu
                { dayOfWeek: 1, startTime: "08:00", endTime: "16:00", isOff: true },  // Libur di hari Senin
            ],
        };

        const employeesWithCustomShift: Employee[] = [
            { ...mockEmployees[0], shiftId: "shift-weekend" }, // Budi masuk Minggu
            { ...mockEmployees[1] }, // Siti pakai default (Minggu libur)
        ];

        const result = resolveAbsentEmployees({
            targetDate: "2026-09-20", // Minggu
            employees: employeesWithCustomShift,
            records: [],
            leaves: [],
            shifts: [standardDefaultShift, customShift],
        });

        const budi = result.find((e) => e.employeeId === "EMP001");
        const siti = result.find((e) => e.employeeId === "EMP002");

        // Budi assigned to shift-weekend where Sunday is NOT off -> should be unpresent (Alpa)
        expect(budi?.statusType).toBe("unpresent");
        expect(budi?.statusLabel).toBe("Belum Hadir");

        // Siti relies on default shift where Sunday is off -> should be off_day (Libur Shift)
        expect(siti?.statusType).toBe("off_day");
        expect(siti?.statusLabel).toBe("Libur Shift");
    });

    it("should return an empty list instead of throwing for an empty/invalid target date", () => {
        for (const targetDate of ["", "not-a-date", "2026-13-40"]) {
            expect(resolveAbsentEmployees({
                targetDate,
                employees: mockEmployees,
                records: [],
                leaves: [],
                shifts: [standardDefaultShift],
            })).toEqual([]);
        }
    });

    it("should flag pending leave as waiting approval instead of alpa", () => {
        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18",
            employees: mockEmployees,
            records: [],
            leaves: [{
                id: "leave-pending",
                employeeId: "EMP002",
                type: "sick",
                startDate: "2026-09-18",
                endDate: "2026-09-18",
                reason: "Demam",
                status: "pending",
            }],
            shifts: [standardDefaultShift],
        });

        const emp2 = result.find((e) => e.employeeId === "EMP002");
        expect(emp2?.statusType).toBe("pending_leave");
        expect(emp2?.statusLabel).toBe("Menunggu Persetujuan");
        expect(emp2?.notes).toContain("menunggu persetujuan HR");
        expect(result.filter((e) => e.statusType === "unpresent").map((e) => e.employeeId))
            .not.toContain("EMP002");
    });

    it("should prefer approved leave over a pending one on the same date", () => {
        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18",
            employees: mockEmployees,
            records: [],
            leaves: [
                {
                    id: "leave-pending",
                    employeeId: "EMP002",
                    type: "sick",
                    startDate: "2026-09-18",
                    endDate: "2026-09-18",
                    reason: "Demam",
                    status: "pending",
                },
                {
                    id: "leave-approved",
                    employeeId: "EMP002",
                    type: "annual",
                    startDate: "2026-09-18",
                    endDate: "2026-09-18",
                    reason: "Liburan",
                    status: "approved",
                },
            ],
            shifts: [standardDefaultShift],
        });

        expect(result.find((e) => e.employeeId === "EMP002")?.statusType).toBe("on_leave");
    });
});

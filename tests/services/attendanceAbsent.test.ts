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

    it("should not consider pending or rejected leaves as on_leave", () => {
        const mockLeaves: LeaveRecordLite[] = [
            {
                id: "leave-2",
                employeeId: "EMP003",
                type: "sick",
                startDate: "2026-09-18",
                endDate: "2026-09-18",
                reason: "Demam",
                status: "pending",
            },
        ];

        const result = resolveAbsentEmployees({
            targetDate: "2026-09-18",
            employees: mockEmployees,
            records: [],
            leaves: mockLeaves,
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
});

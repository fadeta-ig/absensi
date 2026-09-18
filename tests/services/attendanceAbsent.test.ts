import { describe, it, expect } from "vitest";
import { AbsentEmployee, AbsentStatusType, Employee, AttendanceRecord, LeaveRecordLite } from "@/app/dashboard/attendance/types";

/**
 * Pure function helper to resolve unpresent employees from active employee pool,
 * attendance records, and approved leaves for a target evaluation date.
 */
export function resolveAbsentEmployees(
    targetDate: string,
    employees: Employee[],
    records: Pick<AttendanceRecord, "employeeId" | "date">[],
    leaves: LeaveRecordLite[]
): AbsentEmployee[] {
    const recordsOnDate = records.filter(r => r.date === targetDate);
    const attendedIds = new Set(recordsOnDate.map(r => r.employeeId));
    const activeEmployees = employees.filter(e => e.isActive !== false);

    return activeEmployees
        .filter(e => !attendedIds.has(e.employeeId))
        .map(emp => {
            const activeLeave = leaves.find(l => {
                if (l.employeeId !== emp.employeeId || l.status !== "approved") return false;
                const startStr = typeof l.startDate === "string" ? l.startDate.slice(0, 10) : "";
                const endStr = typeof l.endDate === "string" ? l.endDate.slice(0, 10) : "";
                return targetDate >= startStr && targetDate <= endStr;
            });

            let statusType: AbsentStatusType = "unpresent";
            let statusLabel = "Belum Hadir";
            let notes: string | null = null;

            if (activeLeave) {
                statusType = "on_leave";
                const typeMap: Record<string, string> = {
                    annual: "Cuti Tahunan",
                    sick: "Izin Sakit",
                    personal: "Izin Pribadi",
                    maternity: "Cuti Melahirkan",
                };
                statusLabel = typeMap[activeLeave.type] || `Cuti (${activeLeave.type})`;
                notes = activeLeave.reason || null;
            }

            return {
                employeeId: emp.employeeId,
                name: emp.name,
                department: emp.department || "-",
                division: emp.division || "-",
                position: emp.position || "-",
                phone: emp.phone || null,
                email: emp.email || null,
                statusType,
                statusLabel,
                notes,
            };
        });
}

describe("Attendance Absent Employee Resolution Logic", () => {
    const mockEmployees: Employee[] = [
        { id: "1", employeeId: "EMP001", name: "Budi Santoso", department: "IT", division: "Technology", position: "Software Engineer", phone: "08123456789", isActive: true },
        { id: "2", employeeId: "EMP002", name: "Siti Aminah", department: "HR", division: "Operations", position: "HR Specialist", phone: "08234567890", isActive: true },
        { id: "3", employeeId: "EMP003", name: "Dewi Lestari", department: "Finance", division: "Operations", position: "Accountant", phone: null, isActive: true },
        { id: "4", employeeId: "EMP004", name: "Ahmad Nonaktif", department: "IT", division: "Technology", position: "Intern", isActive: false },
    ];

    it("should filter out inactive employees from absent calculation", () => {
        const result = resolveAbsentEmployees("2026-09-18", mockEmployees, [], []);
        const empIds = result.map(e => e.employeeId);
        expect(empIds).not.toContain("EMP004");
        expect(result.length).toBe(3);
    });

    it("should exclude employees who have already clocked in on targetDate", () => {
        const mockRecords = [
            { employeeId: "EMP001", date: "2026-09-18" },
        ];
        const result = resolveAbsentEmployees("2026-09-18", mockEmployees, mockRecords, []);
        const empIds = result.map(e => e.employeeId);
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

        const result = resolveAbsentEmployees("2026-09-18", mockEmployees, [], mockLeaves);
        const emp2 = result.find(e => e.employeeId === "EMP002");
        expect(emp2).toBeDefined();
        expect(emp2?.statusType).toBe("on_leave");
        expect(emp2?.statusLabel).toBe("Cuti Tahunan");
        expect(emp2?.notes).toBe("Liburan Keluarga");

        const emp1 = result.find(e => e.employeeId === "EMP001");
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

        const result = resolveAbsentEmployees("2026-09-18", mockEmployees, [], mockLeaves);
        const emp3 = result.find(e => e.employeeId === "EMP003");
        expect(emp3?.statusType).toBe("unpresent");
        expect(emp3?.statusLabel).toBe("Belum Hadir");
    });
});

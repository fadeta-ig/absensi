import { getWIBDayOfWeek } from "@/lib/timezone";
import type {
    AbsentEmployee,
    AbsentStatusType,
    Employee,
    AttendanceRecord,
    LeaveRecordLite,
    WorkShiftInfo,
} from "@/app/dashboard/attendance/types";

export interface HolidayItem {
    date: string;
    name: string;
}

export interface ResolveAbsentParams {
    targetDate: string;
    employees: Employee[];
    records: Pick<AttendanceRecord, "employeeId" | "date">[];
    leaves: LeaveRecordLite[];
    shifts?: WorkShiftInfo[];
    holidays?: HolidayItem[];
}

const LEAVE_TYPE_MAP: Record<string, string> = {
    annual: "Cuti Tahunan",
    sick: "Izin Sakit",
    personal: "Izin Pribadi",
    maternity: "Cuti Melahirkan",
};

/**
 * Resolves absent employee list with precise categorization:
 * 1. on_leave: Has approved leave for targetDate.
 * 2. off_day: Day off per employee's assigned or default shift schedule, or official national holiday.
 * 3. unpresent: Scheduled to work but has not clocked in (True Alpa/Belum Hadir).
 */
export function resolveAbsentEmployees({
    targetDate,
    employees,
    records,
    leaves,
    shifts = [],
    holidays = [],
}: ResolveAbsentParams): AbsentEmployee[] {
    const recordsOnDate = records.filter((r) => r.date === targetDate);
    const attendedIds = new Set(recordsOnDate.map((r) => r.employeeId));
    const activeEmployees = employees.filter((e) => e.isActive !== false);

    // Resolve Day of Week in WIB (0=Sun .. 6=Sat) safely
    const [y, m, d] = targetDate.split("-").map(Number);
    const targetDateObj = new Date(Date.UTC(y, m - 1, d, 5, 0, 0)); // 05:00 UTC = 12:00 WIB
    const targetDayOfWeek = getWIBDayOfWeek(targetDateObj);

    // Check national holiday
    const holidayMatch = holidays.find((h) => h.date === targetDate);

    return activeEmployees
        .filter((e) => !attendedIds.has(e.employeeId))
        .map((emp) => {
            // 1. Check approved leave
            const activeLeave = leaves.find((l) => {
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
                statusLabel = LEAVE_TYPE_MAP[activeLeave.type] || `Cuti (${activeLeave.type})`;
                notes = activeLeave.reason || null;
            } else {
                // 2. Resolve shift (assigned or default fallback)
                const empShift =
                    (emp.shiftId ? shifts.find((s) => s.id === emp.shiftId) : null) ??
                    shifts.find((s) => s.isDefault) ??
                    null;

                const scheduleDay = empShift?.days.find((sd) => sd.dayOfWeek === targetDayOfWeek) ?? null;
                const isShiftOff = scheduleDay ? scheduleDay.isOff : targetDayOfWeek === 0;

                if (holidayMatch) {
                    statusType = "off_day";
                    statusLabel = `Libur Nasional (${holidayMatch.name})`;
                    notes = `Hari Libur Nasional: ${holidayMatch.name}`;
                } else if (isShiftOff) {
                    statusType = "off_day";
                    statusLabel = "Libur Shift";
                    notes = scheduleDay
                        ? `Jadwal Libur Shift: ${empShift?.name || "Reguler"}`
                        : "Hari Libur Rutin Mingguan";
                } else {
                    statusType = "unpresent";
                    statusLabel = "Belum Hadir";
                    notes = scheduleDay ? `Shift: ${scheduleDay.startTime} - ${scheduleDay.endTime}` : null;
                }
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

import { prisma } from "../prisma";
import { Employee, AttendanceRecord, VisitReport, LeaveRequest, PayslipRecord } from "@/types";
import { AssetWithHistory } from "../types/asset";
import { calculateWorkingDays } from "./leaveService";
import { toDateString, toISOOrNull } from "@/lib/utils";
import type {
    AttendanceRecord as DbAttendanceRecord,
    LeaveRequest as DbLeaveRequest,
    VisitReport as DbVisitReport,
    Prisma,
} from "@prisma/client";

// --- Internal Mappers ---
type Employee360Row = Prisma.EmployeeGetPayload<{
    include: {
        locations: true;
        payrollComponents: { include: { component: true } };
        manager: true;
        departmentRel: true;
        divisionRel: true;
        positionRel: true;
    };
}>;

type PayslipWithItems = Prisma.PayslipRecordGetPayload<{ include: { items: true } }>;
type AssetWithCategory = Prisma.AssetGetPayload<{ include: { categoryRel: true } }>;

function parseJson<T>(value: string | null): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function mapEmployee(row: Employee360Row): Employee {
    return {
        ...row,
        gender: row.gender as Employee["gender"],
        employmentType: row.employmentType as Employee["employmentType"],
        joinDate: toDateString(row.joinDate),
        employmentStartDate: row.employmentStartDate ? toDateString(row.employmentStartDate) : null,
        employmentEndDate: row.employmentEndDate ? toDateString(row.employmentEndDate) : null,
        probationEndDate: row.probationEndDate ? toDateString(row.probationEndDate) : null,
        statusChangedAt: toISOOrNull(row.statusChangedAt),
        faceDescriptor: parseJson<number[]>(row.faceDescriptor) ?? undefined,
        manager: row.manager ? {
            id: row.manager.id,
            employeeId: row.manager.employeeId,
            name: row.manager.name,
        } : undefined,
        locations: row.locations.map((location) => ({ id: location.id, name: location.name })),
        payrollComponents: row.payrollComponents.map((payroll) => ({
            ...payroll,
            component: {
                ...payroll.component,
                type: payroll.component.type as "earning" | "deduction",
            },
        })),
    };
}
function mapAttendance(row: DbAttendanceRecord): AttendanceRecord {
    return {
        ...row,
        date: toDateString(row.date),
        clockIn: toISOOrNull(row.clockIn),
        clockOut: toISOOrNull(row.clockOut),
        clockInLocation: parseJson<{ lat: number; lng: number }>(row.clockInLocation),
        clockOutLocation: parseJson<{ lat: number; lng: number }>(row.clockOutLocation),
        status: row.status as AttendanceRecord["status"],
    };
}
function mapVisit(row: DbVisitReport): VisitReport {
    return {
        ...row,
        date: toDateString(row.date),
        clockInTime: toISOOrNull(row.clockInTime),
        clockOutTime: toISOOrNull(row.clockOutTime),
        visitLocation: parseJson<{ lat: number; lng: number }>(row.visitLocation),
        clockInLocation: parseJson<{ lat: number; lng: number }>(row.clockInLocation),
        clockOutLocation: parseJson<{ lat: number; lng: number }>(row.clockOutLocation),
        clockInPhotos: parseJson<string[]>(row.clockInPhotos),
        clockOutPhotos: parseJson<string[]>(row.clockOutPhotos),
        status: row.status as VisitReport["status"],
        createdAt: toISOOrNull(row.createdAt)!,
    };
}
function mapLeave(row: DbLeaveRequest): LeaveRequest {
    return {
        ...row,
        type: row.type as LeaveRequest["type"],
        status: row.status as LeaveRequest["status"],
        startDate: toDateString(row.startDate),
        endDate: toDateString(row.endDate),
        createdAt: toISOOrNull(row.createdAt)!,
    };
}
function mapPayslip(row: PayslipWithItems): PayslipRecord {
    return {
        ...row,
        issuedDate: toISOOrNull(row.issuedDate)!,
    };
}
function mapAsset(row: AssetWithCategory): AssetWithHistory {
    return {
        ...row,
        category: row.categoryRel ? { ...row.categoryRel, createdAt: toISOOrNull(row.categoryRel.createdAt)! } : undefined,
        purchaseDate: toDateString(row.purchaseDate),
        warrantyExpiry: toDateString(row.warrantyExpiry),
        assignedAt: toISOOrNull(row.assignedAt),
        createdAt: toISOOrNull(row.createdAt)!,
        updatedAt: toISOOrNull(row.updatedAt)!,
        assignedEmployee: null,
    };
}

export type Employee360Data = {
    employee: Employee;
    stats: {
        attendanceRate: number;
        lateCount: number;
        visitCount: number;
        leaveUsed: number;
        leaveRemaining: number;
    };
    recentAttendance: AttendanceRecord[];
    recentVisits: VisitReport[];
    recentLeaves: LeaveRequest[];
    recentPayslips: PayslipRecord[];
    assignedAssets: AssetWithHistory[];
};

/**
 * Ambil semua data analitik 360° untuk satu karyawan.
 *
 * PENTING: Fungsi ini adalah READ-ONLY. Tidak ada operasi write/update di sini.
 * Sinkronisasi usedLeave dilakukan oleh leaveService.updateLeaveRequest()
 * setiap kali status cuti berubah (approved/rejected), bukan di sini.
 */
export async function getEmployee360Data(id: string): Promise<Employee360Data | null> {
    if (!id) return null;

    const employee = await prisma.employee.findUnique({
        where: { id },
        include: {
            locations: true,
            payrollComponents: { include: { component: true } },
            manager: true,
            departmentRel: true,
            divisionRel: true,
            positionRel: true,
        },
    });

    if (!employee) return null;

    // Query utama dijalankan paralel
    const [attendance, visits, leaves, payslips, approvedLeaves, assignedAssetsData] = await Promise.all([
        prisma.attendanceRecord.findMany({
            where: { employeeId: employee.employeeId },
            orderBy: { date: "desc" },
            take: 10,
        }),
        prisma.visitReport.findMany({
            where: { employeeId: employee.employeeId },
            orderBy: { date: "desc" },
            take: 5,
        }),
        prisma.leaveRequest.findMany({
            where: { employeeId: employee.employeeId },
            orderBy: { startDate: "desc" },
            take: 5,
        }),
        prisma.payslipRecord.findMany({
            where: { employeeId: employee.employeeId },
            include: { items: true },
            orderBy: { period: "desc" },
            take: 3,
        }),
        // Ambil semua leave approved untuk hitung usedLeave aktual
        prisma.leaveRequest.findMany({
            where: { employeeId: employee.employeeId, status: "approved" },
            select: { startDate: true, endDate: true },
        }),
        // Ambil aset yang saat ini dipegang oleh karyawan
        prisma.asset.findMany({
            where: { assignedToId: employee.employeeId },
            include: { categoryRel: true },
            orderBy: { createdAt: "desc" },
        }),
    ]);

    // groupBy dipisah agar TypeScript dapat infer tipe dengan benar
    // (Prisma groupBy menghasilkan tipe literal yang tidak kompatibel dalam Promise.all heterogen besar)
    const attendanceCounts = await prisma.attendanceRecord.groupBy({
        by: ["status"],
        where: { employeeId: employee.employeeId },
        _count: { status: true },
    });

    // Parse attendance stats dari hasil groupBy — beri tipe eksplisit pada r
    type GroupByRow = { status: string; _count: { status: number } };
    const statsMap = Object.fromEntries(
        (attendanceCounts as GroupByRow[]).map((r) => [r.status, r._count.status] as [string, number])
    );
    const totalDays = Object.values(statsMap).reduce((a, b) => a + b, 0);
    const presentDays = statsMap["present"] ?? 0;
    const lateDays = statsMap["late"] ?? 0;
    const totalVisits = await prisma.visitReport.count({
        where: { employeeId: employee.employeeId },
    });

    const attendanceRate = totalDays > 0 ? ((presentDays + lateDays) / totalDays) * 100 : 0;

    // Hitung usedLeave dari data aktual — TIDAK mengupdate DB
    // Resolve shift offDays for accurate calculation
    const offDays = new Set<number>([0]); // default: Minggu
    if (employee.shiftId) {
        const shift = await prisma.workShift.findUnique({
            where: { id: employee.shiftId },
            include: { days: true },
        });
        if (shift) {
            offDays.clear();
            for (const d of shift.days) {
                if (d.isOff) offDays.add(d.dayOfWeek);
            }
        }
    }
    const realUsedLeave = approvedLeaves.reduce(
        (sum, l) => sum + calculateWorkingDays(l.startDate, l.endDate, offDays), 0
    );

    return {
        employee: mapEmployee(employee),
        stats: {
            attendanceRate,
            lateCount: lateDays,
            visitCount: totalVisits,
            leaveUsed: realUsedLeave,
            leaveRemaining: Math.max(0, employee.totalLeave - realUsedLeave),
        },
        recentAttendance: attendance.map(mapAttendance),
        recentVisits: visits.map(mapVisit),
        recentLeaves: leaves.map(mapLeave),
        recentPayslips: payslips.map(mapPayslip),
        assignedAssets: assignedAssetsData.map(mapAsset),
    };
}

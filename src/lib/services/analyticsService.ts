import { prisma } from "../prisma";
import { Employee, AttendanceRecord, VisitReport, LeaveRequest, PayslipRecord } from "@/types";

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
};

/**
 * Hitung total hari cuti yang sudah dipakai berdasarkan leave requests yang approved.
 * Fungsi ini HANYA membaca data (read-only) — tidak ada side effect ke database.
 */
function calculateUsedLeave(
    approvedLeaves: { startDate: Date | string; endDate: Date | string }[]
): number {
    return approvedLeaves.reduce((sum, l) => {
        const s = new Date(l.startDate);
        const e = new Date(l.endDate);
        const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return sum + Math.max(0, diff);
    }, 0);
}

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
        },
    });

    if (!employee) return null;

    // Query utama dijalankan paralel
    const [attendance, visits, leaves, payslips, approvedLeaves] = await Promise.all([
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
            orderBy: { period: "desc" },
            take: 3,
        }),
        // Ambil semua leave approved untuk hitung usedLeave aktual
        prisma.leaveRequest.findMany({
            where: { employeeId: employee.employeeId, status: "approved" },
            select: { startDate: true, endDate: true },
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
    const realUsedLeave = calculateUsedLeave(approvedLeaves);

    return {
        employee: employee as unknown as Employee,
        stats: {
            attendanceRate,
            lateCount: lateDays,
            visitCount: totalVisits,
            leaveUsed: realUsedLeave,
            // Gunakan nilai aktual dari perhitungan, bukan dari field yang mungkin drift
            leaveRemaining: Math.max(0, employee.totalLeave - realUsedLeave),
        },
        recentAttendance: attendance as unknown as AttendanceRecord[],
        recentVisits: visits as unknown as VisitReport[],
        recentLeaves: leaves as unknown as LeaveRequest[],
        recentPayslips: payslips as unknown as PayslipRecord[],
    };
}

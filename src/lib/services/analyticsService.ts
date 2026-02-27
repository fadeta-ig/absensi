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

export async function getEmployee360Data(id: string): Promise<Employee360Data | null> {
    if (!id) return null;
    const employee = await prisma.employee.findUnique({
        where: { id },
        include: {
            locations: true,
            payrollComponents: { include: { component: true } },
            manager: true
        }
    });

    if (!employee) return null;

    const [attendance, visits, leaves, payslips] = await Promise.all([
        prisma.attendanceRecord.findMany({
            where: { employeeId: employee.employeeId },
            orderBy: { date: "desc" },
            take: 10
        }),
        prisma.visitReport.findMany({
            where: { employeeId: employee.employeeId },
            orderBy: { date: "desc" },
            take: 5
        }),
        prisma.leaveRequest.findMany({
            where: { employeeId: employee.employeeId },
            orderBy: { startDate: "desc" },
            take: 5
        }),
        prisma.payslipRecord.findMany({
            where: { employeeId: employee.employeeId },
            orderBy: { period: "desc" },
            take: 3
        })
    ]);

    // Calculate basic stats
    const totalDays = await prisma.attendanceRecord.count({
        where: { employeeId: employee.employeeId }
    });
    const presentDays = await prisma.attendanceRecord.count({
        where: { employeeId: employee.employeeId, status: "present" }
    });
    const lateDays = await prisma.attendanceRecord.count({
        where: { employeeId: employee.employeeId, status: "late" }
    });
    const totalVisits = await prisma.visitReport.count({
        where: { employeeId: employee.employeeId }
    });

    const attendanceRate = totalDays > 0 ? ((presentDays + lateDays) / totalDays) * 100 : 0;

    // Calculate leave from actual approved requests for accuracy
    const approvedLeaves = await prisma.leaveRequest.findMany({
        where: { employeeId: employee.employeeId, status: "approved" }
    });

    const realUsedLeave = approvedLeaves.reduce((sum, l) => {
        const s = new Date(l.startDate);
        const e = new Date(l.endDate);
        const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return sum + Math.max(0, diff);
    }, 0);

    // Sync usedLeave if it drifted
    if (realUsedLeave !== employee.usedLeave) {
        await prisma.employee.update({
            where: { id: employee.id },
            data: { usedLeave: realUsedLeave }
        });
    }

    return {
        employee: employee as unknown as Employee,
        stats: {
            attendanceRate,
            lateCount: lateDays,
            visitCount: totalVisits,
            leaveUsed: realUsedLeave,
            leaveRemaining: employee.totalLeave - realUsedLeave
        },
        recentAttendance: attendance as unknown as AttendanceRecord[],
        recentVisits: visits as unknown as VisitReport[],
        recentLeaves: leaves as unknown as LeaveRequest[],
        recentPayslips: payslips as unknown as PayslipRecord[]
    };
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";

/** Konversi Date object dari Prisma ke string YYYY-MM-DD */
const toDateStr = (d: Date | string): string =>
    d instanceof Date ? d.toISOString().split("T")[0] : String(d);

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart.getTime() + 86400000); // +1 hari

        // Get all data in parallel for performance
        const [employees, todayAttendance, allLeaves, allVisits, allOvertime, recentAttendance] = await Promise.all([
            prisma.employee.findMany({ where: { isActive: true }, select: { employeeId: true, name: true, department: true } }),
            prisma.attendanceRecord.findMany({ where: { date: { gte: todayStart, lt: todayEnd } } }),
            prisma.leaveRequest.findMany(),
            prisma.visitReport.findMany(),
            prisma.overtimeRequest.findMany(),
            prisma.attendanceRecord.findMany({ orderBy: { date: "desc" }, take: 500 }),
        ]);


        // Summary counts
        const presentToday = todayAttendance.filter((a) => a.status === "present" || a.status === "late").length;
        const lateToday = todayAttendance.filter((a) => a.status === "late").length;
        const pendingLeaves = allLeaves.filter((l) => l.status === "pending").length;
        const pendingVisits = allVisits.filter((v) => v.status === "pending").length;
        const pendingOvertime = allOvertime.filter((o) => o.status === "pending").length;

        // Weekly attendance (last 7 days)
        const weeklyAttendance: { date: string; present: number; late: number; absent: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split("T")[0];
            const dayRecords = recentAttendance.filter((a) => toDateStr(a.date) === dateStr);
            weeklyAttendance.push({
                date: dateStr,
                present: dayRecords.filter((a) => a.status === "present").length,
                late: dayRecords.filter((a) => a.status === "late").length,
                absent: Math.max(0, employees.length - dayRecords.filter((a) => a.status === "present" || a.status === "late").length),
            });
        }

        // Department stats
        const deptMap: Record<string, { total: number; presentToday: number }> = {};
        const todayIds = new Set(todayAttendance.filter((a) => a.status === "present" || a.status === "late").map((a) => a.employeeId));
        for (const emp of employees) {
            if (!deptMap[emp.department]) deptMap[emp.department] = { total: 0, presentToday: 0 };
            deptMap[emp.department].total++;
            if (todayIds.has(emp.employeeId)) deptMap[emp.department].presentToday++;
        }
        const departmentStats = Object.entries(deptMap).map(([department, data]) => ({
            department,
            total: data.total,
            presentToday: data.presentToday,
        }));

        // Monthly overtime (last 30 days)
        const approvedOvertime = allOvertime.filter((o) => o.status === "approved");
        const otMap: Record<string, number> = {};
        for (const ot of approvedOvertime) {
            const key = toDateStr(ot.date);
            otMap[key] = (otMap[key] || 0) + ot.hours;
        }
        const monthlyOvertime = Object.entries(otMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-30)
            .map(([date, hours]) => ({ date, hours }));

        // Recent activity feed
        type Activity = { type: string; message: string; time: string };
        const activities: Activity[] = [];

        for (const l of allLeaves.slice(0, 5)) {
            const emp = employees.find((e) => e.employeeId === l.employeeId);
            activities.push({
                type: "leave",
                message: `${emp?.name || l.employeeId} mengajukan cuti (${l.status})`,
                time: toDateStr(l.createdAt),
            });
        }
        for (const v of allVisits.slice(0, 5)) {
            const emp = employees.find((e) => e.employeeId === v.employeeId);
            activities.push({
                type: "visit",
                message: `${emp?.name || v.employeeId} kunjungan ke ${v.clientName} (${v.status})`,
                time: toDateStr(v.createdAt),
            });
        }
        for (const o of allOvertime.slice(0, 5)) {
            const emp = employees.find((e) => e.employeeId === o.employeeId);
            activities.push({
                type: "overtime",
                message: `${emp?.name || o.employeeId} lembur ${o.hours}h (${o.status})`,
                time: toDateStr(o.createdAt),
            });
        }

        activities.sort((a, b) => b.time.localeCompare(a.time));

        return NextResponse.json({
            summary: {
                totalEmployees: employees.length,
                activeToday: presentToday,
                lateToday,
                pendingLeaves,
                pendingVisits,
                pendingOvertime,
            },
            weeklyAttendance,
            departmentStats,
            monthlyOvertime,
            recentActivity: activities.slice(0, 10),
        });
    } catch (err) {
        return serverErrorResponse("AnalyticsGET", err);
    }
}

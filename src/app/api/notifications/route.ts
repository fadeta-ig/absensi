import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { toWIBDateString, getWIBHoursMinutes } from "@/lib/timezone";
import { toDateString } from "@/lib/utils";

interface Notification {
    id: string;
    type: "leave" | "visit" | "overtime" | "absent";
    title: string;
    message: string;
    href: string;
    time: string;
}

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const today = toWIBDateString();
        const notifications: Notification[] = [];

        // Pending leave requests
        const pendingLeaves = await prisma.leaveRequest.findMany({
            where: { status: "pending" },
            orderBy: { createdAt: "desc" },
            take: 5,
        });
        for (const l of pendingLeaves) {
            const emp = await prisma.employee.findUnique({
                where: { employeeId: l.employeeId },
                select: { name: true },
            });
            notifications.push({
                id: `leave-${l.id}`,
                type: "leave",
                title: "Pengajuan Cuti",
                message: `${emp?.name || l.employeeId} mengajukan cuti ${l.type}`,
                href: "/dashboard/leave",
                time: toDateString(l.createdAt),
            });
        }

        // Pending visit reports
        const pendingVisits = await prisma.visitReport.findMany({
            where: { status: "pending" },
            orderBy: { createdAt: "desc" },
            take: 5,
        });
        for (const v of pendingVisits) {
            const emp = await prisma.employee.findUnique({
                where: { employeeId: v.employeeId },
                select: { name: true },
            });
            notifications.push({
                id: `visit-${v.id}`,
                type: "visit",
                title: "Laporan Kunjungan",
                message: `${emp?.name || v.employeeId} → ${v.clientName}`,
                href: "/dashboard/visits",
                time: toDateString(v.createdAt),
            });
        }

        // Pending overtime
        const pendingOvertime = await prisma.overtimeRequest.findMany({
            where: { status: "pending" },
            orderBy: { createdAt: "desc" },
            take: 5,
        });
        for (const o of pendingOvertime) {
            const emp = await prisma.employee.findUnique({
                where: { employeeId: o.employeeId },
                select: { name: true },
            });
            notifications.push({
                id: `overtime-${o.id}`,
                type: "overtime",
                title: "Pengajuan Lembur",
                message: `${emp?.name || o.employeeId} — ${o.hours}h (${toDateString(o.date)})`,
                href: "/dashboard/overtime",
                time: toDateString(o.createdAt),
            });
        }

        // Employees not yet present today
        const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
        const todayEnd = new Date(todayStart.getTime() + 86400000);
        const todayStr = toWIBDateString();
        const todayAttendance = await prisma.attendanceRecord.findMany({ where: { date: { gte: todayStart, lt: todayEnd } } });
        const presentIds = new Set(todayAttendance.map((a) => a.employeeId));
        const { hours: hour } = getWIBHoursMinutes();

        if (hour >= 9) {
            const absentEmployees = await prisma.employee.findMany({
                where: { isActive: true, employeeId: { notIn: Array.from(presentIds) } },
                select: { employeeId: true, name: true },
                take: 5,
            });
            for (const emp of absentEmployees) {
                notifications.push({
                    id: `absent-${emp.employeeId}`,
                    type: "absent",
                    title: "Belum Hadir",
                    message: `${emp.name} belum absen hari ini`,
                    href: "/dashboard/attendance",
                    time: todayStr,
                });
            }
        }

        // Sort by time descending
        notifications.sort((a, b) => b.time.localeCompare(a.time));

        return NextResponse.json({
            notifications: notifications.slice(0, 15),
            count: notifications.length,
        });
    } catch (err) {
        return serverErrorResponse("NotificationsGET", err);
    }
}

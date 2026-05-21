import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { toWIBDateString, getWIBHoursMinutes } from "@/lib/timezone";
import { toDateString } from "@/lib/utils";

interface Notification {
    id: string;
    type: "leave" | "visit" | "overtime" | "absent" | "letter";
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
        const notifications: Notification[] = [];

        // Pending leave requests — include employee in single query (eliminates N+1)
        const pendingLeaves = await prisma.leaveRequest.findMany({
            where: { status: "pending" },
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { employee: { select: { name: true } } },
        });
        for (const l of pendingLeaves) {
            notifications.push({
                id: `leave-${l.id}`,
                type: "leave",
                title: "Pengajuan Cuti",
                message: `${l.employee.name} mengajukan cuti ${l.type}`,
                href: "/dashboard/leave",
                time: toDateString(l.createdAt),
            });
        }

        // Pending visit reports — include employee in single query
        const pendingVisits = await prisma.visitReport.findMany({
            where: { status: "pending" },
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { employee: { select: { name: true } } },
        });
        for (const v of pendingVisits) {
            notifications.push({
                id: `visit-${v.id}`,
                type: "visit",
                title: "Laporan Kunjungan",
                message: `${v.employee.name} → ${v.clientName}`,
                href: "/dashboard/visits",
                time: toDateString(v.createdAt),
            });
        }

        // Pending overtime — include employee in single query
        const pendingOvertime = await prisma.overtimeRequest.findMany({
            where: { status: "pending" },
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { employee: { select: { name: true } } },
        });
        for (const o of pendingOvertime) {
            notifications.push({
                id: `overtime-${o.id}`,
                type: "overtime",
                title: "Pengajuan Lembur",
                message: `${o.employee.name} — ${o.hours}h (${toDateString(o.date)})`,
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

        // Pending letter requests — include employee in single query
        const pendingLetters = await prisma.letterRequest.findMany({
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { employee: { select: { name: true } } },
        });
        for (const lr of pendingLetters) {
            notifications.push({
                id: `letter-${lr.id}`,
                type: "letter",
                title: "Permintaan Surat",
                message: `${lr.employee.name} mengajukan ${lr.type.replace(/_/g, " ")}`,
                href: "/dashboard/letter-requests",
                time: toDateString(lr.createdAt),
            });
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

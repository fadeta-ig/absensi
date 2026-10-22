import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import { toWIBDateString, wibDateTimeToDate, getWIBHoursMinutes } from "@/lib/timezone";
import { toDateString } from "@/lib/utils";
import { getReadKeys, markNotificationsRead } from "@/lib/services/notificationReadService";
import { PERMISSIONS } from "@/lib/permissions";

interface Notification {
    id: string;
    type: "leave" | "visit" | "overtime" | "absent" | "letter";
    title: string;
    message: string;
    href: string;
    time: string;
    isRead: boolean;
}

export async function GET(request: Request) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const countOnly = new URL(request.url).searchParams.get("countOnly") === "1";
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
                time: l.createdAt.toISOString(),
                isRead: false,
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
                time: v.createdAt.toISOString(),
                isRead: false,
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
                time: o.createdAt.toISOString(),
                isRead: false,
            });
        }

        // Employees not yet present today (batas hari WIB eksplisit)
        const todayWib = toWIBDateString();
        const todayStart = wibDateTimeToDate(todayWib, "00:00");
        const todayEnd = wibDateTimeToDate(todayWib, "23:59");
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
                    message: `${emp.name} belum melakukan presensi hari ini`,
                    href: "/dashboard/attendance",
                    time: new Date().toISOString(),
                    isRead: false,
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
                time: lr.createdAt.toISOString(),
                isRead: false,
            });
        }

        // Sort by time descending
        notifications.sort((a, b) => b.time.localeCompare(a.time));
        const result = notifications.slice(0, 15);

        const readKeys = await getReadKeys(session.userId, result.map((n) => n.id));
        const withRead = result.map((n) => ({ ...n, isRead: readKeys.has(n.id) }));
        const unread = withRead.filter((n) => !n.isRead).length;

        if (countOnly) {
            return NextResponse.json({ unread });
        }

        return NextResponse.json({
            notifications: withRead,
            total: result.length,
            unread,
        });
    } catch (err) {
        return serverErrorResponse("NotificationsGET", err);
    }
}

const markReadSchema = z.object({
    ids: z.array(z.string().trim().min(1).max(191)).max(200).optional(),
    all: z.boolean().optional(),
    allIds: z.array(z.string().trim().min(1).max(191)).max(200).optional(),
});

export async function PATCH(request: Request) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const result = await validateBody(request, markReadSchema);
        if ("error" in result) return result.error;
        const ids = result.data.all ? (result.data.allIds ?? []) : (result.data.ids ?? []);
        const { marked } = await markNotificationsRead(session.userId, ids);
        return NextResponse.json({ success: true, marked });
    } catch (err) {
        return serverErrorResponse("NotificationsPATCH", err);
    }
}
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Notification {
    id: string;
    type: "leave" | "visit" | "overtime" | "absent";
    title: string;
    message: string;
    href: string;
    time: string;
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const today = new Date().toISOString().split("T")[0];
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
                time: l.createdAt,
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
                time: v.createdAt,
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
                message: `${emp?.name || o.employeeId} — ${o.hours}h (${o.date})`,
                href: "/dashboard/overtime",
                time: o.createdAt,
            });
        }

        // Employees not yet present today
        const todayAttendance = await prisma.attendanceRecord.findMany({ where: { date: today } });
        const presentIds = new Set(todayAttendance.map((a) => a.employeeId));
        const now = new Date();
        const hour = now.getHours();

        if (hour >= 9) {
            const absentEmployees = await prisma.employee.findMany({
                where: { isActive: true, employeeId: { notIn: [...presentIds] } },
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
                    time: today,
                });
            }
        }

        // Sort by time descending
        notifications.sort((a, b) => b.time.localeCompare(a.time));

        return NextResponse.json({
            notifications: notifications.slice(0, 15),
            count: notifications.length,
        });
    } catch (error) {
        console.error("[Notifications API Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

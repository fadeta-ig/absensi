import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeNotification {
    id: string;
    type: "leave" | "overtime" | "correction" | "news" | "letter";
    title: string;
    message: string;
    href: string;
    time: string;
    isRead: boolean;
}

// ─── GET: Notifikasi personal karyawan ───────────────────────────────────────

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { employeeId } = session;
        const notifications: EmployeeNotification[] = [];

        // Fetch semua data secara paralel
        const [leaves, overtimes, corrections] = await Promise.all([
            // Pengajuan cuti yang baru diperbarui statusnya (bukan pending)
            prisma.leaveRequest.findMany({
                where: {
                    employeeId,
                    status: { in: ["approved", "rejected"] },
                },
                orderBy: { createdAt: "desc" },
                take: 5,
                select: { id: true, status: true, type: true, createdAt: true, startDate: true },
            }),
            // Pengajuan lembur yang baru diperbarui statusnya
            prisma.overtimeRequest.findMany({
                where: {
                    employeeId,
                    status: { in: ["approved", "rejected"] },
                },
                orderBy: { createdAt: "desc" },
                take: 5,
                select: { id: true, status: true, hours: true, createdAt: true, date: true },
            }),
            // Koreksi absensi yang sudah diresolved
            prisma.attendanceCorrection.findMany({
                where: {
                    employeeId,
                    status: { in: ["APPROVED", "REJECTED"] },
                },
                orderBy: { updatedAt: "desc" },
                take: 5,
                select: { id: true, status: true, targetDate: true, updatedAt: true },
            }),
        ]);

        // Berita terbaru (3 hari terakhir)
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const recentNews = await prisma.newsItem.findMany({
            where: { createdAt: { gte: threeDaysAgo } },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: { id: true, title: true, category: true, createdAt: true },
        });

        // ── Build notification items ──────────────────────────────────────────

        for (const leave of leaves) {
            const typeLabel = leave.type === "annual" ? "tahunan" :
                              leave.type === "sick"   ? "sakit" :
                              leave.type === "personal" ? "pribadi" : "melahirkan";
            notifications.push({
                id:      `leave-${leave.id}`,
                type:    "leave",
                title:   leave.status === "approved" ? "Cuti Disetujui" : "Cuti Ditolak",
                message: `Pengajuan cuti ${typeLabel} mulai ${new Date(leave.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} ${leave.status === "approved" ? "telah disetujui" : "ditolak oleh HR"}`,
                href:    "/employee/leave",
                time:    leave.createdAt.toISOString(),
                isRead:  false,
            });
        }

        for (const overtime of overtimes) {
            notifications.push({
                id:      `overtime-${overtime.id}`,
                type:    "overtime",
                title:   overtime.status === "approved" ? "Lembur Disetujui" : "Lembur Ditolak",
                message: `Lembur ${overtime.hours}jam pada ${new Date(overtime.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} ${overtime.status === "approved" ? "telah disetujui" : "ditolak oleh HR"}`,
                href:    "/employee/overtime",
                time:    overtime.createdAt.toISOString(),
                isRead:  false,
            });
        }

        for (const corr of corrections) {
            notifications.push({
                id:      `correction-${corr.id}`,
                type:    "correction",
                title:   corr.status === "APPROVED" ? "Koreksi Absensi Disetujui" : "Koreksi Absensi Ditolak",
                message: `Koreksi tanggal ${new Date(corr.targetDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} ${corr.status === "APPROVED" ? "telah disetujui" : "ditolak oleh HR"}`,
                href:    "/employee/attendance/correction",
                time:    corr.updatedAt.toISOString(),
                isRead:  false,
            });
        }

        for (const news of recentNews) {
            notifications.push({
                id:      `news-${news.id}`,
                type:    "news",
                title:   "Berita Baru",
                message: news.title,
                href:    "/employee/news",
                time:    news.createdAt.toISOString(),
                isRead:  false,
            });
        }

        // Sort by time descending
        notifications.sort((a, b) => b.time.localeCompare(a.time));
        const result = notifications.slice(0, 20);

        return NextResponse.json({
            notifications: result,
            total:  result.length,
            unread: result.filter((n) => !n.isRead).length,
        });
    } catch (err) {
        return serverErrorResponse("EmployeeNotificationsGET", err);
    }
}

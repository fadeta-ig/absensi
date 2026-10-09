import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webPush } from "@/lib/webPush";
import logger from "@/lib/logger";
import { SYSTEM_ACTOR, logAction } from "@/lib/services/auditService";
import { toWIBDateString } from "@/lib/timezone";

/**
 * POST /api/cron/meeting-task-reminder
 *
 * Dijadwalkan eksternal (mis. cron-job.org) SETIAP HARI jam 07:00 WIB.
 * Mengirim SATU push per hari per penerima untuk setiap task yang masih
 * terbuka (belum SELESAI/DIBATALKAN, meeting tidak dibatalkan) — termasuk
 * yang sudah overdue. Task SELESAI tidak pernah dikirimi.
 * Exactly-once per (taskId, employeeId, kind=DAILY-YYYY-MM-DD WIB)
 * via MeetingTaskReminderLog unique.
 *
 * Security: protected by CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error("Meeting task reminder cron blocked: CRON_SECRET not configured");
        return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        logger.warn("Unauthorized meeting-task-reminder cron attempt", {
            userAgent: request.headers.get("user-agent") ?? "unknown",
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const now = new Date();
        const todayWib = toWIBDateString(now);
        const kind = `DAILY-${todayWib}`;

        const tasks = await prisma.meetingTask.findMany({
            where: {
                isCancelled: false,
                deadlineHistory: { some: {} },
                assignees: { some: { status: { in: ["BELUM_DIKERJAKAN", "ON_PROGRESS"] } } },
            },
            orderBy: { createdAt: "asc" },
            take: 500,
            select: {
                id: true,
                title: true,
                deadlineHistory: { orderBy: { sequence: "desc" }, take: 1, select: { deadlineDate: true } },
                assignees: {
                    where: { status: { in: ["BELUM_DIKERJAKAN", "ON_PROGRESS"] } },
                    select: {
                        employeeId: true,
                        status: true,
                        employee: { select: { userAccount: { select: { id: true } } } },
                    },
                },
                reminderLogs: { where: { kind }, select: { employeeId: true } },
            },
        });

        let sent = 0;
        const failedEndpoints: string[] = [];

        for (const task of tasks) {
            const dueAt = task.deadlineHistory[0]?.deadlineDate;
            if (!dueAt) continue;
            const sentToday = new Set(task.reminderLogs.map((l) => l.employeeId));
            const isOverdue = now.getTime() > dueAt.getTime();
            const dueLabel = dueAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });

            for (const assignee of task.assignees) {
                const userId = assignee.employee?.userAccount?.id;
                if (!userId || sentToday.has(assignee.employeeId)) continue;
                try {
                    await prisma.meetingTaskReminderLog.create({
                        data: { taskId: task.id, employeeId: assignee.employeeId, kind },
                    });
                } catch {
                    continue; // P2002: sudah dikirim (cron ganda/retry)
                }

                const subs = await prisma.pushSubscription.findMany({ where: { userId } });
                const body = JSON.stringify({
                    title: isOverdue ? `Task Overdue: ${task.title}` : `Pengingat Task: ${task.title}`,
                    body: isOverdue
                        ? `Deadline ${dueLabel} telah lewat — segera selesaikan atau ajukan perpanjangan.`
                        : `Deadline ${dueLabel} — status: ${assignee.status === "ON_PROGRESS" ? "On Progress" : "Belum Dikerjakan"}.`,
                    icon: "/icons/android-chrome-192x192.png",
                    badge: "/icons/android-chrome-192x192.png",
                    tag: `meeting-task-${task.id}-${kind}`,
                    url: `/employee/appointments/tasks?highlight=${task.id}`,
                });
                for (const sub of subs) {
                    try {
                        await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
                        sent++;
                    } catch (err) {
                        const statusCode = (err as { statusCode?: number })?.statusCode;
                        if (statusCode === 404 || statusCode === 410) failedEndpoints.push(sub.endpoint);
                        else logger.warn("meeting task reminder push gagal", { endpoint: sub.endpoint, statusCode });
                    }
                }
            }
        }

        if (failedEndpoints.length > 0) {
            await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: failedEndpoints } } }).catch(() => undefined);
        }
        await logAction("SEND_MEETING_TASK_REMINDERS", "MEETING_TASK", SYSTEM_ACTOR, undefined, { sent, date: todayWib }).catch(() => undefined);

        return NextResponse.json({ success: true, sent, cleanedUp: failedEndpoints.length });
    } catch (err) {
        logger.error("meeting-task-reminder cron gagal", { err });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

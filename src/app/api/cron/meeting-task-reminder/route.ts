import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webPush } from "@/lib/webPush";
import logger from "@/lib/logger";
import { SYSTEM_ACTOR, logAction } from "@/lib/services/auditService";
import { MEETING_TASK_REMINDER_OFFSETS } from "@/lib/services/meetingTaskService";
import { toWIBDateString } from "@/lib/timezone";

/**
 * POST /api/cron/meeting-task-reminder
 *
 * Triggered externally (e.g. cron-job.org) every 15 minutes.
 * Sends due reminders (H-1440/H-180/H-60) per assignee for open tasks,
 * plus a once-daily OVERDUE reminder per assignee.
 * Exactly-once per (taskId, employeeId, kind) via MeetingTaskReminderLog unique.
 *
 * Security: protected by CRON_SECRET bearer token.
 */
const POLL_WINDOW_MIN = 15;

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
        const horizon = new Date(now.getTime() + (Math.max(...MEETING_TASK_REMINDER_OFFSETS) + POLL_WINDOW_MIN) * 60000);

        // Kandidat: task aktif dengan (sekurangnya satu riwayat) deadline dalam horizon ATAU sudah lewat.
        // Filter JS lanjutan memastikan yang dipakai adalah deadline aktif (sequence max).
        const tasks = await prisma.meetingTask.findMany({
            where: {
                isCancelled: false,
                deadlineHistory: { some: { deadlineDate: { lte: horizon } } },
                assignees: { some: { status: { in: ["BELUM_DIKERJAKAN", "ON_PROGRESS"] } } },
            },
            select: {
                id: true,
                title: true,
                appointment: { select: { title: true } },
                deadlineHistory: { orderBy: { sequence: "desc" }, take: 1, select: { deadlineDate: true } },
                assignees: {
                    where: { status: { in: ["BELUM_DIKERJAKAN", "ON_PROGRESS"] } },
                    select: {
                        employeeId: true,
                        employee: { select: { userAccount: { select: { id: true } } } },
                    },
                },
                reminderLogs: { select: { employeeId: true, kind: true } },
            },
        });

        let sent = 0;
        const failedEndpoints: string[] = [];

        for (const task of tasks) {
            const dueAt = task.deadlineHistory[0]?.deadlineDate;
            if (!dueAt) continue;
            const minutesLeft = (dueAt.getTime() - now.getTime()) / 60000;
            const sentKinds = new Set(task.reminderLogs.map((l) => `${l.employeeId}:${l.kind}`));

            for (const assignee of task.assignees) {
                const userId = assignee.employee?.userAccount?.id;
                if (!userId) continue;

                const dueKinds: string[] = [];
                if (minutesLeft <= 0) {
                    dueKinds.push(`OVERDUE-${todayWib}`);
                } else {
                    for (const offset of MEETING_TASK_REMINDER_OFFSETS) {
                        if (minutesLeft <= offset && minutesLeft > offset - POLL_WINDOW_MIN) dueKinds.push(`H-${offset}`);
                    }
                }
                if (dueKinds.length === 0) continue;

                for (const kind of dueKinds) {
                    if (sentKinds.has(`${assignee.employeeId}:${kind}`)) continue;
                    try {
                        await prisma.meetingTaskReminderLog.create({
                            data: { taskId: task.id, employeeId: assignee.employeeId, kind },
                        });
                    } catch {
                        continue; // P2002: sudah dikirim cron paralel
                    }

                    const isOverdue = kind.startsWith("OVERDUE");
                    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
                    const body = JSON.stringify({
                        title: isOverdue ? `Task Overdue: ${task.title}` : `Pengingat Task: ${task.title}`,
                        body: isOverdue
                            ? `Deadline telah lewat — segera selesaikan atau ajukan perpanjangan.`
                            : `Deadline ${dueAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB`,
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
        }

        if (failedEndpoints.length > 0) {
            await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: failedEndpoints } } }).catch(() => undefined);
        }
        await logAction("SEND_MEETING_TASK_REMINDERS", "MEETING_TASK", SYSTEM_ACTOR, undefined, { sent }).catch(() => undefined);

        return NextResponse.json({ success: true, sent, cleanedUp: failedEndpoints.length });
    } catch (err) {
        logger.error("meeting-task-reminder cron gagal", { err });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

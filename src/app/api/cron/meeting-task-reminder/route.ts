import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webPush } from "@/lib/webPush";
import logger from "@/lib/logger";
import { SYSTEM_ACTOR, logAction } from "@/lib/services/auditService";
import { toWIBDateString } from "@/lib/timezone";

/**
 * POST /api/cron/meeting-task-reminder
 *
 * Dijadwalkan crontab root VPS via hris-cron.sh SETIAP HARI jam 07:00 WIB.
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

        const tasks = [];
        const PAGE = 500;
        let cursor: string | undefined;
        for (;;) {
            const batch = await prisma.meetingTask.findMany({
                where: {
                    isCancelled: false,
                    appointment: { status: "COMPLETED" },
                    deadlineHistory: { some: {} },
                    assignees: { some: { status: { in: ["OPEN", "BELUM_DIKERJAKAN", "ON_PROGRESS"] } } },
                },
                orderBy: { createdAt: "asc" },
                take: PAGE,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                select: {
                    id: true,
                    title: true,
                    appointment: { select: { title: true } },
                    assigner: { select: { employeeId: true, name: true } },
                    deadlineHistory: { orderBy: { sequence: "desc" }, take: 1, select: { deadlineDate: true } },
                    assignees: {
                        where: { status: { in: ["OPEN", "BELUM_DIKERJAKAN", "ON_PROGRESS"] } },
                        select: {
                            employeeId: true,
                            status: true,
                            employee: { select: { userAccount: { select: { id: true } } } },
                        },
                    },
                    reminderLogs: { where: { kind }, select: { employeeId: true } },
                },
            });
            if (batch.length === 0) break;
            tasks.push(...batch);
            if (batch.length < PAGE) break;
            cursor = batch[batch.length - 1].id;
        }

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
                const daysLeft = Math.max(0, Math.ceil((dueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
                const meetingTitle = task.appointment?.title ?? "Meeting";
                const giverName = task.assigner?.name ?? task.assigner?.employeeId ?? "pemberi task";
                const body = JSON.stringify({
                    title: isOverdue ? `Task Overdue: ${task.title}` : `Pengingat Task: ${task.title}`,
                    body: isOverdue
                        ? `Kamu masih memiliki task dari "${meetingTitle}" oleh ${giverName}. Deadline ${dueLabel} telah lewat — segera kumpulkan hasil kerja.`
                        : `Kamu masih memiliki task dari "${meetingTitle}" oleh ${giverName}, deadline sisa ${daysLeft} hari lagi (${dueLabel}).`,
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

        // Nudge verifikator: submission PENDING yang belum diputuskan.
        const verifyKind = `VERIFY-${todayWib}`;
        const pendingSubs = await prisma.meetingTaskSubmission.findMany({
            where: {
                verdict: "PENDING",
                task: { isCancelled: false, appointment: { status: "COMPLETED" } },
                createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            select: { id: true, taskId: true, task: { select: { title: true, assignerEmployeeId: true } } },
            take: 200,
        });
        let verifySent = 0;
        const seenVerify = new Set<string>();
        for (const sub of pendingSubs) {
            const dedupKey = `${sub.taskId}:${sub.task.assignerEmployeeId}`;
            if (seenVerify.has(dedupKey)) continue;
            seenVerify.add(dedupKey);
            try {
                await prisma.meetingTaskReminderLog.create({
                    data: { taskId: sub.taskId, employeeId: sub.task.assignerEmployeeId, kind: verifyKind },
                });
            } catch {
                continue; // P2002: sudah diingatkan hari ini
            }
            const giverUsers = await prisma.userAccount.findMany({
                where: { employeeId: sub.task.assignerEmployeeId, isActive: true },
                select: { id: true },
            });
            const giverSubs = giverUsers.length > 0 ? await prisma.pushSubscription.findMany({ where: { userId: { in: giverUsers.map((u) => u.id) } } }) : [];
            const body = JSON.stringify({
                title: `Perlu Verifikasi: ${sub.task.title}`,
                body: "Ada hasil kerja yang menunggu verifikasi Anda.",
                icon: "/icons/android-chrome-192x192.png",
                badge: "/icons/android-chrome-192x192.png",
                tag: `meeting-task-${sub.taskId}-verify-${todayWib}`,
                url: `/employee/appointments/tasks?highlight=${sub.taskId}`,
            });
            for (const ps of giverSubs) {
                try {
                    await webPush.sendNotification({ endpoint: ps.endpoint, keys: { p256dh: ps.p256dh, auth: ps.auth } }, body);
                    verifySent++;
                } catch (err) {
                    const statusCode = (err as { statusCode?: number })?.statusCode;
                    if (statusCode === 404 || statusCode === 410) failedEndpoints.push(ps.endpoint);
                }
            }
        }

        await logAction("SEND_MEETING_TASK_REMINDERS", "MEETING_TASK", SYSTEM_ACTOR, undefined, { sent, verifySent, date: todayWib }).catch(() => undefined);

        return NextResponse.json({ success: true, sent, verifySent, cleanedUp: failedEndpoints.length });
    } catch (err) {
        logger.error("meeting-task-reminder cron gagal", { err });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

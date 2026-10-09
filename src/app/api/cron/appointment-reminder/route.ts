import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webPush } from "@/lib/webPush";
import logger from "@/lib/logger";
import { SYSTEM_ACTOR, logAction } from "@/lib/services/auditService";
import { getReminderOffsets } from "@/lib/services/appointmentService";

/**
 * POST /api/cron/appointment-reminder
 *
 * Triggered externally (e.g. cron-job.org) every 15 minutes.
 * Sends due reminders (offsets dinamis milik PIC) for SCHEDULED appointments.
 * Also flips ended SCHEDULED rows to COMPLETED (lifecycle berbasis jam).
 * Exactly-once per (appointmentId, offsetMin) via AppointmentReminderLog unique.
 *
 * Security: protected by CRON_SECRET bearer token.
 */
const POLL_WINDOW_MIN = 15;

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error("Appointment reminder cron blocked: CRON_SECRET not configured");
        return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        logger.warn("Unauthorized appointment-reminder cron attempt", {
            userAgent: request.headers.get("user-agent") ?? "unknown",
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const offsets = await getReminderOffsets();
        if (offsets.length === 0) {
            return NextResponse.json({ success: true, sent: 0, cleanedUp: 0 });
        }
        const now = new Date();
        const maxOffset = Math.max(...offsets);
        const horizon = new Date(now.getTime() + (maxOffset + POLL_WINDOW_MIN) * 60000);

        const dueToComplete = await prisma.meetingAppointment.findMany({
            where: { status: "SCHEDULED", endAt: { lte: now } },
            select: { id: true },
        });
        const completed = await prisma.meetingAppointment.updateMany({
            where: { status: "SCHEDULED", endAt: { lte: now } },
            data: { status: "COMPLETED" },
        });

        // Submit task dari meeting yang baru selesai (push sekali per penerima)
        if (dueToComplete.length > 0) {
            const { getUnsubmittedOpenTasks, claimSubmittedTasks } = await import("@/lib/services/meetingTaskService");
            const { sendAppointmentPush, collectUserIdsForEmployees } = await import("@/lib/services/appointmentNotify");
            const pending = await getUnsubmittedOpenTasks(dueToComplete.map((m) => m.id));
            const claimed = await claimSubmittedTasks(pending);
            for (const item of claimed) {
                const userIds = await collectUserIdsForEmployees(item.employeeIds);
                await sendAppointmentPush(userIds, {
                    title: "Task Baru dari Meeting Selesai",
                    body: `${item.title} — deadline ${item.activeDeadlineDate}`,
                    tag: `meeting-task-${item.taskId}-submitted`,
                    url: `/employee/appointments/tasks?highlight=${item.taskId}`,
                });
            }
        }

        const upcoming = await prisma.meetingAppointment.findMany({
            where: { status: "SCHEDULED", startAt: { gt: now, lt: horizon } },
            select: {
                id: true,
                title: true,
                startAt: true,
                roomId: true,
                requesterEmployeeId: true,
                reminderOffsets: true,
                reminderLogs: { select: { offsetMin: true } },
                participants: { where: { employeeId: { not: null } }, select: { employeeId: true } },
                room: { select: { name: true } },
            },
        });

        let sent = 0;
        const failedEndpoints: string[] = [];

        for (const appt of upcoming) {
            const effective = appt.reminderOffsets ? parseOverride(appt.reminderOffsets) : offsets;
            const sentOffsets = new Set(appt.reminderLogs.map((l) => l.offsetMin));
            const minutesLeft = (appt.startAt.getTime() - now.getTime()) / 60000;

            for (const offset of effective) {
                if (sentOffsets.has(offset)) continue;
                if (minutesLeft > offset || minutesLeft <= offset - POLL_WINDOW_MIN) continue;
                try {
                    await prisma.appointmentReminderLog.create({ data: { appointmentId: appt.id, offsetMin: offset } });
                } catch {
                    continue; // P2002: sudah dikirim cron paralel
                }
                const employeeIds = [
                    ...(appt.requesterEmployeeId ? [appt.requesterEmployeeId] : []),
                    ...appt.participants.map((p) => p.employeeId as string),
                ];
                const users = await prisma.userAccount.findMany({
                    where: { employeeId: { in: [...new Set(employeeIds)] }, isActive: true },
                    select: { id: true, pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } } },
                });
                const body = JSON.stringify({
                    title: offset >= 1440 ? `Pengingat Meeting H-${Math.round(offset / 1440)}: ${appt.title}` : `Pengingat Meeting ${offset} Menit Lagi: ${appt.title}`,
                    body: `${appt.room?.name ?? "Meeting Daring"} • ${appt.startAt.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB`,
                    icon: "/icons/android-chrome-192x192.png",
                    badge: "/icons/android-chrome-192x192.png",
                    tag: `appointment-${appt.id}-${offset}`,
                    url: "/employee/appointments",
                });
                for (const u of users) {
                    for (const sub of u.pushSubscriptions) {
                        try {
                            await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
                            sent++;
                        } catch (err) {
                            const statusCode = (err as { statusCode?: number })?.statusCode;
                            if (statusCode === 404 || statusCode === 410) failedEndpoints.push(sub.endpoint);
                        }
                    }
                }
            }
        }

        if (failedEndpoints.length > 0) {
            await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: [...new Set(failedEndpoints)] } } }).catch(() => undefined);
        }
        await logAction("SEND_APPOINTMENT_REMINDERS", "APPOINTMENT", SYSTEM_ACTOR, undefined, { sent, completed: completed.count }).catch((err) =>
            logger.error("appointment reminder audit gagal", { err })
        );
        return NextResponse.json({ success: true, sent, completed: completed.count, cleanedUp: failedEndpoints.length });
    } catch (err) {
        logger.error("Appointment reminder cron gagal", { err });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

function parseOverride(raw: string): number[] {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return [...new Set(parsed.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 15))].sort((a, b) => b - a).slice(0, 5);
    } catch {
        return [];
    }
}

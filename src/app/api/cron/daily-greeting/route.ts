import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webPush } from "@/lib/webPush";
import logger, { serializeError } from "@/lib/logger";
import { stripGelar } from "@/lib/utils/formatters";
import { toWIBDateString, wibDateTimeToDate } from "@/lib/timezone";

/**
 * POST /api/cron/daily-greeting
 *
 * Triggered externally (e.g. cron-job.org) every day at 07:00 WIB.
 * Sends a push notification to every active employee with a push subscription.
 *
 * Security: protected by CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error("Daily greeting cron blocked: CRON_SECRET not configured");
        return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        logger.warn("Unauthorized daily-greeting cron attempt", {
            userAgent: request.headers.get("user-agent") ?? "unknown",
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const now = new Date();
        const todayDay = now.getDay(); // 0=Sunday … 6=Saturday
        const todayWib = toWIBDateString(now);
        const dayStart = wibDateTimeToDate(todayWib, "00:00");
        const dayEnd = wibDateTimeToDate(todayWib, "23:59");

        // Fetch all active employees with push subscriptions + their shift
        const employees = await prisma.employee.findMany({
            where: {
                isActive: true,
                userAccount: { is: { isActive: true, pushSubscriptions: { some: {} } } },
            },
            include: {
                userAccount: { include: { pushSubscriptions: true } },
                shift: { include: { days: true } },
            },
        });

        // Agenda meeting hari ini (SCHEDULED, jam WIB hari ini) untuk semua karyawan sekaligus
        const todaysMeetings = await prisma.meetingAppointment.findMany({
            where: { status: "SCHEDULED", startAt: { gte: dayStart, lte: dayEnd } },
            orderBy: { startAt: "asc" },
            select: {
                id: true,
                title: true,
                startAt: true,
                requesterEmployeeId: true,
                requester: { select: { name: true } },
                room: { select: { name: true } },
                participants: { where: { employeeId: { not: null } }, select: { employeeId: true } },
            },
        });
        const meetingsByEmployee = new Map<string, typeof todaysMeetings>();
        for (const m of todaysMeetings) {
            const involved = new Set<string>();
            if (m.requesterEmployeeId) involved.add(m.requesterEmployeeId);
            for (const p of m.participants) if (p.employeeId) involved.add(p.employeeId);
            for (const empId of involved) {
                const list = meetingsByEmployee.get(empId) ?? [];
                list.push(m);
                meetingsByEmployee.set(empId, list);
            }
        }

        const fmtTime = (d: Date) =>
            d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(":", ".");

        let sentCount = 0;
        const failedEndpoints: string[] = [];

        async function sendToSubs(
            subs: Array<{ endpoint: string; p256dh: string; auth: string; id: string }>,
            payload: string,
            employeeId: string
        ) {
            for (const sub of subs) {
                try {
                    await webPush.sendNotification(
                        {
                            endpoint: sub.endpoint,
                            keys: { p256dh: sub.p256dh, auth: sub.auth },
                        },
                        payload,
                    );
                    sentCount++;
                } catch (err: unknown) {
                    const statusCode = (err as { statusCode?: number })?.statusCode;
                    // 404 or 410 = subscription expired/invalid → cleanup
                    if (statusCode === 404 || statusCode === 410) {
                        failedEndpoints.push(sub.endpoint);
                    }
                    logger.warn("Push notification failed", {
                        employeeId,
                        subscriptionId: sub.id,
                        endpoint: sub.endpoint,
                        statusCode,
                        error: serializeError(err),
                    });
                }
            }
        }

        for (const emp of employees) {
            // Determine if today is a day off for this employee
            const shiftDay = emp.shift?.days.find((d) => d.dayOfWeek === todayDay);
            const isOff = !shiftDay || shiftDay.isOff;

            const title = "Happy Shine On You! ☀️";
            let body: string;

            if (isOff) {
                body = `Halo ${emp.name}! Hari ini jadwal libur kamu. Istirahat yang cukup dan selamat menikmati hari liburmu! 🌴✨`;
            } else {
                body = `Halo ${emp.name}! Jangan lupa kerja hari ini ya. Semangat menjalani aktivitasmu, kamu hebat! 💪🔥`;
            }

            const payload = JSON.stringify({
                title,
                body,
                icon: "/icons/android-chrome-192x192.png",
                badge: "/icons/android-chrome-192x192.png",
                tag: `daily-greeting-${now.toISOString().split("T")[0]}`,
            });

            for (const sub of emp.userAccount?.pushSubscriptions ?? []) {
                await sendToSubs([sub], payload, emp.employeeId);
            }

            // Push kedua: agenda meeting hari ini (hanya bila ada)
            const mine = meetingsByEmployee.get(emp.employeeId) ?? [];
            if (mine.length > 0) {
                const lines = mine.slice(0, 3).map((m) => {
                    const organizer = m.requester?.name ? stripGelar(m.requester.name) : "Penyelenggara";
                    return `${fmtTime(m.startAt)} — ${m.title} oleh ${organizer}${m.room ? ` @ ${m.room.name}` : ""}`;
                });
                const more = mine.length > 3 ? `\n+${mine.length - 3} meeting lainnya` : "";
                const agendaPayload = JSON.stringify({
                    title: `Agenda Meeting Hari Ini (${mine.length})`,
                    body: `${lines.join("\n")}${more}`,
                    icon: "/icons/android-chrome-192x192.png",
                    badge: "/icons/android-chrome-192x192.png",
                    tag: `daily-meetings-${todayWib}`,
                    url: "/employee/appointments",
                });
                await sendToSubs(emp.userAccount?.pushSubscriptions ?? [], agendaPayload, emp.employeeId);
            }
        }

        // Cleanup expired subscriptions
        if (failedEndpoints.length > 0) {
            await prisma.pushSubscription.deleteMany({
                where: { endpoint: { in: failedEndpoints } },
            });
        }

        logger.info("Daily greeting cron completed", {
            totalEmployees: employees.length,
            sentCount,
            cleanedUp: failedEndpoints.length,
        });

        return NextResponse.json({
            success: true,
            sent: sentCount,
            cleanedUp: failedEndpoints.length,
        });
    } catch (err) {
        logger.error("Daily greeting cron error", { error: err });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

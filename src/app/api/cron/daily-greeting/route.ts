import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { webPush } from "@/lib/webPush";
import logger from "@/lib/logger";

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
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

    if (!authHeader || authHeader !== expectedToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const now = new Date();
        const todayDay = now.getDay(); // 0=Sunday … 6=Saturday

        // Fetch all active employees with push subscriptions + their shift
        const employees = await prisma.employee.findMany({
            where: { isActive: true, pushSubscriptions: { some: {} } },
            include: {
                pushSubscriptions: true,
                shift: { include: { days: true } },
            },
        });

        let sentCount = 0;
        let failedEndpoints: string[] = [];

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
                icon: "/icons/icon-192x192.svg",
                badge: "/icons/icon-192x192.svg",
                tag: `daily-greeting-${now.toISOString().split("T")[0]}`,
            });

            for (const sub of emp.pushSubscriptions) {
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
                        employeeId: emp.employeeId,
                        statusCode,
                    });
                }
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

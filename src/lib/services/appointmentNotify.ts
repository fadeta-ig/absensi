import { prisma } from "@/lib/prisma";
import { webPush } from "@/lib/webPush";
import logger from "@/lib/logger";

export interface AppointmentPushPayload {
    title: string;
    body: string;
    tag: string;
    url?: string;
}

/** UserId pembuat appointment (untuk notif balik RSVP). */
export async function collectRequesterUserId(appointmentId: string): Promise<string[]> {
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id: appointmentId },
        select: { requesterEmployeeId: true },
    });
    if (!appt?.requesterEmployeeId) return [];
    const user = await prisma.userAccount.findFirst({
        where: { employeeId: appt.requesterEmployeeId, isActive: true },
        select: { id: true },
    });
    return user ? [user.id] : [];
}

export async function collectAppointmentUserIds(appointmentId: string): Promise<string[]> {
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id: appointmentId },
        select: {
            requesterEmployeeId: true,
            participants: { where: { employeeId: { not: null } }, select: { employeeId: true } },
        },
    });
    if (!appt) return [];
    const employeeIds = [
        ...(appt.requesterEmployeeId ? [appt.requesterEmployeeId] : []),
        ...appt.participants.map((p) => p.employeeId as string),
    ];
    if (employeeIds.length === 0) return [];
    const users = await prisma.userAccount.findMany({
        where: { employeeId: { in: [...new Set(employeeIds)] }, isActive: true },
        select: { id: true },
    });
    return users.map((u) => u.id);
}

/**
 * Kirim push best-effort (tidak pernah melempar). Dipanggil AFTER commit.
 * Endpoint 404/410 dibersihkan seperti cron daily-greeting.
 */
export async function sendAppointmentPush(userIds: string[], payload: AppointmentPushPayload): Promise<void> {
    try {
        if (userIds.length === 0) return;
        const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: [...new Set(userIds)] } } });
        if (subs.length === 0) return;
        const body = JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: "/icons/android-chrome-192x192.png",
            badge: "/icons/android-chrome-192x192.png",
            tag: payload.tag,
            url: payload.url ?? "/employee/appointments",
        });
        const failed: string[] = [];
        for (const sub of subs) {
            try {
                await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
            } catch (err) {
                const statusCode = (err as { statusCode?: number })?.statusCode;
                if (statusCode === 404 || statusCode === 410) failed.push(sub.endpoint);
                else logger.warn("appointment push gagal", { endpoint: sub.endpoint, statusCode });
            }
        }
        if (failed.length > 0) {
            await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: failed } } }).catch(() => undefined);
        }
    } catch (err) {
        logger.warn("appointment push dilewati", { err });
    }
}

/** UserId aktif untuk daftar employeeId (untuk push task meeting). */
export async function collectUserIdsForEmployees(employeeIds: string[]): Promise<string[]> {
    const unique = [...new Set(employeeIds.filter(Boolean))];
    if (unique.length === 0) return [];
    const users = await prisma.userAccount.findMany({
        where: { employeeId: { in: unique }, isActive: true },
        select: { id: true },
    }).catch(() => [] as Array<{ id: string }>);
    return users.map((u) => u.id);
}

/** UserId para penerima task meeting (untuk push create/extend). */
export async function collectMeetingTaskUserIds(taskId: string): Promise<string[]> {
    const rows = await prisma.meetingTaskAssignee.findMany({
        where: { taskId },
        select: { employeeId: true },
    }).catch(() => [] as Array<{ employeeId: string }>);
    return collectUserIdsForEmployees(rows.map((r) => r.employeeId));
}

/** UserId para penerima task yang statusnya masih terbuka (untuk submit on complete). */
export async function collectOpenMeetingTaskUserIds(taskId: string): Promise<string[]> {
    const rows = await prisma.meetingTaskAssignee.findMany({
        where: { taskId, status: { in: ["BELUM_DIKERJAKAN", "ON_PROGRESS"] } },
        select: { employeeId: true },
    }).catch(() => [] as Array<{ employeeId: string }>);
    return collectUserIdsForEmployees(rows.map((r) => r.employeeId));
}

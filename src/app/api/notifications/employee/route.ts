import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import { toWIBDateString, wibDateTimeToDate } from "@/lib/timezone";
import { stripGelar } from "@/lib/utils/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeNotification {
    id: string;
    type: "leave" | "overtime" | "correction" | "news" | "letter" | "appointment" | "task";
    title: string;
    message: string;
    href: string;
    time: string;
    isRead: boolean;
}

// ─── GET: Notifikasi personal karyawan ───────────────────────────────────────

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { employeeId } = session;
        const notifications: EmployeeNotification[] = [];
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Fetch semua data secara paralel
        const [leaves, overtimes, corrections, appointmentInvites, appointmentOwnCancelled, appointmentFollowedCancelled, appointmentDeclined] = await Promise.all([
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
            // Koreksi presensi yang sudah diresolved
            prisma.attendanceCorrection.findMany({
                where: {
                    employeeId,
                    status: { in: ["APPROVED", "REJECTED"] },
                },
                orderBy: { updatedAt: "desc" },
                take: 5,
                select: { id: true, status: true, targetDate: true, updatedAt: true },
            }),
            // Undangan appointment yang belum dijawab (tanpa pandang waktu mulai)
            prisma.meetingAppointment.findMany({
                where: {
                    status: "SCHEDULED",
                    participants: { some: { employeeId, inviteStatus: "PENDING" } },
                },
                orderBy: { startAt: "asc" },
                take: 5,
                select: { id: true, title: true, startAt: true, createdAt: true, room: { select: { name: true } } },
            }),
            // Rapat milik sendiri yang dibatalkan (7 hari terakhir)
            prisma.meetingAppointment.findMany({
                where: {
                    requesterEmployeeId: employeeId,
                    status: "CANCELLED",
                    updatedAt: { gte: sevenDaysAgo },
                },
                orderBy: { updatedAt: "desc" },
                take: 5,
                select: { id: true, title: true, status: true, startAt: true, updatedAt: true, room: { select: { name: true } } },
            }),
            // Rapat yang diikuti (bukan pembuat) — dibatalkan 7 hari terakhir
            prisma.meetingAppointment.findMany({
                where: {
                    status: "CANCELLED",
                    updatedAt: { gte: sevenDaysAgo },
                    participants: { some: { employeeId } },
                    NOT: { requesterEmployeeId: employeeId },
                },
                orderBy: { updatedAt: "desc" },
                take: 5,
                select: { id: true, title: true, status: true, startAt: true, updatedAt: true, room: { select: { name: true } } },
            }),
            // Penolakan peserta atas appointment milik sendiri (7 hari terakhir)
            prisma.meetingAppointment.findMany({
                where: {
                    requesterEmployeeId: employeeId,
                    status: "SCHEDULED",
                    participants: { some: { inviteStatus: "DECLINED", inviteRespondedAt: { gte: sevenDaysAgo } } },
                },
                orderBy: { updatedAt: "desc" },
                take: 5,
                select: {
                    id: true,
                    title: true,
                    startAt: true,
                    updatedAt: true,
                    participants: {
                        where: { inviteStatus: "DECLINED", inviteRespondedAt: { gte: sevenDaysAgo } },
                        select: { employeeId: true, guestName: true, inviteNote: true, employee: { select: { name: true } } },
                        take: 3,
                    },
                },
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
                title:   corr.status === "APPROVED" ? "Koreksi Presensi Disetujui" : "Koreksi Presensi Ditolak",
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

        for (const invite of appointmentInvites) {
            notifications.push({
                id:      `appointment-invite-${invite.id}`,
                type:    "appointment",
                title:   "Undangan Meeting",
                message: `${invite.title} — ${invite.room?.name ?? "Meeting Daring"}, ${new Date(invite.startAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`,
                href:    `/employee/appointments/detail/${invite.id}`,
                time:    invite.createdAt.toISOString(),
                isRead:  false,
            });
        }

        // Meeting yang berlangsung hari ini (jadwal WIB hari ini, saya terlibat)
        const todayWib = toWIBDateString(new Date());
        const todaysMeetings = await prisma.meetingAppointment.findMany({
            where: {
                status: "SCHEDULED",
                startAt: { gte: wibDateTimeToDate(todayWib, "00:00"), lte: wibDateTimeToDate(todayWib, "23:59") },
                OR: [
                    { requesterEmployeeId: employeeId },
                    { participants: { some: { employeeId } } },
                ],
            },
            orderBy: { startAt: "asc" },
            take: 3,
            select: {
                id: true,
                title: true,
                startAt: true,
                requester: { select: { name: true } },
                room: { select: { name: true } },
            },
        });
        for (const appt of todaysMeetings) {
            const time = new Date(appt.startAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(":", ".");
            const organizer = appt.requester?.name ? stripGelar(appt.requester.name) : "Penyelenggara";
            notifications.push({
                id:      `appointment-today-${appt.id}`,
                type:    "appointment",
                title:   "Meeting Hari Ini",
                message: `${time} — ${appt.title} oleh ${organizer}${appt.room ? ` @ ${appt.room.name}` : ""}`,
                href:    `/employee/appointments/detail/${appt.id}`,
                time:    new Date(appt.startAt).toISOString(),
                isRead:  false,
            });
        }

        for (const appt of appointmentFollowedCancelled) {
            notifications.push({
                id:      `appointment-follow-${appt.id}`,
                type:    "appointment",
                title:   "Meeting Dibatalkan",
                message: `${appt.title} — ${appt.room?.name ?? "Meeting Daring"}, ${new Date(appt.startAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`,
                href:    `/employee/appointments/detail/${appt.id}`,
                time:    appt.updatedAt.toISOString(),
                isRead:  false,
            });
        }

        for (const appt of appointmentDeclined) {
            const names = appt.participants.map((p) => p.employee?.name ?? p.employeeId ?? p.guestName ?? "Peserta").join(", ");
            const firstNote = appt.participants.find((p) => p.inviteNote)?.inviteNote;
            notifications.push({
                id:      `appointment-declined-${appt.id}`,
                type:    "appointment",
                title:   "Peserta Menolak Undangan Meeting",
                message: `${names} menolak "${appt.title}"${firstNote ? ` — ${firstNote}` : ""}`,
                href:    `/employee/appointments/detail/${appt.id}`,
                time:    appt.updatedAt.toISOString(),
                isRead:  false,
            });
        }

        for (const appt of appointmentOwnCancelled) {
            notifications.push({
                id:      `appointment-${appt.id}`,
                type:    "appointment",
                title:   "Meeting Anda Dibatalkan",
                message: `${appt.title} — ${appt.room?.name ?? "Meeting Daring"}, ${new Date(appt.startAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`,
                href:    `/employee/appointments/detail/${appt.id}`,
                time:    appt.updatedAt.toISOString(),
                isRead:  false,
            });
        }

        // Task meeting: milik sendiri yang mendekati deadline (3 hari) atau overdue.
        // Query ringan khusus bell (bukan DTO penuh) + batas 10 baris.
        const threeDaysAhead = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        const dueSoonRows = await prisma.meetingTaskAssignee.findMany({
            where: { employeeId, status: { in: ["BELUM_DIKERJAKAN", "ON_PROGRESS"] }, task: { isCancelled: false } },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
                status: true,
                task: {
                    select: {
                        id: true,
                        title: true,
                        deadlineHistory: { orderBy: { sequence: "desc" }, take: 1, select: { deadlineDate: true } },
                    },
                },
            },
        });
        let taskNotifCount = 0;
        for (const row of dueSoonRows) {
            if (taskNotifCount >= 3) break;
            const due = row.task.deadlineHistory[0]?.deadlineDate;
            if (!due) continue;
            const dueTime = new Date(due).getTime();
            const isOverdue = Date.now() > dueTime;
            if (dueTime > threeDaysAhead.getTime() && !isOverdue) continue;
            const dueLabel = new Date(due).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
            notifications.push({
                id:      `meeting-task-${row.task.id}`,
                type:    "task",
                title:   isOverdue ? "Task Overdue" : "Task Mendekati Deadline",
                message: `${row.task.title} — deadline ${dueLabel}`,
                href:    `/employee/appointments/tasks?highlight=${row.task.id}`,
                time:    new Date(due).toISOString(),
                isRead:  false,
            });
            taskNotifCount++;
        }

        // Pengajuan perpanjangan task yang menunggu keputusan saya (pemberi)
        const pendingExt = await prisma.meetingTaskExtensionRequest.findMany({
            where: { status: "PENDING", task: { assignerEmployeeId: employeeId, isCancelled: false } },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
                id: true,
                createdAt: true,
                requestedBy: { select: { name: true } },
                task: { select: { id: true, title: true } },
            },
        });
        for (const req of pendingExt) {
            notifications.push({
                id:      `meeting-task-ext-${req.id}`,
                type:    "task",
                title:   "Pengajuan Perpanjangan Task",
                message: `${req.requestedBy?.name ?? "Penerima"} meminta perpanjangan "${req.task.title}"`,
                href:    `/employee/appointments/tasks?highlight=${req.task.id}`,
                time:    req.createdAt.toISOString(),
                isRead:  false,
            });
        }

        // Task baru dari meeting yang baru selesai (7 hari, deadline masih jauh agar tak dobel dengan blok dueSoon)
        const freshTasks = await prisma.meetingTaskAssignee.findMany({
            where: {
                employeeId,
                status: { in: ["BELUM_DIKERJAKAN", "ON_PROGRESS"] },
                task: {
                    isCancelled: false,
                    appointment: { status: "COMPLETED", updatedAt: { gte: sevenDaysAgo } },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
                task: {
                    select: {
                        id: true,
                        title: true,
                        createdAt: true,
                        deadlineHistory: { orderBy: { sequence: "desc" }, take: 1, select: { deadlineDate: true } },
                    },
                },
            },
        });
        for (const row of freshTasks.slice(0, 3)) {
            const due = row.task.deadlineHistory[0]?.deadlineDate;
            if (!due) continue;
            if (new Date(due).getTime() <= threeDaysAhead.getTime()) continue;
            notifications.push({
                id:      `meeting-task-new-${row.task.id}`,
                type:    "task",
                title:   "Task Baru dari Meeting Selesai",
                message: `${row.task.title} — deadline ${new Date(due).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`,
                href:    `/employee/appointments/tasks?highlight=${row.task.id}`,
                time:    row.task.createdAt.toISOString(),
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
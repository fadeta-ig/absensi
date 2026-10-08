import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    AppointmentError,
    cancelAppointment,
    getAppointmentDetail,
    isWig002,
    rescheduleAppointment,
} from "@/lib/services/appointmentService";
import { appointmentCancelSchema, appointmentRescheduleSchema } from "@/lib/validations/validationSchemas";
import { PERMISSIONS } from "@/lib/permissions";
import { sendAppointmentPush, collectAppointmentUserIds } from "@/lib/services/appointmentNotify";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session) && !session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const { id } = await params;
        const data = await getAppointmentDetail(session, id);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentDetailGET", err);
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, appointmentRescheduleSchema);
        if ("error" in result) return result.error;

        const before = (await getAppointmentDetail(session, id).catch(() => null)) as {
            title?: string;
            startAt?: string | Date;
            room?: { name: string } | null;
            requesterEmployeeId?: string | null;
        } | null;
        const data = await rescheduleAppointment(
            session,
            id,
            {
                roomId: result.data.roomId,
                meetingLink: result.data.meetingLink,
                date: result.data.date,
                startTime: result.data.startTime ?? "00:00",
                endTime: result.data.endTime ?? "23:59",
                isFullDay: result.data.isFullDay ?? false,
                changeReason: result.data.changeReason,
                force: result.data.force ?? false,
            },
            { userId: session.userId, username: session.username }
        );
        const isOrganizer = !!before?.requesterEmployeeId && before.requesterEmployeeId === session.employeeId;
        const fmtShort = (v: string | Date | undefined) =>
            v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
        const userIds = await collectAppointmentUserIds(id).catch(() => [] as string[]);
        await sendAppointmentPush(userIds, {
            title: isOrganizer ? "Jadwal Rapat Berubah" : `PIC memindahkan rapat "${before?.title ?? "Anda"}"`,
            body: isOrganizer
                ? result.data.changeReason
                : `${session.name ?? session.username} memindahkan ${fmtShort(before?.startAt)} (${before?.room?.name ?? "Rapat Daring"}) → ${result.data.date} ${result.data.isFullDay ? "seharian penuh" : `${result.data.startTime}-${result.data.endTime}`} WIB. Alasan: ${result.data.changeReason}`,
            tag: `appointment-${id}-rescheduled`,
            url: `/employee/appointments?invite=${id}`,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentReschedulePATCH", err);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, appointmentCancelSchema);
        if ("error" in result) return result.error;

        const data = (await cancelAppointment(session, id, result.data.reason, { userId: session.userId, username: session.username })) as { title?: unknown } | null;
        const userIds = await collectAppointmentUserIds(id).catch(() => [] as string[]);
        await sendAppointmentPush(userIds, {
            title: "Rapat Dibatalkan",
            body: `${typeof data?.title === "string" && data.title ? data.title : "Rapat"} — dibatalkan oleh ${session.name ?? session.username}. Alasan: ${result.data.reason}`,
            tag: `appointment-${id}-cancelled`,
            url: "/employee/appointments",
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentCancelDELETE", err);
    }
}

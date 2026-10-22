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
import { sendAppointmentPush, collectAppointmentUserIds } from "@/lib/services/appointmentNotify";
import { formatWIBDateTime } from "@/lib/timezone";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

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
        const reasonText = result.data.changeReason?.trim() || "Perubahan meeting";
        const asOperator = isWig002(session);
        const data = await rescheduleAppointment(
            session,
            id,
            {
                title: result.data.title,
                agenda: result.data.agenda,
                roomId: result.data.roomId,
                date: result.data.date,
                startTime: result.data.startTime ?? "00:00",
                endTime: result.data.endTime ?? "23:59",
                isFullDay: result.data.isFullDay ?? false,
                participants: result.data.participants,
                changeReason: result.data.changeReason,
                force: asOperator ? (result.data.force ?? false) : false,
            },
            { userId: session.userId, username: session.username }
        );
        const isOrganizer = !!before?.requesterEmployeeId && before.requesterEmployeeId === session.employeeId;
        const fmtShort = (v: string | Date | undefined) =>
            v ? formatWIBDateTime(new Date(v), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
        const userIds = await collectAppointmentUserIds(id).catch(() => [] as string[]);
        await sendAppointmentPush(userIds, {
            title: isOrganizer ? "Jadwal Meeting Berubah" : `WIG002 memindahkan meeting "${before?.title ?? "Anda"}"`,
            body: isOrganizer
                ? reasonText
                : `${session.name ?? session.username} memindahkan ${fmtShort(before?.startAt)} (${before?.room?.name ?? "Meeting Daring"}) → ${result.data.date} ${result.data.isFullDay ? "seharian penuh" : `${result.data.startTime}-${result.data.endTime}`} WIB. Alasan: ${reasonText}`,
            tag: `appointment-${id}-rescheduled`,
            url: `/employee/appointments/detail/${id}`,
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
        let reason: string | undefined = !("error" in result) ? result.data.reason : undefined;
        if (!reason) {
            const qp = new URL(request.url).searchParams.get("reason")?.trim();
            if (qp && qp.length >= 5) reason = qp;
        }
        if (!reason) {
            if ("error" in result) return result.error;
            return NextResponse.json({ error: "Alasan pembatalan minimal 5 karakter." }, { status: 400 });
        }

        const data = (await cancelAppointment(session, id, reason, { userId: session.userId, username: session.username })) as { title?: unknown } | null;
        const userIds = await collectAppointmentUserIds(id).catch(() => [] as string[]);
        await sendAppointmentPush(userIds, {
            title: "Meeting Dibatalkan",
            body: `${typeof data?.title === "string" && data.title ? data.title : "Meeting"} — dibatalkan oleh ${session.name ?? session.username}. Alasan: ${reason}`,
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

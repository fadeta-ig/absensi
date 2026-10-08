import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    AppointmentError,
    createAppointment,
    getAppointments,
    isAppointmentPic,
    isWig002,
} from "@/lib/services/appointmentService";
import { appointmentCreateSchema } from "@/lib/validations/validationSchemas";
import { PERMISSIONS } from "@/lib/permissions";
import { sendAppointmentPush, collectAppointmentUserIds } from "@/lib/services/appointmentNotify";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session) && !session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const page = Number(searchParams.get("page") ?? "1");
        const limit = Number(searchParams.get("limit") ?? "20");
        const result = await getAppointments(session, {
            roomId: searchParams.get("roomId") ?? undefined,
            from: searchParams.get("from") ?? undefined,
            to: searchParams.get("to") ?? undefined,
            status: searchParams.get("status") ?? undefined,
            q: searchParams.get("q") ?? undefined,
            page: Number.isFinite(page) ? page : 1,
            limit: Number.isFinite(limit) ? limit : 20,
        });
        return NextResponse.json({ success: true, ...result });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, appointmentCreateSchema);
        if ("error" in result) return result.error;

        const asOperator =
            isWig002(session) || (await isAppointmentPic(session).catch(() => false));
        const created = (await createAppointment(session, {
            title: result.data.title,
            agenda: result.data.agenda ?? null,
            roomId: result.data.roomId ?? null,
            meetingLink: result.data.meetingLink ?? null,
            date: result.data.date,
            startTime: result.data.startTime ?? "00:00",
            endTime: result.data.endTime ?? "23:59",
            isFullDay: result.data.isFullDay ?? false,
            participants: result.data.participants,
            reminderOffsets: result.data.reminderOffsets ?? null,
            force: asOperator ? (result.data.force ?? false) : false,
        }, asOperator)) as { id: string };

        const userIds = await collectAppointmentUserIds(created.id).catch(() => [] as string[]);
        await sendAppointmentPush(userIds, {
            title: "Undangan Rapat Baru",
            body: `${result.data.title} • ${result.data.date} ${result.data.isFullDay ? "seharian penuh" : `${result.data.startTime}-${result.data.endTime}`} WIB`,
            tag: `appointment-${created.id}-created`,
            url: `/employee/appointments?invite=${created.id}`,
        });
        return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentsPOST", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AppointmentError, respondInvite } from "@/lib/services/appointmentService";
import { appointmentInviteResponseSchema } from "@/lib/validations/validationSchemas";
import { sendAppointmentPush, collectRequesterUserId } from "@/lib/services/appointmentNotify";

const ACTION_LABEL: Record<string, string> = { ACCEPT: "Menerima", DECLINE: "Menolak" };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, appointmentInviteResponseSchema);
        if ("error" in result) return result.error;

        const data = (await respondInvite(session, id, result.data.action, result.data.note ?? null, {
            userId: session.userId,
            username: session.username,
        })) as { title: string; requesterEmployeeId: string | null };
        const requesterUsers = await collectRequesterUserId(id).catch(() => [] as string[]);
        const reasonSuffix = result.data.action === "DECLINE" && result.data.note?.trim() ? ` — ${result.data.note.trim()}` : "";
        await sendAppointmentPush(requesterUsers, {
            title: `Peserta ${ACTION_LABEL[result.data.action]} Undangan Meeting`,
            body: `${session.name ?? session.username} ${ACTION_LABEL[result.data.action].toLowerCase()} "${data.title}"${reasonSuffix}`,
            tag: `appointment-${id}-rsvp-${session.employeeId}-${result.data.action}`,
            url: `/employee/appointments/detail/${id}`,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentInviteResponsePOST", err);
    }
}

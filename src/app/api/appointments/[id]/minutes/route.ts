import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { MeetingTaskError, updateMeetingMinutes, isPrivileged } from "@/lib/services/meetingTaskService";
import { meetingMinutesSchema } from "@/lib/validations/validationSchemas";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        const appt = await prisma.meetingAppointment.findUnique({
            where: { id },
            select: {
                id: true,
                minutes: true,
                minutesUpdatedBy: true,
                minutesUpdatedAt: true,
                requesterEmployeeId: true,
                participants: { select: { employeeId: true } },
            },
        });
        if (!appt) return NextResponse.json({ error: "Jadwal meeting tidak ditemukan." }, { status: 404 });
        const allowed =
            (await isPrivileged(session)) ||
            appt.requesterEmployeeId === session.employeeId ||
            appt.participants.some((p) => p.employeeId === session.employeeId);
        if (!allowed) return NextResponse.json({ error: "Anda bukan peserta meeting ini." }, { status: 403 });
        return NextResponse.json({ success: true, data: appt });
    } catch (err) {
        return serverErrorResponse("MeetingMinutesGET", err);
    }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, meetingMinutesSchema);
        if ("error" in result) return result.error;

        const data = await updateMeetingMinutes(session, id, result.data, { userId: session.userId, username: session.username });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingMinutesPUT", err);
    }
}

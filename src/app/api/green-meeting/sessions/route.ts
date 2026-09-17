import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getOrCreateTodaySession,
    updateMeetingSession,
    canManageGreenMeeting,
    isDateOffDay,
} from "@/lib/services/greenMeetingService";
import { greenMeetingSessionUpdateSchema } from "@/lib/validations/validationSchemas";
import { toWIBDateString } from "@/lib/timezone";
import { z } from "zod";

const sessionPatchSchema = greenMeetingSessionUpdateSchema.extend({
    sessionId: z.string().min(1, "Session ID wajib diisi"),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get("date") || toWIBDateString();

        const meetingSession = await getOrCreateTodaySession(dateParam, session.username);
        const offDayInfo = await isDateOffDay(new Date(`${dateParam}T00:00:00.000Z`));

        return NextResponse.json({
            session: meetingSession,
            offDayInfo,
        });
    } catch (err) {
        return serverErrorResponse("GreenMeetingSessionsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        let dateParam = toWIBDateString();
        try {
            const body = await request.json();
            if (body && typeof body.date === "string") {
                dateParam = body.date;
            }
        } catch {
            // No body provided, use today's date
        }

        const meetingSession = await getOrCreateTodaySession(dateParam, session.username);
        return NextResponse.json(meetingSession, { status: 201 });
    } catch (err) {
        return serverErrorResponse("GreenMeetingSessionsPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const isManager = await canManageGreenMeeting(session);
    if (!isManager) return forbiddenResponse();

    try {
        const result = await validateBody(request, sessionPatchSchema);
        if ("error" in result) return result.error;

        const { sessionId, ...data } = result.data;
        const updated = await updateMeetingSession(sessionId, data);
        return NextResponse.json(updated);
    } catch (err) {
        return serverErrorResponse("GreenMeetingSessionsPATCH", err);
    }
}

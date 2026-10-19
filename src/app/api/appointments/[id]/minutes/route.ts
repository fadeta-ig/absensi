import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    MeetingTaskError,
    deleteMeetingMinutes,
    getMeetingMinutes,
    isPrivileged,
    setMeetingNotulis,
    updateMeetingMinutes,
} from "@/lib/services/meetingTaskService";
import {
    meetingMinutesDeleteSchema,
    meetingMinutesSchema,
    meetingNotulisSchema,
} from "@/lib/validations/validationSchemas";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !(await isPrivileged(session))) return forbiddenResponse();

    try {
        const { id } = await params;
        const data = await getMeetingMinutes(session, id);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !(await isPrivileged(session))) return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, meetingNotulisSchema);
        if ("error" in result) return result.error;

        const data = await setMeetingNotulis(session, id, result.data.notulisEmployeeId, {
            userId: session.userId,
            username: session.username,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingMinutesNotulisPATCH", err);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        let reasonPayload: { changeReason?: string } = {};
        try {
            const rawText = await request.text();
            if (rawText.trim()) {
                const parsed = meetingMinutesDeleteSchema.safeParse(JSON.parse(rawText));
                if (!parsed.success) {
                    const firstIssue = parsed.error.issues[0]?.message ?? "Input tidak valid.";
                    return NextResponse.json({ error: firstIssue }, { status: 400 });
                }
                reasonPayload = parsed.data;
            }
        } catch {
            return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
        }

        const data = await deleteMeetingMinutes(session, id, reasonPayload, {
            userId: session.userId,
            username: session.username,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingMinutesDELETE", err);
    }
}

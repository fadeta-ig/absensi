import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AppointmentError, isWig002, setMeetingLeader } from "@/lib/services/appointmentService";
import { meetingLeaderSchema } from "@/lib/validations/validationSchemas";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();
    try {
        const { id } = await params;
        const result = await validateBody(request, meetingLeaderSchema);
        if ("error" in result) return result.error;
        const data = await setMeetingLeader(session, id, result.data.leaderEmployeeId, { userId: session.userId, username: session.username });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof AppointmentError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        return serverErrorResponse("MeetingLeaderPATCH", err);
    }
}

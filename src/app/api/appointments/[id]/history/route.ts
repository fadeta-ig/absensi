import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getMeetingHistory } from "@/lib/services/meetingHistoryService";
import { MeetingTaskError } from "@/lib/services/meetingTaskService";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        const history = await getMeetingHistory(session, id);
        return NextResponse.json({ success: true, data: history }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingHistoryGET", err);
    }
}

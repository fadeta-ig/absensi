import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { MeetingTaskError, getMyMeetingTasks } from "@/lib/services/meetingTaskService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const tasks = await getMyMeetingTasks(session, {
            status: searchParams.get("status") ?? undefined,
            overdue: searchParams.get("overdue") === "1",
        });
        return NextResponse.json({ success: true, data: tasks });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MyMeetingTasksGET", err);
    }
}

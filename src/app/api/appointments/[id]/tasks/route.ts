import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    MeetingTaskError,
    createMeetingTask,
    getTasksForMeeting,
} from "@/lib/services/meetingTaskService";
import { meetingTaskCreateSchema } from "@/lib/validations/validationSchemas";
import { sendAppointmentPush, collectMeetingTaskUserIds } from "@/lib/services/appointmentNotify";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        const tasks = await getTasksForMeeting(session, id);
        return NextResponse.json({ success: true, data: tasks });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTasksGET", err);
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, meetingTaskCreateSchema);
        if ("error" in result) return result.error;

        const task = await createMeetingTask(session, id, result.data, { userId: session.userId, username: session.username });

        const userIds = await collectMeetingTaskUserIds(task.id);
        await sendAppointmentPush(userIds, {
            title: "Task Meeting Baru",
            body: `${task.title} — deadline ${task.activeDeadline?.date ?? "-"}`,
            tag: `meeting-task-${task.id}`,
            url: `/employee/appointments/tasks?highlight=${task.id}`,
        });

        return NextResponse.json({ success: true, data: task }, { status: 201 });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTasksPOST", err);
    }
}

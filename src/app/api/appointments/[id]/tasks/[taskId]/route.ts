import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, parseJsonBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    MeetingTaskError,
    updateMyTaskStatus,
    extendTaskDeadline,
    cancelMeetingTask,
} from "@/lib/services/meetingTaskService";
import {
    meetingTaskStatusSchema,
    meetingTaskExtendSchema,
    meetingTaskCancelSchema,
} from "@/lib/validations/validationSchemas";
import { sendAppointmentPush, collectMeetingTaskUserIds } from "@/lib/services/appointmentNotify";
import { z } from "zod";

const actionSchema = z.object({ action: z.enum(["status", "extend", "cancel"]) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { taskId } = await params;
        const raw = await parseJsonBody(request, "MeetingTaskPATCH");
        if ("error" in raw) return raw.error;

        const actionResult = await validateBody(request, actionSchema, raw.data);
        if ("error" in actionResult) return actionResult.error;
        const action = actionResult.data.action;

        if (action === "status") {
            const parsed = await validateBody(request, meetingTaskStatusSchema, raw.data);
            if ("error" in parsed) return parsed.error;
            const task = await updateMyTaskStatus(session, taskId, parsed.data.status, { userId: session.userId, username: session.username });
            return NextResponse.json({ success: true, data: task });
        }

        if (action === "extend") {
            const parsed = await validateBody(request, meetingTaskExtendSchema, raw.data);
            if ("error" in parsed) return parsed.error;
            const task = await extendTaskDeadline(session, taskId, parsed.data, { userId: session.userId, username: session.username });
            const userIds = await collectMeetingTaskUserIds(task.id);
            await sendAppointmentPush(userIds, {
                title: "Deadline Task Diperpanjang",
                body: `${task.title} — deadline baru ${task.activeDeadline?.date ?? "-"}`,
                tag: `meeting-task-${task.id}-ext-${task.extensionsCount}`,
                url: `/employee/appointments/tasks?highlight=${task.id}`,
            });
            return NextResponse.json({ success: true, data: task });
        }

        const parsed = await validateBody(request, meetingTaskCancelSchema, raw.data);
        if ("error" in parsed) return parsed.error;
        const task = await cancelMeetingTask(session, taskId, parsed.data.reason, { userId: session.userId, username: session.username });
        return NextResponse.json({ success: true, data: task });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTaskPATCH", err);
    }
}

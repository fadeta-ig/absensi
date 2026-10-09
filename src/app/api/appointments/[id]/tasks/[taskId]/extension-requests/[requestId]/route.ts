import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { MeetingTaskError, decideTaskExtension } from "@/lib/services/meetingTaskService";
import { meetingTaskExtensionDecideSchema } from "@/lib/validations/validationSchemas";
import { sendAppointmentPush, collectMeetingTaskUserIds } from "@/lib/services/appointmentNotify";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string; requestId: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { requestId } = await params;
        const parsed = await validateBody(request, meetingTaskExtensionDecideSchema);
        if ("error" in parsed) return parsed.error;

        const task = await decideTaskExtension(session, requestId, parsed.data.decision, { userId: session.userId, username: session.username });

        if (parsed.data.decision === "APPROVED") {
            const userIds = await collectMeetingTaskUserIds(task.id);
            await sendAppointmentPush(userIds, {
                title: "Perpanjangan Task Disetujui",
                body: `${task.title} — deadline baru ${task.activeDeadline?.date ?? "-"}`,
                tag: `meeting-task-${task.id}-ext-${task.extensionsCount}`,
                url: `/employee/appointments/tasks?highlight=${task.id}`,
            });
        }

        return NextResponse.json({ success: true, data: task });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTaskExtDecidePATCH", err);
    }
}

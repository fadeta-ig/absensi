import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    MeetingTaskError,
    requestTaskExtension,
    getPendingExtensionRequests,
} from "@/lib/services/meetingTaskService";
import { isWig002 } from "@/lib/services/appointmentService";
import { meetingTaskExtensionRequestSchema } from "@/lib/validations/validationSchemas";
import { sendAppointmentPush, collectUserIdsForEmployees } from "@/lib/services/appointmentNotify";
import { getTaskPushInfo } from "@/lib/services/meetingTaskService";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

    try {
        const { taskId } = await params;
        const list = await getPendingExtensionRequests(session, taskId);
        return NextResponse.json({ success: true, data: list });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTaskExtGET", err);
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

    try {
        const { taskId } = await params;
        const result = await validateBody(request, meetingTaskExtensionRequestSchema);
        if ("error" in result) return result.error;

        const created = await requestTaskExtension(session, taskId, result.data, { userId: session.userId, username: session.username });

        // Beritahu pemberi task agar segera diputuskan
        const task = await getTaskPushInfo(taskId);
        const userIds = await collectUserIdsForEmployees([...(task ? [task.assignerEmployeeId] : [])]);
        await sendAppointmentPush(userIds, {
            title: "Pengajuan Perpanjangan Task",
            body: `${created.requestedBy?.name ?? "Penerima"} meminta perpanjangan "${task?.title ?? "task"}" ke ${result.data.proposedDate}`,
            tag: `meeting-task-ext-req-${created.id}`,
            url: `/employee/appointments/tasks?highlight=${taskId}`,
        });

        return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTaskExtPOST", err);
    }
}

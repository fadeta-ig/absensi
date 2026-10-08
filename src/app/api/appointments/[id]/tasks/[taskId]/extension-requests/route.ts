import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    MeetingTaskError,
    requestTaskExtension,
    getPendingExtensionRequests,
} from "@/lib/services/meetingTaskService";
import { meetingTaskExtensionRequestSchema } from "@/lib/validations/validationSchemas";
import { sendAppointmentPush, collectUserIdsForEmployees } from "@/lib/services/appointmentNotify";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

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
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { taskId } = await params;
        const result = await validateBody(request, meetingTaskExtensionRequestSchema);
        if ("error" in result) return result.error;

        const created = await requestTaskExtension(session, taskId, result.data, { userId: session.userId, username: session.username });

        // Beritahu pemberi task + PIC agar segera diputuskan
        const task = await prisma.meetingTask.findUnique({ where: { id: taskId }, select: { assignerEmployeeId: true, title: true } });
        const { getAppointmentPicIds } = await import("@/lib/services/appointmentService");
        const picIds = await getAppointmentPicIds().catch(() => [] as string[]);
        const userIds = await collectUserIdsForEmployees([...(task ? [task.assignerEmployeeId] : []), ...picIds]);
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

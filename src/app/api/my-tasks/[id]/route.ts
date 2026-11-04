import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, parseJsonBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { WorkTaskError, getWorkTaskById } from "@/lib/services/workTaskService";
import { MeetingTaskError, extendTaskDeadline, cancelMeetingTask, editMeetingTask } from "@/lib/services/meetingTaskService";
import { isWig002 } from "@/lib/services/appointmentService";
import { meetingTaskExtendSchema, meetingTaskCancelSchema, meetingTaskEditSchema, operationalTaskRespondSchema } from "@/lib/validations/validationSchemas";
import { respondToOperationalTask } from "@/lib/services/operationalTaskService";
import { sendAppointmentPush, collectMeetingTaskUserIds, collectUserIdsForEmployees } from "@/lib/services/appointmentNotify";
import { z } from "zod";

const actionSchema = z.object({ action: z.enum(["extend", "cancel", "edit", "accept", "reject"]) });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();
    try {
        const { id } = await params;
        const task = await getWorkTaskById(session, id);
        return NextResponse.json({ success: true, data: task });
    } catch (err) {
        if (err instanceof WorkTaskError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        return serverErrorResponse("MyTaskDetailGET", err);
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();
    try {
        const { id: taskId } = await params;
        const raw = await parseJsonBody(request, "MyTaskPATCH");
        if ("error" in raw) return raw.error;
        const actionResult = await validateBody(request, actionSchema, raw.data);
        if ("error" in actionResult) return actionResult.error;
        const action = actionResult.data.action;

        if (action === "accept" || action === "reject") {
            const rawReason = (raw.data as { reason?: unknown }).reason;
            const parsed = await validateBody(request, operationalTaskRespondSchema, {
                decision: action === "accept" ? "TERIMA" : "TOLAK",
                reason: typeof rawReason === "string" ? rawReason : null,
            });
            if ("error" in parsed) return parsed.error;
            const task = await respondToOperationalTask(session, taskId, parsed.data, { userId: session.userId, username: session.username });
            const giverUserIds = await collectUserIdsForEmployees([task.assigner.employeeId]).catch(() => [] as string[]);
            await sendAppointmentPush(giverUserIds, {
                title: action === "accept" ? "Penerima menerima tugas Anda" : "Penerima menolak tugas Anda",
                body: `${task.title} — ${action === "accept" ? "penerima sudah menyetujui dan mulai mengerjakan" : "penerima menolak tugas ini"}`,
                tag: `operational-task-${task.id}-respond`,
                url: `/employee/my-tasks/${task.id}`,
            });
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
                url: `/employee/my-tasks/${task.id}`,
            });
            return NextResponse.json({ success: true, data: task });
        }
        if (action === "edit") {
            const parsed = await validateBody(request, meetingTaskEditSchema, raw.data);
            if ("error" in parsed) return parsed.error;
            const task = await editMeetingTask(session, taskId, parsed.data, { userId: session.userId, username: session.username });
            return NextResponse.json({ success: true, data: task });
        }
        const parsed = await validateBody(request, meetingTaskCancelSchema, raw.data);
        if ("error" in parsed) return parsed.error;
        const task = await cancelMeetingTask(session, taskId, parsed.data.reason, { userId: session.userId, username: session.username });
        return NextResponse.json({ success: true, data: task });
    } catch (err) {
        if (err instanceof MeetingTaskError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        return serverErrorResponse("MyTaskPATCH", err);
    }
}

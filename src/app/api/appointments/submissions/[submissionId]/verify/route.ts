import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { MeetingTaskError, verifyTaskSubmission } from "@/lib/services/meetingTaskService";
import { isWig002 } from "@/lib/services/appointmentService";
import { meetingTaskSubmissionVerifySchema } from "@/lib/validations/validationSchemas";
import { sendAppointmentPush, collectMeetingTaskUserIds } from "@/lib/services/appointmentNotify";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

    try {
        const { submissionId } = await params;
        const result = await validateBody(request, meetingTaskSubmissionVerifySchema);
        if ("error" in result) return result.error;

        const task = await verifyTaskSubmission(
            session,
            submissionId,
            { decision: result.data.decision, note: result.data.note ?? null, resubmitDue: result.data.resubmitDue ?? null },
            { userId: session.userId, username: session.username }
        );
        const userIds = await collectMeetingTaskUserIds(task.id).catch(() => [] as string[]);
        const approved = result.data.decision === "TERIMA";
        await sendAppointmentPush(userIds, {
            title: approved ? "Task Disetujui Verifikator" : "Task Diminta Revisi",
            body: `${task.title} — ${approved ? "sudah diverifikasi" : "perlu diperbaiki, lihat catatan revisi"}`,
            tag: `meeting-task-${task.id}-verdict`,
            url: `/employee/appointments/tasks?highlight=${task.id}`,
        });
        return NextResponse.json({ success: true, data: task });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTaskVerifyPATCH", err);
    }
}

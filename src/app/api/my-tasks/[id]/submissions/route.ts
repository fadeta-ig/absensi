import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, parseFormData, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { MeetingTaskError, submitTaskWork, getTaskPushInfo, TASK_SUBMISSION_MAX_FILES, TASK_SUBMISSION_ALLOWED_MIME } from "@/lib/services/meetingTaskService";
import { isWig002 } from "@/lib/services/appointmentService";
import { sendAppointmentPush, collectUserIdsForEmployees } from "@/lib/services/appointmentNotify";
import { getUploadLimit, DEFAULT_UPLOAD_LIMITS_MB } from "@/lib/services/appSettingsService";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();
    try {
        const { id: taskId } = await params;
        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(contentLength) && contentLength > 0) {
            const limitMb = await getUploadLimit("upload.taskSubmission.maxMb").catch(
                () => DEFAULT_UPLOAD_LIMITS_MB["upload.taskSubmission.maxMb"]
            );
            const maxBytes = Math.floor(limitMb * 1024 * 1024) * TASK_SUBMISSION_MAX_FILES + 2 * 1024 * 1024;
            if (contentLength > maxBytes) {
                return NextResponse.json({ error: `Total lampiran melebihi batas (${TASK_SUBMISSION_MAX_FILES} file @ ${limitMb} MB).` }, { status: 413 });
            }
        }
        const parsedForm = await parseFormData(request, "MyTaskSubmissionPOST");
        if ("error" in parsedForm) return parsedForm.error;
        const form = parsedForm.data;
        const rawNote = form.get("note");
        const note = typeof rawNote === "string" ? rawNote : null;
        const files: Array<{ buffer: Buffer; originalName: string; mimeType: string; size: number }> = [];
        for (const [key, value] of form.entries()) {
            if (key !== "files" && key !== "file") continue;
            if (!(value instanceof File) || value.size === 0) continue;
            if (!(TASK_SUBMISSION_ALLOWED_MIME as readonly string[]).includes(value.type)) {
                return NextResponse.json({ error: "Format file tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF." }, { status: 400 });
            }
            files.push({ buffer: Buffer.from(await value.arrayBuffer()), originalName: value.name || "lampiran", mimeType: value.type, size: value.size });
        }
        const task = await submitTaskWork(session, taskId, { note, files }, { userId: session.userId, username: session.username });
        const info = await getTaskPushInfo(taskId);
        if (info) {
            const userIds = await collectUserIdsForEmployees([info.assignerEmployeeId]).catch(() => [] as string[]);
            await sendAppointmentPush(userIds, {
                title: "Hasil Task Perlu Verifikasi",
                body: `${info.title} — menunggu verifikasi Anda`,
                tag: `meeting-task-${taskId}-verify`,
                url: `/employee/my-tasks/${taskId}`,
            });
        }
        return NextResponse.json({ success: true, data: task }, { status: 201 });
    } catch (err) {
        if (err instanceof MeetingTaskError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        return serverErrorResponse("MyTaskSubmissionPOST", err);
    }
}

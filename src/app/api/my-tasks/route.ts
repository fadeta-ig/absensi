import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { WorkTaskError, getMyWorkTasks } from "@/lib/services/workTaskService";
import { createOperationalTask } from "@/lib/services/operationalTaskService";
import { MeetingTaskError } from "@/lib/services/meetingTaskService";
import { operationalTaskCreateSchema } from "@/lib/validations/validationSchemas";
import { sendAppointmentPush, collectUserIdsForEmployees } from "@/lib/services/appointmentNotify";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();
    try {
        const sp = request.nextUrl.searchParams;
        const tasks = await getMyWorkTasks(session, {
            status: sp.get("status") ?? undefined,
            overdue: sp.get("overdue") === "1",
            sourceType: sp.get("source") ?? undefined,
        });
        return NextResponse.json({ success: true, data: tasks });
    } catch (err) {
        if (err instanceof WorkTaskError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        return serverErrorResponse("MyTasksGET", err);
    }
}

/** Submodul Tambah Task: buat task Operasional (pemberi = karyawan login). */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();
    try {
        const result = await validateBody(request, operationalTaskCreateSchema);
        if ("error" in result) return result.error;
        const task = await createOperationalTask(session, result.data, { userId: session.userId, username: session.username });
        // Push setelah commit ke para penerima (menunggu persetujuan mereka).
        const userIds = await collectUserIdsForEmployees(task.assignees.map((a) => a.employeeId)).catch(() => [] as string[]);
        await sendAppointmentPush(userIds, {
            title: "Tugas baru menunggu persetujuan",
            body: `${task.title} — terima tugas untuk mulai mengerjakan`,
            tag: `operational-task-${task.id}-approval`,
            url: `/employee/my-tasks/${task.id}`,
        });
        return NextResponse.json({ success: true, data: task }, { status: 201 });
    } catch (err) {
        if (err instanceof MeetingTaskError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        return serverErrorResponse("MyTasksPOST", err);
    }
}

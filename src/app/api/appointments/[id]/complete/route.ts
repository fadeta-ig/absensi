import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AppointmentError, completeAppointment } from "@/lib/services/appointmentService";
import { getUnsubmittedOpenTasks, claimSubmittedTasks } from "@/lib/services/meetingTaskService";
import { sendAppointmentPush, collectUserIdsForEmployees } from "@/lib/services/appointmentNotify";
import { isWig002 } from "@/lib/services/appointmentService";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

    try {
        const { id } = await params;
        await completeAppointment(session, id, { userId: session.userId, username: session.username });

        // Submit semua task open ke system (push sekali per penerima)
        const pending = await getUnsubmittedOpenTasks([id]);
        const claimed = await claimSubmittedTasks(pending);
        let submitted = 0;
        for (const item of claimed) {
            const userIds = await collectUserIdsForEmployees(item.employeeIds);
            await sendAppointmentPush(userIds, {
                title: "Task Baru dari Meeting Selesai",
                body: `${item.title} — deadline ${item.activeDeadlineDate}`,
                tag: `meeting-task-${item.taskId}-submitted`,
                url: `/employee/appointments/tasks?highlight=${item.taskId}`,
            });
            submitted += item.employeeIds.length;
        }

        return NextResponse.json({ success: true, submitted });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentCompletePOST", err);
    }
}

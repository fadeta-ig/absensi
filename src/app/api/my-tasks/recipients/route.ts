import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { listOperationalTaskRecipients } from "@/lib/services/operationalTaskService";
import { MeetingTaskError } from "@/lib/services/meetingTaskService";

/**
 * GET /api/my-tasks/recipients — direktori penerima Task Operasional:
 * seluruh karyawan AKTIF (field minimal, tanpa data HR sensitif) untuk
 * picker penerima di submodul Tambah Task.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();
    try {
        const recipients = await listOperationalTaskRecipients(session);
        return NextResponse.json({ success: true, data: recipients });
    } catch (err) {
        if (err instanceof MeetingTaskError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        return serverErrorResponse("MyTaskRecipientsGET", err);
    }
}

import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { WorkTaskError, getWorkTasksAwaitingMyVerification } from "@/lib/services/workTaskService";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();
    try {
        const tasks = await getWorkTasksAwaitingMyVerification(session);
        return NextResponse.json({ success: true, data: tasks });
    } catch (err) {
        if (err instanceof WorkTaskError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        return serverErrorResponse("MyTaskVerificationsGET", err);
    }
}

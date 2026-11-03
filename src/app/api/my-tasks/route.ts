import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { WorkTaskError, getMyWorkTasks } from "@/lib/services/workTaskService";

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

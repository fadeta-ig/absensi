import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { CleaningError } from "@/lib/services/cleaningService";
import {
    listEmployeeApprovalTasks,
    getEmployeeApprovalDetail,
} from "@/lib/services/cleaningApprovalService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        return forbiddenResponse();
    }

    try {
        const { searchParams } = new URL(request.url);
        const approvalId = searchParams.get("approvalId");

        if (approvalId) {
            const detail = await getEmployeeApprovalDetail(session, approvalId);
            return NextResponse.json({ success: true, data: detail });
        }

        const monthWib = searchParams.get("monthWib") || undefined;
        const status = searchParams.get("status") || undefined;
        const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
        const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;

        const result = await listEmployeeApprovalTasks(session, {
            monthWib,
            status,
            page,
            limit,
        });

        return NextResponse.json({ success: true, ...result });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeCleaningApprovalsGET", err);
    }
}

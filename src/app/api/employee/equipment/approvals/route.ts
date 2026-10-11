import { NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { EquipmentError, getPendingEquipmentApprovals } from "@/lib/services/equipmentService";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const approvals = await getPendingEquipmentApprovals(session);
        return NextResponse.json({ success: true, data: approvals });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentApprovalsGET", err);
    }
}

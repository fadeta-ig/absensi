import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { EquipmentError, getApprovalQueue } from "@/lib/services/equipmentService";

/**
 * GET /api/employee/equipment/approvals/pending-approval — antrean
 * approval final (semua DONE, terbaru di atas). Khusus approver.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const data = await getApprovalQueue(session);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentPendingApprovalGET", err);
    }
}

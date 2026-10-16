import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { EquipmentError, approveEquipmentInspection } from "@/lib/services/equipmentService";
import { equipmentApproveSchema } from "@/lib/validations/validationSchemas";

/**
 * POST /api/employee/equipment/approvals/approve
 * Approver final (atasan lapangan, tunggal via setting WIG002) menyetujui
 * inspeksi: DONE → APPROVED. Satu arah, tanpa reject.
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentApproveSchema);
        if ("error" in result) return result.error;

        const data = await approveEquipmentInspection(session, result.data.inspectionId);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EquipmentApprovePOST", err);
    }
}

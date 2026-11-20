import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEmployeeEquipmentAuth } from "@/lib/middleware/equipmentGuard";
import { EquipmentError, approveEquipmentInspection } from "@/lib/services/equipmentService";
import { equipmentApproveSchema } from "@/lib/validations/validationSchemas";

/**
 * POST /api/employee/equipment/approvals/approve
 * Approver final (dinamis maks 5 per perusahaan via setting WIG002, kuorum 1)
 * menyetujui inspeksi: DONE → APPROVED. Satu arah, tanpa reject.
 */
export async function POST(request: NextRequest) {
    const auth = await requireEmployeeEquipmentAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

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

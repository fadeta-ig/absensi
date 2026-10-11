import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { sanitizeString } from "@/lib/middleware/sanitize";
import { EquipmentError, checkEquipmentDone } from "@/lib/services/equipmentService";
import { equipmentQcDoneSchema } from "@/lib/validations/validationSchemas";

/**
 * POST /api/employee/equipment/approvals/done
 * QC menandai inspeksi SELESAI. Tanpa paraf/tanda tangan — cukup klik + catatan opsional.
 * Riwayat mencatat "checked by QC - [nama]".
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentQcDoneSchema);
        if ("error" in result) return result.error;

        const note =
            typeof result.data.note === "string" && result.data.note.trim()
                ? sanitizeString(result.data.note)
                : null;
        const data = await checkEquipmentDone(session, result.data.inspectionId, note);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EquipmentQcDonePOST", err);
    }
}

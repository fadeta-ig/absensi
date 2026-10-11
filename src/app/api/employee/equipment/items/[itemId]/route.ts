import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { EquipmentError, updateEquipmentInspectionItem } from "@/lib/services/equipmentService";
import { equipmentItemUpdateSchema } from "@/lib/validations/validationSchemas";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ itemId: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { itemId } = await params;
        if (!itemId || typeof itemId !== "string") {
            return NextResponse.json({ error: "Item inspeksi tidak ditemukan." }, { status: 404 });
        }

        const result = await validateBody(request, equipmentItemUpdateSchema);
        if ("error" in result) return result.error;

        const inspection = await updateEquipmentInspectionItem(session, itemId, result.data);
        return NextResponse.json({ success: true, data: inspection });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentItemPATCH", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEquipmentPortalAuth } from "@/lib/middleware/equipmentGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { EquipmentError, updateEquipmentInspectionItem } from "@/lib/services/equipmentService";
import { equipmentItemUpdateSchema } from "@/lib/validations/validationSchemas";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ itemId: string }> }
) {
    const auth = await requireEquipmentPortalAuth(PERMISSIONS.EQUIPMENT_EXECUTE);
    if (auth.error) return auth.error;
    const { session } = auth;

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

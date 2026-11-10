import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { deleteEquipmentProduct, updateEquipmentProduct } from "@/lib/services/equipmentProductService";
import { EquipmentError } from "@/lib/services/equipmentService";
import { equipmentProductUpdateSchema } from "@/lib/validations/validationSchemas";
import { isWig002 } from "@/lib/services/cleaningService";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, equipmentProductUpdateSchema);
    if ("error" in validation) return validation.error;

    try {
        const { id } = await params;
        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        }
        const result = await updateEquipmentProduct(session, id, validation.data);
        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentProductPATCH", err);
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { id } = await params;
        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        }
        const result = await deleteEquipmentProduct(session, id);
        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentProductDELETE", err);
    }
}

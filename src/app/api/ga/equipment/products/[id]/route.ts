import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { deleteEquipmentProduct, updateEquipmentProduct } from "@/lib/services/equipmentProductService";
import { EquipmentError } from "@/lib/services/equipmentService";
import { equipmentProductUpdateSchema } from "@/lib/validations/validationSchemas";
import { requireGaEquipmentAdminAuth } from "@/lib/middleware/equipmentGuard";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireGaEquipmentAdminAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

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
    const auth = await requireGaEquipmentAdminAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

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

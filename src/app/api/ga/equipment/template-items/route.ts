import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    createEquipmentTemplateItem,
    updateEquipmentTemplateItem,
    deleteEquipmentTemplateItem,
    EquipmentError,
} from "@/lib/services/equipmentService";
import { isWig002 } from "@/lib/services/cleaningService";
import { equipmentTemplateItemCreateSchema, equipmentTemplateItemUpdateSchema } from "@/lib/validations/validationSchemas";

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentTemplateItemCreateSchema);
        if ("error" in result) return result.error;

        const item = await createEquipmentTemplateItem(session, result.data);
        return NextResponse.json({ success: true, data: item }, { status: 201 });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentTemplateItemsPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentTemplateItemUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;
        const item = await updateEquipmentTemplateItem(session, id, data);
        return NextResponse.json({ success: true, data: item });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentTemplateItemsPATCH", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = (searchParams.get("id") ?? "").trim();
        if (!id) {
            return NextResponse.json({ error: "Parameter id wajib diisi." }, { status: 400 });
        }
        const result = await deleteEquipmentTemplateItem(session, id);
        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentTemplateItemsDELETE", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getProductToolChecklist,
    setProductTools,
} from "@/lib/services/equipmentProductService";
import { EquipmentError } from "@/lib/services/equipmentService";
import { isWig002 } from "@/lib/services/cleaningService";
import { equipmentProductToolsSchema } from "@/lib/validations/validationSchemas";

async function resolveId(params: Promise<{ id: string }>): Promise<string | null> {
    const { id } = await params;
    return id && typeof id === "string" ? id : null;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const id = await resolveId(params);
        if (!id) return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        const checklist = await getProductToolChecklist(session, id);
        return NextResponse.json({ success: true, data: checklist });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentProductToolsGET", err);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const id = await resolveId(params);
        if (!id) return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        const result = await validateBody(request, equipmentProductToolsSchema);
        if ("error" in result) return result.error;

        const checklist = await setProductTools(session, id, result.data.equipmentUnitIds);
        return NextResponse.json({ success: true, data: checklist });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentProductToolsPOST", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getEquipmentUnits,
    createEquipmentUnit,
    updateEquipmentUnit,
    requireWig002OrTopViewer,
    EquipmentError,
} from "@/lib/services/equipmentService";
import { isWig002 } from "@/lib/services/cleaningService";
import { equipmentUnitCreateSchema, equipmentUnitUpdateSchema } from "@/lib/validations/validationSchemas";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        // Baca master boleh top reviewer (dropdown rekap); tulis tetap WIG002 (di service).
        // Tanpa syarat employeeId: WIG002 belum tentu punya employee.
        await requireWig002OrTopViewer(session);
        const { searchParams } = new URL(request.url);
        const activeOnly = searchParams.get("activeOnly") === "1";
        const units = await getEquipmentUnits(session, activeOnly);
        return NextResponse.json({ success: true, data: units });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentUnitsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentUnitCreateSchema);
        if ("error" in result) return result.error;

        const unit = await createEquipmentUnit(session, result.data);
        return NextResponse.json({ success: true, data: unit }, { status: 201 });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentUnitsPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentUnitUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;
        const unit = await updateEquipmentUnit(session, id, data);
        return NextResponse.json({ success: true, data: unit });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentUnitsPATCH", err);
    }
}

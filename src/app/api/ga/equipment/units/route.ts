import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getEquipmentUnits,
    createEquipmentUnit,
    updateEquipmentUnit,
    requireEquipmentUnitsReadAccess,
    EquipmentError,
} from "@/lib/services/equipmentService";
import { requireEquipmentSettingsAuth } from "@/lib/middleware/equipmentGuard";
import { equipmentUnitCreateSchema, equipmentUnitUpdateSchema } from "@/lib/validations/validationSchemas";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        // Baca master boleh WIG002, top reviewer (dropdown rekap), atau PIC delegasi unit/produk/penugasan.
        // Tanpa syarat employeeId: WIG002 belum tentu punya employee.
        await requireEquipmentUnitsReadAccess(session);
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
    const auth = await requireEquipmentSettingsAuth("units");
    if (auth.error) return auth.error;
    const { session } = auth;

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
    const auth = await requireEquipmentSettingsAuth("units");
    if (auth.error) return auth.error;
    const { session } = auth;

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

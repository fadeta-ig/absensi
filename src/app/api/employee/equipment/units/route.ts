import { NextRequest, NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEmployeeEquipmentAuth } from "@/lib/middleware/equipmentGuard";
import { EquipmentError, getMyEquipmentUnits } from "@/lib/services/equipmentService";

export async function GET(request: NextRequest) {
    const auth = await requireEmployeeEquipmentAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("productId")?.trim() || undefined;
        const units = await getMyEquipmentUnits(session, { productId });
        return NextResponse.json({ success: true, data: units });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentUnitsGET", err);
    }
}

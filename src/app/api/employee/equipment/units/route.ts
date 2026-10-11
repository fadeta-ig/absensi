import { NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { EquipmentError, getMyEquipmentUnits } from "@/lib/services/equipmentService";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const units = await getMyEquipmentUnits(session);
        return NextResponse.json({ success: true, data: units });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentUnitsGET", err);
    }
}

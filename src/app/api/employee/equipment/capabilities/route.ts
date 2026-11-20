import { NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEmployeeEquipmentAuth } from "@/lib/middleware/equipmentGuard";
import { EquipmentError, getEmployeeEquipmentCapabilities } from "@/lib/services/equipmentService";

/**
 * GET /api/employee/equipment/capabilities — kapabilitas ringan
 * untuk gating menu employee (tanpa fetch berat). Guard: employee-self.
 */
export async function GET() {
    const auth = await requireEmployeeEquipmentAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const capabilities = await getEmployeeEquipmentCapabilities(session);
        return NextResponse.json({ success: true, data: capabilities });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentCapabilitiesGET", err);
    }
}

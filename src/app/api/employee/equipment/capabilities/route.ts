import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { EquipmentError, getEmployeeEquipmentCapabilities } from "@/lib/services/equipmentService";

/**
 * GET /api/employee/equipment/capabilities — kapabilitas ringan
 * untuk gating menu employee (tanpa fetch berat). Guard: employee-self.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        return forbiddenResponse();
    }

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

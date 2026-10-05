import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { getEmployeeCleaningCapabilities } from "@/lib/services/cleaningApprovalService";

/**
 * GET /api/employee/cleaning/capabilities — kapabilitas cleaning ringan
 * untuk gating menu employee (tanpa fetch berat). Guard: employee-self.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        return forbiddenResponse();
    }

    try {
        const capabilities = await getEmployeeCleaningCapabilities(session);
        return NextResponse.json({ success: true, data: capabilities });
    } catch (err) {
        return serverErrorResponse("EmployeeCleaningCapabilitiesGET", err);
    }
}

import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { AppointmentError, getEmployeeMeetingCapabilities } from "@/lib/services/appointmentService";

/**
 * GET /api/employee/meeting-capabilities — kapabilitas ringan
 * untuk gating menu Pantau E-Meeting (tanpa fetch berat). Guard: employee-self.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        return forbiddenResponse();
    }

    try {
        const capabilities = await getEmployeeMeetingCapabilities(session);
        return NextResponse.json({ success: true, data: capabilities });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeMeetingCapabilitiesGET", err);
    }
}

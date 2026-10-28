import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { MeetingTaskError, getKinerjaPantau } from "@/lib/services/meetingTaskService";

/**
 * GET /api/employee/pantau-kinerja — tingkat ketepatan penyelesaian task
 * per karyawan per periode untuk pemantau (baca saja).
 * Param: from, to (YYYY-MM-DD, bawaan bulan berjalan).
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        return forbiddenResponse();
    }

    try {
        const { searchParams } = new URL(request.url);
        const result = await getKinerjaPantau(session, {
            from: searchParams.get("from") ?? undefined,
            to: searchParams.get("to") ?? undefined,
        });
        return NextResponse.json({ success: true, ...result });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeePantauKinerjaGET", err);
    }
}

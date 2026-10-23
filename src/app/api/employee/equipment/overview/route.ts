import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { EquipmentError, getEquipmentRecap } from "@/lib/services/equipmentService";

const STATUSES = ["OPEN", "SUBMITTED", "DONE", "APPROVED"] as const;

/**
 * GET /api/employee/equipment/overview?unitId=&status=&from=&to=
 * Rekap pantauan untuk Top Viewer Equipment (WIG002/atasan).
 * Otorisasi penuh di service (requireWig002OrTopViewer).
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status") ?? undefined;
        if (status && !(STATUSES as readonly string[]).includes(status)) {
            return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
        }
        const data = await getEquipmentRecap(session, {
            unitId: searchParams.get("unitId") ?? undefined,
            status: status as "OPEN" | "SUBMITTED" | "DONE" | "APPROVED" | undefined,
            from: searchParams.get("from") ?? undefined,
            to: searchParams.get("to") ?? undefined,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentOverviewGET", err);
    }
}

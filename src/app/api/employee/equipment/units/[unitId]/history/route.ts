import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { EquipmentError, getUnitInspectionHistory } from "@/lib/services/equipmentService";

/**
 * GET /api/employee/equipment/units/[unitId]/history — riwayat inspeksi
 * satu unit (semua pelaksana) untuk yang ditugaskan di unit itu, QC,
 * topViewer, atau WIG002. Read-only, header ringan.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ unitId: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { unitId } = await params;
        if (!unitId?.trim()) return NextResponse.json({ error: "unitId wajib diisi." }, { status: 400 });
        const data = await getUnitInspectionHistory(session, unitId.trim());
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentUnitHistoryGET", err);
    }
}

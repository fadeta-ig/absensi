import { NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEquipmentPortalAuth } from "@/lib/middleware/equipmentGuard";
import { EquipmentError, getUnitInspectionHistory } from "@/lib/services/equipmentService";

/**
 * GET /api/employee/equipment/units/[unitId]/history — riwayat inspeksi
 * satu unit (semua pelaksana) untuk yang ditugaskan di unit itu, QC,
 * approver, topViewer, atau WIG002. Read-only, header ringan.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ unitId: string }> }) {
    const auth = await requireEquipmentPortalAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

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

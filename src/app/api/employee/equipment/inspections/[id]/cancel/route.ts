import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { EquipmentError, cancelEquipmentInspection } from "@/lib/services/equipmentService";

/**
 * POST /api/employee/equipment/inspections/[id]/cancel — pemulai
 * membatalkan checklist yang masih Berjalan (OPEN → CANCELLED).
 * Riwayat dipertahankan, disembunyikan dari antrean/rekap/terakhir-dicek.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        if (!id?.trim()) return NextResponse.json({ error: "Inspeksi tidak ditemukan." }, { status: 404 });
        const data = await cancelEquipmentInspection(session, id.trim());
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentInspectionCancelPOST", err);
    }
}

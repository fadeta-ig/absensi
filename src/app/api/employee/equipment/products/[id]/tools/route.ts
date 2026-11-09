import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { listProductUnitsForEmployee } from "@/lib/services/equipmentProductService";
import { EquipmentError } from "@/lib/services/equipmentService";

/**
 * GET /api/employee/equipment/products/[id]/tools — daftar alat satu jenis
 * produk untuk employee: SEMUA alat aktif produk tampil; `assigned` true
 * bila employee punya penugasan efektif (global/spesifik) atas alat itu.
 * Alat assigned = bisa eksekusi; sisanya read-only/riwayat.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
        }
        const data = await listProductUnitsForEmployee(session, id);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentProductToolsGET", err);
    }
}

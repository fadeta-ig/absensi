import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { EquipmentError, listQcEvidence, requireWig002OrTopViewer } from "@/lib/services/equipmentService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        // Drill-down rekap untuk WIG002/atasan (read-only).
        await requireWig002OrTopViewer(session);
        const { searchParams } = new URL(request.url);
        const inspectionId = (searchParams.get("inspectionId") ?? "").trim();
        if (!inspectionId) {
            return NextResponse.json({ error: "Parameter inspectionId wajib diisi." }, { status: 400 });
        }
        const data = await listQcEvidence(inspectionId);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentQcEvidenceGET", err);
    }
}

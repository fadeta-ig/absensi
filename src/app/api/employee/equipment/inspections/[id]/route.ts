import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { EquipmentError, getEquipmentInspection } from "@/lib/services/equipmentService";

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
            return NextResponse.json({ error: "Inspeksi tidak ditemukan." }, { status: 404 });
        }
        const inspection = await getEquipmentInspection(session, id);
        return NextResponse.json({ success: true, data: inspection });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentInspectionGET", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002, CleaningError } from "@/lib/services/cleaningService";
import { PERMISSIONS } from "@/lib/permissions";
import { getCleaningPdfExportData } from "@/lib/services/cleaningApprovalService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const isAuthorized = isWig002(session) || session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF);
    if (!isAuthorized) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get("roomId");
        const monthWib = searchParams.get("monthWib") || searchParams.get("month");

        if (!roomId || !monthWib) {
            return NextResponse.json(
                { error: "Parameter roomId dan monthWib wajib diisi." },
                { status: 400 }
            );
        }

        const data = await getCleaningPdfExportData(session, roomId, monthWib);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningExportPdfGET", err);
    }
}

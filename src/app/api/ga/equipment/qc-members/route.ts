import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { EquipmentError, getEquipmentQcMembers, setEquipmentQcMembers } from "@/lib/services/equipmentService";
import { isWig002 } from "@/lib/services/cleaningService";
import { equipmentQcMembersSchema } from "@/lib/validations/validationSchemas";

/**
 * GET/POST /api/ga/equipment/qc-members
 * Daftar employee QC (di-set WIG002 dari data HR). Semua anggota melihat semua antrean.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const ids = await getEquipmentQcMembers();
        return NextResponse.json({ success: true, data: ids });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentQcMembersGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentQcMembersSchema);
        if ("error" in result) return result.error;

        const ids = await setEquipmentQcMembers(session, result.data.employeeIds, {
            userId: session.userId,
            username: session.username,
        });
        return NextResponse.json({ success: true, data: ids });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentQcMembersPOST", err);
    }
}

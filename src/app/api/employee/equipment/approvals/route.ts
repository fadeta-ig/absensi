import { NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEmployeeEquipmentAuth } from "@/lib/middleware/equipmentGuard";
import { EquipmentError, getPendingEquipmentApprovals } from "@/lib/services/equipmentService";

export async function GET() {
    const auth = await requireEmployeeEquipmentAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const approvals = await getPendingEquipmentApprovals(session);
        return NextResponse.json({ success: true, data: approvals });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentApprovalsGET", err);
    }
}

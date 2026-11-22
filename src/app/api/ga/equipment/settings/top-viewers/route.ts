import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEquipmentSettingsAuth } from "@/lib/middleware/equipmentGuard";
import { EquipmentError, getEquipmentTopViewersForAdmin, setEquipmentTopViewers } from "@/lib/services/equipmentService";
import { equipmentTopViewersSchema } from "@/lib/validations/validationSchemas";

export async function GET() {
    const auth = await requireEquipmentSettingsAuth("atasan");
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const data = await getEquipmentTopViewersForAdmin(session);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EquipmentTopViewersGET", err);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireEquipmentSettingsAuth("atasan");
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const result = await validateBody(request, equipmentTopViewersSchema);
        if ("error" in result) return result.error;
        const data = await setEquipmentTopViewers(session, result.data.employeeIds, { userId: session.userId, username: session.username });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EquipmentTopViewersPOST", err);
    }
}

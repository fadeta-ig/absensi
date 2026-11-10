import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002 } from "@/lib/services/cleaningService";
import { EquipmentError, getEquipmentApprovers, setEquipmentApprovers } from "@/lib/services/equipmentService";
import { equipmentApproversSchema } from "@/lib/validations/validationSchemas";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const company = searchParams.get("company");
        if (company !== "WIG" && company !== "MKI") {
            return NextResponse.json({ error: "Parameter company wajib WIG atau MKI." }, { status: 400 });
        }
        const data = await getEquipmentApprovers(company);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EquipmentApproverGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentApproversSchema);
        if ("error" in result) return result.error;
        const data = await setEquipmentApprovers(session, result.data.company, result.data.employeeIds, { userId: session.userId, username: session.username });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EquipmentApproverPOST", err);
    }
}

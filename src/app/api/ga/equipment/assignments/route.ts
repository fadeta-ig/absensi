import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    assignEquipmentUnit,
    endEquipmentAssignment,
    getEquipmentAssignments,
    EquipmentError,
} from "@/lib/services/equipmentService";
import { isWig002 } from "@/lib/services/cleaningService";
import { equipmentAssignSchema, equipmentEndAssignSchema } from "@/lib/validations/validationSchemas";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const data = await getEquipmentAssignments(session);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentAssignmentsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentAssignSchema);
        if ("error" in result) return result.error;

        const assignment = await assignEquipmentUnit(session, result.data);
        return NextResponse.json({ success: true, data: assignment }, { status: 201 });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentAssignmentsPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, equipmentEndAssignSchema);
        if ("error" in result) return result.error;

        const assignment = await endEquipmentAssignment(session, result.data.assignmentId, result.data.endsOnWibDate ?? undefined);
        return NextResponse.json({ success: true, data: assignment });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentAssignmentsPATCH", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    assignEquipmentUnit,
    assignEquipmentUnitsBulk,
    endEquipmentAssignment,
    endEquipmentAssignmentsBulk,
    getEquipmentAssignments,
    updateEquipmentAssignment,
    EquipmentError,
} from "@/lib/services/equipmentService";
import { isWig002 } from "@/lib/services/cleaningService";
import { equipmentAssignSchema, equipmentAssignBulkSchema, equipmentEndAssignSchema, equipmentEndAssignBulkSchema, equipmentUpdateAssignSchema } from "@/lib/validations/validationSchemas";

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
        const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        // Bulk bila body membawa unitIds array; selain itu penugasan tunggal (kompatibel lama).
        if (raw && Array.isArray(raw.unitIds)) {
            const result = await validateBody(request, equipmentAssignBulkSchema, raw);
            if ("error" in result) return result.error;

            const data = await assignEquipmentUnitsBulk(session, result.data);
            if (data.created.length === 0) {
                return NextResponse.json({ error: "Semua alat di-skip (tidak ada penugasan baru).", details: data.skipped }, { status: 409 });
            }
            return NextResponse.json({ success: true, data }, { status: 201 });
        }

        const result = await validateBody(request, equipmentAssignSchema, raw ?? undefined);
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
        const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        // Akhiri massal bila body membawa assignmentIds array.
        if (raw && Array.isArray(raw.assignmentIds)) {
            const result = await validateBody(request, equipmentEndAssignBulkSchema, raw);
            if ("error" in result) return result.error;

            const data = await endEquipmentAssignmentsBulk(session, result.data.assignmentIds);
            if (data.ended.length === 0) {
                return NextResponse.json({ error: "Semua penugasan di-skip (tidak ada yang diakhiri).", details: data.skipped }, { status: 409 });
            }
            return NextResponse.json({ success: true, data });
        }
        // Update bila body membawa field edit; selain itu akhiri penugasan (kompatibel lama).
        const isUpdate =
            !!raw &&
            ("unitId" in raw || "employeeId" in raw || "startsOnWibDate" in raw);
        if (isUpdate) {
            const result = await validateBody(request, equipmentUpdateAssignSchema, raw);
            if ("error" in result) return result.error;

            const assignment = await updateEquipmentAssignment(session, result.data.assignmentId, {
                unitId: result.data.unitId,
                employeeId: result.data.employeeId,
                startsOnWibDate: result.data.startsOnWibDate,
                endsOnWibDate: result.data.endsOnWibDate,
            });
            return NextResponse.json({ success: true, data: assignment });
        }

        const result = await validateBody(request, equipmentEndAssignSchema, raw ?? undefined);
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

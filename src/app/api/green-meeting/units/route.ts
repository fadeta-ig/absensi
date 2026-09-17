import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getGreenMeetingUnits, updateGreenMeetingUnit, canManageGreenMeeting } from "@/lib/services/greenMeetingService";
import { greenMeetingUnitUpdateSchema } from "@/lib/validations/validationSchemas";
import { z } from "zod";

const unitPatchBodySchema = greenMeetingUnitUpdateSchema.extend({
    id: z.string().min(1, "ID unit wajib diisi"),
});

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const units = await getGreenMeetingUnits();
        return NextResponse.json(units);
    } catch (err) {
        return serverErrorResponse("GreenMeetingUnitsGET", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const isManager = await canManageGreenMeeting(session);
    if (!isManager) return forbiddenResponse();

    try {
        const result = await validateBody(request, unitPatchBodySchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;
        const updated = await updateGreenMeetingUnit(id, data);
        return NextResponse.json(updated);
    } catch (err) {
        return serverErrorResponse("GreenMeetingUnitsPATCH", err);
    }
}

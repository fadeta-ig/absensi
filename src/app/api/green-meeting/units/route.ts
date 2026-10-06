import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getGreenMeetingUnits, updateGreenMeetingUnit, GreenMeetingError } from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager } from "../_guard";
import { greenMeetingUnitUpdateSchema } from "@/lib/validations/validationSchemas";
import { z } from "zod";

const unitPatchBodySchema = greenMeetingUnitUpdateSchema.extend({
    id: z.string().trim().min(1, "ID unit wajib diisi"),
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
    const { errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, unitPatchBodySchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;
        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
        }
        const updated = await updateGreenMeetingUnit(id, data);
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingUnitsPATCH", err);
    }
}

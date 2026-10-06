import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    extendTaskDeadline,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager } from "../_guard";
import { greenMeetingExtendDeadlineSchema } from "@/lib/validations/validationSchemas";
import { z } from "zod";

const extendDeadlineBodySchema = greenMeetingExtendDeadlineSchema.extend({
    noteId: z.string().trim().min(1, "Note ID wajib diisi"),
});

export async function POST(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, extendDeadlineBodySchema);
        if ("error" in result) return result.error;

        const { noteId, newDeadlineDate, reason } = result.data;
        const updated = await extendTaskDeadline(noteId, newDeadlineDate, reason, session.username);
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingDeadlinesPOST", err);
    }
}

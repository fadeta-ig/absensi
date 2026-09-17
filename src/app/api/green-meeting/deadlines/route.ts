import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    extendTaskDeadline,
    canManageGreenMeeting,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { greenMeetingExtendDeadlineSchema } from "@/lib/validations/validationSchemas";
import { z } from "zod";

const extendDeadlineBodySchema = greenMeetingExtendDeadlineSchema.extend({
    noteId: z.string().min(1, "Note ID wajib diisi"),
});

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const isManager = await canManageGreenMeeting(session);
    if (!isManager) return forbiddenResponse();

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

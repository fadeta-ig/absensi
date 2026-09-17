import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import {
    canManageGreenMeeting,
    GreenMeetingError,
    updateMeetingNote,
} from "@/lib/services/greenMeetingService";
import { greenMeetingNoteUpdateSchema } from "@/lib/validations/validationSchemas";

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    if (!(await canManageGreenMeeting(session))) return forbiddenResponse();

    try {
        const result = await validateBody(request, greenMeetingNoteUpdateSchema);
        if ("error" in result) return result.error;

        const { id } = await context.params;
        const updated = await updateMeetingNote(id, result.data, {
            userId: session.userId,
            username: session.username,
            name: session.name,
            role: session.primaryRole,
        });

        return NextResponse.json(updated);
    } catch (error) {
        if (error instanceof GreenMeetingError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        return serverErrorResponse("GreenMeetingNotePATCH", error);
    }
}

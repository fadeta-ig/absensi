import { NextRequest, NextResponse } from "next/server";
import {
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import {
    GreenMeetingError,
    updateMeetingNote,
} from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager } from "../../_guard";
import { greenMeetingNoteUpdateSchema } from "@/lib/validations/validationSchemas";

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, greenMeetingNoteUpdateSchema);
        if ("error" in result) return result.error;

        const { id: rawId } = await context.params;
        const id = rawId.trim();
        if (!id) {
            return NextResponse.json({ error: "ID catatan wajib diisi." }, { status: 400 });
        }
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

import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getMeetingNoteRevisions, GreenMeetingError } from "@/lib/services/greenMeetingService";

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { id } = await context.params;
        return NextResponse.json(await getMeetingNoteRevisions(id));
    } catch (error) {
        if (error instanceof GreenMeetingError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        return serverErrorResponse("GreenMeetingNoteRevisionsGET", error);
    }
}

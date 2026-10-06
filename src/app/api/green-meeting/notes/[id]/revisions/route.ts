import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getMeetingNoteRevisions, canManageGreenMeeting, GreenMeetingError } from "@/lib/services/greenMeetingService";
import { PERMISSIONS } from "@/lib/permissions";
import { z } from "zod";

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // Revisi: GA pengelola atau HR pemantau (read-only).
    const isManager = await canManageGreenMeeting(session);
    const isHr = session.permissions.includes(PERMISSIONS.HR_MANAGE);
    if (!isManager && !isHr) return forbiddenResponse();

    try {
        const { id } = await context.params;
        const parsed = z.string().trim().min(1, "ID catatan wajib diisi.").safeParse(id);
        if (!parsed.success) {
            return NextResponse.json({ error: "ID catatan wajib diisi." }, { status: 400 });
        }
        return NextResponse.json(await getMeetingNoteRevisions(parsed.data));
    } catch (error) {
        if (error instanceof GreenMeetingError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        return serverErrorResponse("GreenMeetingNoteRevisionsGET", error);
    }
}

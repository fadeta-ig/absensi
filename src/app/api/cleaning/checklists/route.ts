import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getOrCreateDailyChecklist, getChecklist, CleaningError } from "@/lib/services/cleaningService";
import { isValidCalendarDate } from "@/lib/timezone";
import { z } from "zod";

const createChecklistSchema = z.object({
    roomId: z.string().min(1, "roomId wajib diisi"),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes("cleaning.execute")) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get("roomId");
        const date = searchParams.get("date");

        if (!roomId) {
            return NextResponse.json({ error: "Parameter roomId wajib diisi." }, { status: 400 });
        }
        if (!date || !isValidCalendarDate(date)) {
            return NextResponse.json({ error: "Parameter date wajib diisi dengan format YYYY-MM-DD." }, { status: 400 });
        }

        const checklist = await getChecklist(session, roomId, date);
        if (!checklist) {
            return NextResponse.json({ success: true, data: null });
        }
        return NextResponse.json({ success: true, data: checklist });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningChecklistsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes("cleaning.execute")) return forbiddenResponse();

    try {
        const result = await validateBody(request, createChecklistSchema);
        if ("error" in result) return result.error;

        const checklist = await getOrCreateDailyChecklist(session, result.data.roomId);
        return NextResponse.json({ success: true, data: checklist });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningChecklistsPOST", err);
    }
}

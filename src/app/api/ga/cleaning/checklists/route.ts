import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getChecklistDetail, isWig002, CleaningError } from "@/lib/services/cleaningService";
import { isValidCalendarDate } from "@/lib/timezone";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get("roomId");
        const date = searchParams.get("date");

        if (!roomId) {
            return NextResponse.json({ error: "Parameter roomId wajib diisi." }, { status: 400 });
        }
        if (!date || !isValidCalendarDate(date)) {
            return NextResponse.json({ error: "Parameter date wajib diisi (YYYY-MM-DD)." }, { status: 400 });
        }

        const detail = await getChecklistDetail(session, roomId, date);
        return NextResponse.json({ success: true, data: detail });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningChecklistsGET", err);
    }
}

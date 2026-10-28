import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getRosterTimeline, ROSTER_TIMELINE_MAX_DAYS, ShiftAssignmentError } from "@/lib/services/shiftAssignmentService";
import { PERMISSIONS } from "@/lib/permissions";
import { toWIBDateString } from "@/lib/timezone";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const params = new URL(request.url).searchParams;
        const from = params.get("from") ?? toWIBDateString();
        const daysParam = params.get("days") ?? "7";
        const days = Number(daysParam);
        if (!/^\d+$/.test(daysParam) || days < 1 || days > ROSTER_TIMELINE_MAX_DAYS) {
            return NextResponse.json(
                {
                    error: `Jumlah hari harus 1 sampai ${ROSTER_TIMELINE_MAX_DAYS}.`,
                    code: "INVALID_RANGE",
                },
                { status: 400 },
            );
        }
        const timeline = await getRosterTimeline(from, days);
        return NextResponse.json(timeline, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
        if (err instanceof ShiftAssignmentError) {
            return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
        }
        return serverErrorResponse("ShiftRosterTimelineGET", err);
    }
}

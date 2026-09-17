import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getMeetingRecap } from "@/lib/services/greenMeetingService";
import { toWIBDateString } from "@/lib/timezone";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const today = toWIBDateString();
        // Default: 30 hari ke belakang
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const defaultStart = toWIBDateString(thirtyDaysAgo);

        const startDate = searchParams.get("startDate") || defaultStart;
        const endDate = searchParams.get("endDate") || today;

        const recap = await getMeetingRecap(startDate, endDate);
        return NextResponse.json(recap);
    } catch (err) {
        return serverErrorResponse("GreenMeetingRecapGET", err);
    }
}

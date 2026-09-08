import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { getBirthdayOverview } from "@/lib/services/birthdayService";

export async function GET(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const searchParams = request.nextUrl.searchParams;
        const monthParam = searchParams.get("month");
        const yearParam = searchParams.get("year");

        const month = monthParam ? parseInt(monthParam, 10) : undefined;
        const year = yearParam ? parseInt(yearParam, 10) : undefined;

        const overview = await getBirthdayOverview({ month, year });

        return NextResponse.json({
            success: true,
            data: overview,
        });
    } catch (error) {
        return serverErrorResponse("BirthdaysGET", error);
    }
}

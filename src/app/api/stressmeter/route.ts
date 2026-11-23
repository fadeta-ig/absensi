import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { getHrStressmeterOverview } from "@/lib/services/stressmeterService";

export async function GET(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const sp = request.nextUrl.searchParams;
        const page = Number.parseInt(sp.get("page") ?? "1", 10);
        const limit = Number.parseInt(sp.get("limit") ?? "20", 10);

        const data = await getHrStressmeterOverview({
            from: sp.get("from"),
            to: sp.get("to"),
            departmentId: sp.get("departmentId"),
            ratingFilter: sp.get("rating"),
            search: sp.get("search"),
            page: Number.isFinite(page) ? page : 1,
            limit: Number.isFinite(limit) ? limit : 20,
        });

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (error) {
        return serverErrorResponse("HrStressmeterOverviewGET", error);
    }
}

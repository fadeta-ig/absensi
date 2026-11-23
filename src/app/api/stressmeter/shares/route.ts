import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { getHrAnonymousShares } from "@/lib/services/stressmeterService";

export async function GET(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const sp = request.nextUrl.searchParams;
        const page = Number.parseInt(sp.get("page") ?? "1", 10);
        const limit = Number.parseInt(sp.get("limit") ?? "15", 10);

        const data = await getHrAnonymousShares({
            status: sp.get("status"),
            topic: sp.get("topic"),
            from: sp.get("from"),
            to: sp.get("to"),
            page: Number.isFinite(page) ? page : 1,
            limit: Number.isFinite(limit) ? limit : 15,
        });

        return NextResponse.json(
            {
                success: true,
                data,
            },
            { headers: { "Cache-Control": "private, no-store" } }
        );
    } catch (error) {
        return serverErrorResponse("HrStressmeterSharesGET", error);
    }
}

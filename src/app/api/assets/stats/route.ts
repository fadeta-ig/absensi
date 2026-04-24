import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { getAssetStats } from "@/lib/services/assetService";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const includeCompanyOwned = session.role === "ga";
        const stats = await getAssetStats(includeCompanyOwned);
        return NextResponse.json(stats);
    } catch (err) {
        return serverErrorResponse("AssetStatsGET", err);
    }
}

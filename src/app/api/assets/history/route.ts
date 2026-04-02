import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { getAssetHistory } from "@/lib/services/assetService";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const assetId = searchParams.get("assetId");

        if (!assetId) {
            return NextResponse.json({ error: "assetId diperlukan" }, { status: 400 });
        }

        const history = await getAssetHistory(assetId);
        return NextResponse.json(history);
    } catch (err) {
        return serverErrorResponse("AssetHistory", err);
    }
}

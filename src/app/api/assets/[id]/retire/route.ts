import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { retireAsset } from "@/lib/services/assetService";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // Only GA can retire an asset
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const { id } = await params;
        const asset = await retireAsset(id, session.employeeId);
        
        if (!asset) {
            return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });
        }

        return NextResponse.json(asset);
    } catch (err: unknown) {
        return serverErrorResponse("AssetRetirePOST", err);
    }
}

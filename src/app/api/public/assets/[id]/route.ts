import { NextRequest, NextResponse } from "next/server";
import { getPublicAssetById } from "@/lib/services/assetService";
import { serverErrorResponse } from "@/lib/middleware/apiGuard";

/**
 * GET /api/public/assets/[id]
 * Public endpoint — NO auth required.
 * Returns limited, safe fields only (no financial data, no personal details).
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const asset = await getPublicAssetById(id);

        if (!asset) {
            return NextResponse.json(
                { error: "Aset tidak ditemukan atau tidak tersedia untuk publik." },
                { status: 404 }
            );
        }

        return NextResponse.json(asset, {
            headers: {
                // Cache ringan 60 detik — data publik tidak terlalu sering berubah
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
            },
        });
    } catch (err: unknown) {
        return serverErrorResponse("PublicAssetGET", err);
    }
}

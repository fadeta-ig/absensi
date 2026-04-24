import { NextRequest, NextResponse } from "next/server";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { getPublicAssetById } from "@/lib/services/assetService";

/**
 * GET /api/public/assets/[id]
 * Public endpoint — NO auth required.
 * Returns limited, safe fields only (no financial data, no personal details).
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Rate limit ketat: mencegah scraping/brute force
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

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
        console.error("[PublicAssetGET]", err);
        return NextResponse.json(
            { error: "Terjadi kesalahan pada server." },
            { status: 500 }
        );
    }
}

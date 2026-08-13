import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import QRCode from "qrcode";
import { getAssetById } from "@/lib/services/assetService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    
    // GA and HR can access
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const assetId = searchParams.get("assetId");

        if (!assetId) {
            return NextResponse.json({ error: "assetId diperlukan" }, { status: 400 });
        }

        const asset = await getAssetById(assetId);
        if (!asset) {
            return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });
        }
        
        // Use environment variable for base URL or fallback to relative path context
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || `https://${request.headers.get('host')}`;
        const targetUrl = `${baseUrl}/scan/${asset.id}`;

        // Generate QR code as a buffer
        const buffer = await QRCode.toBuffer(targetUrl, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 400,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });

        return new NextResponse(buffer as unknown as BodyInit, {
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=3600", // Kurangi ke 1 jam agar perubahan target URL segera terasa
            },
        });
    } catch (err: unknown) {
        return serverErrorResponse("AssetQRGET", err);
    }
}

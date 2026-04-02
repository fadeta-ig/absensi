import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { getAssetById, updateAsset, retireAsset } from "@/lib/services/assetService";
import { z } from "zod";

const assetUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    kondisi: z.enum(["BAIK", "KURANG_BAIK", "RUSAK"]).optional(),
    status: z.enum(["AVAILABLE", "IN_USE", "MAINTENANCE", "RETIRED", "COMPANY_OWNED"]).optional(),
    keterangan: z.string().nullable().optional(),
    nomorIndosat: z.string().nullable().optional(),
    expiredDate: z.string().nullable().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const { id } = await params;
        const asset = await getAssetById(id);
        if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });

        // HR tidak bisa lihat COMPANY_OWNED
        if (session.role === "hr" && asset.status === "COMPANY_OWNED") {
            return forbiddenResponse();
        }

        return NextResponse.json(asset);
    } catch (err) {
        return serverErrorResponse("AssetGET", err);
    }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, assetUpdateSchema);
        if ("error" in result) return result.error;

        const asset = await updateAsset(id, result.data);
        if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });

        return NextResponse.json(asset);
    } catch (err) {
        return serverErrorResponse("AssetPUT", err);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const { id } = await params;
        const success = await retireAsset(id, session.employeeId);
        if (!success) return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });

        return NextResponse.json({ success: true, message: "Aset berhasil di-retire" });
    } catch (err) {
        return serverErrorResponse("AssetDELETE", err);
    }
}

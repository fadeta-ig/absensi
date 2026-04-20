import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { getAssets, createAsset } from "@/lib/services/assetService";
import { z } from "zod";

const assetCreateSchema = z.object({
    name: z.string().min(1, "Nama aset harus diisi"),
    category: z.enum(["HANDPHONE", "LAPTOP", "NOMOR_HP"]),
    kondisi: z.enum(["BAIK", "KURANG_BAIK", "RUSAK"]).optional().default("BAIK"),
    holderType: z.enum(["EMPLOYEE", "FORMER_EMPLOYEE", "TEAM", "GA_POOL", "COMPANY_OWNED"]).optional().default("GA_POOL"),
    assignedToName: z.string().nullable().optional(),
    assignedToId: z.string().nullable().optional(),
    nomorIndosat: z.string().nullable().optional(),
    expiredDate: z.string().nullable().optional(),
    keterangan: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get("category") ?? undefined;

        // HR tidak melihat COMPANY_OWNED
        const includeCompanyOwned = session.role === "ga";
        const assets = await getAssets({ includeCompanyOwned, category });

        return NextResponse.json(assets);
    } catch (err) {
        return serverErrorResponse("AssetsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const result = await validateBody(request, assetCreateSchema);
        if ("error" in result) return result.error;

        const asset = await createAsset(result.data, session.employeeId);
        return NextResponse.json(asset, { status: 201 });
    } catch (err) {
        return serverErrorResponse("AssetsPOST", err);
    }
}

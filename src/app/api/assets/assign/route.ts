import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { assignAsset } from "@/lib/services/assetService";
import { z } from "zod";

const assignSchema = z.object({
    assetId: z.string().min(1, "Asset ID harus diisi"),
    toHolderType: z.enum(["EMPLOYEE", "FORMER_EMPLOYEE", "TEAM", "GA_POOL"]),
    toName: z.string().nullable().optional(),
    toEmployeeId: z.string().nullable().optional(),
    kondisi: z.enum(["BAIK", "KURANG_BAIK", "RUSAK"]).optional(),
    notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const result = await validateBody(request, assignSchema);
        if ("error" in result) return result.error;

        const { assetId, toHolderType, toName, toEmployeeId, kondisi, notes } = result.data;

        // Validasi: jika bukan GA_POOL, harus ada nama pemegang
        if (toHolderType !== "GA_POOL" && !toName) {
            return NextResponse.json({ error: "Nama pemegang harus diisi" }, { status: 400 });
        }

        // Validasi: jika EMPLOYEE, harus ada toEmployeeId
        if (toHolderType === "EMPLOYEE" && !toEmployeeId) {
            return NextResponse.json({ error: "Data karyawan tidak valid (ID diperlukan)" }, { status: 400 });
        }

        const asset = await assignAsset(
            assetId,
            { toHolderType, toName: toName ?? null, toEmployeeId: toEmployeeId ?? null, kondisi, notes },
            session.employeeId
        );

        if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan" }, { status: 404 });

        return NextResponse.json(asset);
    } catch (err) {
        return serverErrorResponse("AssetAssign", err);
    }
}

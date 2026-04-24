import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { createBulkAssets } from "@/lib/services/assetService";
import { z } from "zod";

const bulkAssetSchema = z.array(
    z.object({
        categoryPrefix: z.string().min(1, "Prefix wajib diisi"),
        name: z.string().min(1, "Nama aset wajib diisi"),
        kondisi: z.enum(["BAIK", "KURANG_BAIK", "RUSAK"]).default("BAIK"),
        manufacturer: z.string().optional().nullable(),
        modelName: z.string().optional().nullable(),
        serialNumber: z.string().optional().nullable(),
        keterangan: z.string().optional().nullable(),
    })
).min(1, "Payload kosong!").max(300, "Maksimal 300 data dalam satu siklus import!");

/**
 * POST /api/assets/bulk
 * Menerima array dari asset data (sudah diparsing dari frontend).
 */
export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    // Hanya GA yang bisa Create Assets, apalagi secara bulk.
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const result = await validateBody(request, bulkAssetSchema);
        if ("error" in result) return result.error;

        const importedCount = await createBulkAssets(result.data, session.employeeId);

        return NextResponse.json({ 
            message: "Bulk upload berhasil", 
            count: importedCount 
        }, { status: 201 });

    } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("tidak ditemukan di sistem")) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return serverErrorResponse("AssetBulkPOST", err);
    }
}

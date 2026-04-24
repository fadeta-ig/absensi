import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { createAssetInspection, InspectionChecklist, getAssetInspections } from "@/lib/services/assetService";
import { z } from "zod";

const inspectionSchema = z.object({
    kondisiSaat: z.enum(["BAIK", "KURANG_BAIK", "RUSAK"]),
    checklist: z.record(z.string(), z.boolean()),
    notes: z.string().max(500).nullable().optional(),
});

/**
 * POST /api/assets/[id]/inspect
 * GA only — Submit hasil inspeksi fisik aset.
 * Secara otomatis memperbarui kondisi aset jika berbeda.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const { id } = await params;

        const result = await validateBody(request, inspectionSchema);
        if ("error" in result) return result.error;

        const { kondisiSaat, checklist, notes } = result.data;

        const inspection = await createAssetInspection({
            assetId: id,
            kondisiSaat,
            checklist: checklist as InspectionChecklist,
            notes: notes ?? null,
            performedBy: session.employeeId,
        });

        return NextResponse.json(inspection, { status: 201 });
    } catch (err: unknown) {
        if (err instanceof Error && err.message === "Aset tidak ditemukan") {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        return serverErrorResponse("AssetInspect", err);
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // GA and HR can view
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const { id } = await params;
        const inspections = await getAssetInspections(id);
        return NextResponse.json(inspections);
    } catch (err: unknown) {
        return serverErrorResponse("AssetInspectGET", err);
    }
}

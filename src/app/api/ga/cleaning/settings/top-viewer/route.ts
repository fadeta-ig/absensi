import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002, CleaningError } from "@/lib/services/cleaningService";
import {
    getCleaningTopViewerInfo,
    updateCleaningTopViewer,
    AppSettingsError,
} from "@/lib/services/appSettingsService";

const topViewerPutSchema = z.object({
    employeeId: z.string().trim().max(100, "ID karyawan terlalu panjang."),
});

/**
 * GET/PUT /api/ga/cleaning/settings/top-viewer — penunjukan atasan
 * tertinggi viewer HANYA oleh WIG002. PUT menerima string kosong untuk
 * mengosongkan penunjukan.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const info = await getCleaningTopViewerInfo();
        return NextResponse.json({ success: true, data: info });
    } catch (err) {
        return serverErrorResponse("CleaningTopViewerGET", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, topViewerPutSchema);
    if ("error" in validation) return validation.error;

    try {
        const result = await updateCleaningTopViewer(validation.data.employeeId, session.userId);
        const info = await getCleaningTopViewerInfo();
        return NextResponse.json({ success: true, data: { ...result, info } });
    } catch (err) {
        if (err instanceof AppSettingsError || err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningTopViewerPUT", err);
    }
}

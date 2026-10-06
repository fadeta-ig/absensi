import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002, CleaningError } from "@/lib/services/cleaningService";
import {
    getCleaningTopViewerInfos,
    setCleaningTopViewers,
    removeCleaningTopViewer,
    MAX_CLEANING_TOP_VIEWERS,
    AppSettingsError,
} from "@/lib/services/appSettingsService";

const topViewersPostSchema = z.object({
    employeeIds: z.array(z.string().trim().min(1).max(100)).max(MAX_CLEANING_TOP_VIEWERS),
});

/**
 * GET/POST/DELETE /api/ga/cleaning/settings/top-viewers — daftar atasan
 * tertinggi (pemantau) max 5, HANYA oleh WIG002. Key tunggal lama tetap ada
 * sebagai fallback baca (LEGACY) hingga backfill selesai.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const infos = await getCleaningTopViewerInfos();
        return NextResponse.json({ success: true, data: infos });
    } catch (err) {
        return serverErrorResponse("CleaningTopViewersGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, topViewersPostSchema);
    if ("error" in validation) return validation.error;

    try {
        const result = await setCleaningTopViewers(validation.data.employeeIds, session.userId);
        const infos = await getCleaningTopViewerInfos();
        return NextResponse.json({ success: true, data: { ...result, infos } });
    } catch (err) {
        if (err instanceof AppSettingsError || err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningTopViewersPOST", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const parsed = z.string().trim().min(1, "ID wajib diisi.").max(100).safeParse(searchParams.get("id") ?? "");
        if (!parsed.success) {
            return NextResponse.json({ error: "Parameter id wajib diisi." }, { status: 400 });
        }
        const result = await removeCleaningTopViewer(parsed.data, session.userId);
        const infos = await getCleaningTopViewerInfos();
        return NextResponse.json({ success: true, data: { ...result, infos } });
    } catch (err) {
        if (err instanceof AppSettingsError || err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningTopViewersDELETE", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getAllUploadLimits, updateUploadLimit, AppSettingsError } from "@/lib/services/appSettingsService";
import logger from "@/lib/logger";

function canManageUploads(session: Awaited<ReturnType<typeof requireAuth>>): boolean {
    return Boolean(session && session.username === "WIG001" && session.permissions.includes("hr.manage"));
}

function canViewUploads(session: Awaited<ReturnType<typeof requireAuth>>): boolean {
    return Boolean(session && session.permissions.includes("hr.manage"));
}

const uploadLimitUpdateSchema = z.object({
    key: z.string().trim().min(1, "Kunci batas upload wajib diisi."),
    valueMb: z.number({ message: "Batas upload harus berupa angka dalam MB." }),
});

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canViewUploads(session)) return forbiddenResponse();

    try {
        const limits = await getAllUploadLimits();
        return NextResponse.json({ limits, canManage: canManageUploads(session) });
    } catch (err) {
        return serverErrorResponse("UploadSettingsGET", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageUploads(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, uploadLimitUpdateSchema);
        if ("error" in result) return result.error;

        const updated = await updateUploadLimit(result.data.key, result.data.valueMb, session.userId);
        logger.info("Upload limit updated", { key: updated.key, valueMb: updated.valueMb, by: session.username });
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof AppSettingsError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("UploadSettingsPUT", err);
    }
}

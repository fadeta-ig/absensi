import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002, CleaningError } from "@/lib/services/cleaningService";
import {
    getCleaningDefaultReviewers,
    updateCleaningDefaultReviewers,
    AppSettingsError,
} from "@/lib/services/appSettingsService";
import { prisma } from "@/lib/prisma";

const defaultReviewersPutSchema = z.object({
    inspectedByEmployeeId: z.string().trim().min(1, "Diperiksa Oleh wajib diisi.").max(100),
    knownByEmployeeId: z.string().trim().min(1, "Mengetahui wajib diisi.").max(100),
});

/**
 * GET/PUT /api/ga/cleaning/settings/default-reviewers — pasangan default
 * reviewer global (1 sumber setup). Hanya WIG002. Berlaku untuk periode
 * BARU (prefill + auto-ensure); baris approval lama tidak diubah.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const defaults = await getCleaningDefaultReviewers();
        const info = await resolveNames(defaults);
        return NextResponse.json({ success: true, data: { defaults, info } });
    } catch (err) {
        return serverErrorResponse("CleaningDefaultReviewersGET", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, defaultReviewersPutSchema);
    if ("error" in validation) return validation.error;

    try {
        const result = await updateCleaningDefaultReviewers(
            validation.data.inspectedByEmployeeId,
            validation.data.knownByEmployeeId,
            session.userId
        );
        const info = await resolveNames(result);
        return NextResponse.json({ success: true, data: { ...result, info } });
    } catch (err) {
        if (err instanceof AppSettingsError || err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningDefaultReviewersPUT", err);
    }
}

async function resolveNames(defaults: { inspectedByEmployeeId: string | null; knownByEmployeeId: string | null }) {
    const ids = [defaults.inspectedByEmployeeId, defaults.knownByEmployeeId].filter(
        (id): id is string => Boolean(id)
    );
    if (ids.length === 0) {
        return { inspectedBy: null, knownBy: null } as {
            inspectedBy: { employeeId: string; name: string; isActive: boolean } | null;
            knownBy: { employeeId: string; name: string; isActive: boolean } | null;
        };
    }
    const rows = await prisma.employee.findMany({
        where: { employeeId: { in: ids } },
        select: { employeeId: true, name: true, isActive: true },
    });
    const byId = new Map(rows.map((row) => [row.employeeId, row]));
    const pick = (id: string | null) => {
        if (!id) return null;
        const row = byId.get(id);
        if (!row) return { employeeId: id, name: id, isActive: false };
        return { employeeId: row.employeeId, name: row.name, isActive: row.isActive };
    };
    return { inspectedBy: pick(defaults.inspectedByEmployeeId), knownBy: pick(defaults.knownByEmployeeId) };
}

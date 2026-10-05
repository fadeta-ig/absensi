import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { createAssignmentsBulk, isWig002, CleaningError } from "@/lib/services/cleaningService";
import { z } from "zod";

const bulkAssignmentSchema = z.object({
    roomIds: z.array(z.string().min(1)).min(1, "Pilih minimal 1 ruangan.").max(50),
    userIds: z.array(z.string().min(1)).min(1, "Pilih minimal 1 petugas.").max(50),
    workerType: z.enum(["INTERNAL", "OUTSOURCE"]),
    applyToToday: z.boolean().optional().default(false),
}).refine((data) => data.roomIds.length * data.userIds.length <= 100, {
    message: "Maksimal 100 penugasan sekaligus. Bagi menjadi beberapa tahap.",
});

/**
 * POST /api/ga/cleaning/assignments/bulk — tugaskan banyak petugas ke banyak
 * ruangan sekaligus. Hasil per pasangan (created/skipped/failed) agar WIG002
 * tahu mana yang perlu diulang.
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, bulkAssignmentSchema);
        if ("error" in result) return result.error;

        const bulk = await createAssignmentsBulk(session, result.data);
        return NextResponse.json({ success: true, data: bulk }, { status: 201 });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningAssignmentsBulkPOST", err);
    }
}

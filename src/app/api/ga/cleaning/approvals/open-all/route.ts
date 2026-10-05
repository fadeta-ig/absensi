import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002, CleaningError } from "@/lib/services/cleaningService";
import { openAllMonthlyApprovals } from "@/lib/services/cleaningApprovalService";
import { z } from "zod";

const openAllSchema = z.object({
    monthWib: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format monthWib harus YYYY-MM."),
});

/**
 * POST /api/ga/cleaning/approvals/open-all — buka periode untuk SEMUA
 * ruangan aktif sekaligus memakai pasangan default global. Idempoten:
 * ruangan yang sudah punya baris di-skip. Hanya WIG002.
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, openAllSchema);
    if ("error" in validation) return validation.error;

    try {
        const result = await openAllMonthlyApprovals(session, validation.data.monthWib);
        return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningApprovalsOpenAllPOST", err);
    }
}

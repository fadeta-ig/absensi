import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse, validateBody } from "@/lib/middleware/apiGuard";
import { isWig002, CleaningError } from "@/lib/services/cleaningService";
import { reopenApprovalSlot } from "@/lib/services/cleaningApprovalService";
import { z } from "zod";

const reopenSchema = z.object({
    approvalId: z.string().uuid("approvalId harus berupa UUID."),
    role: z.enum(["INSPECTED_BY", "KNOWN_BY"], {
        message: "Role harus INSPECTED_BY atau KNOWN_BY.",
    }),
    reopenReason: z.string().min(3, "Alasan pembukaan kembali wajib diisi minimal 3 karakter."),
    replacementEmployeeId: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, reopenSchema);
    if ("error" in validation) return validation.error;

    try {
        const result = await reopenApprovalSlot(session, validation.data);
        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningApprovalsReopenPOST", err);
    }
}

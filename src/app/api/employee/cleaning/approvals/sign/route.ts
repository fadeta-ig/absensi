import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse, validateBody } from "@/lib/middleware/apiGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { CleaningError } from "@/lib/services/cleaningService";
import { signApprovalPeriod } from "@/lib/services/cleaningApprovalService";
import { z } from "zod";

const signSchema = z.object({
    approvalId: z.string().uuid("approvalId harus berupa UUID."),
    role: z.enum(["INSPECTED_BY", "KNOWN_BY"], {
        message: "Role harus INSPECTED_BY atau KNOWN_BY.",
    }),
    signaturePayload: z.string().min(1, "Payload tanda tangan wajib diisi."),
    idempotencyKey: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        return forbiddenResponse();
    }

    const validation = await validateBody(request, signSchema);
    if ("error" in validation) return validation.error;

    try {
        const idempotencyKey =
            validation.data.idempotencyKey ||
            request.headers.get("x-idempotency-key") ||
            undefined;

        const result = await signApprovalPeriod(session, {
            approvalId: validation.data.approvalId,
            role: validation.data.role,
            signaturePayload: validation.data.signaturePayload,
            idempotencyKey,
        });

        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeCleaningApprovalsSignPOST", err);
    }
}

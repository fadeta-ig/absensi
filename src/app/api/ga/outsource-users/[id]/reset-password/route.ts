import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import {
    OutsourceUserError,
    isWig002Session,
    resetOutsourceUserPassword,
} from "@/lib/services/outsourceUserService";
import { resetOutsourcePasswordSchema } from "@/lib/validations/validationSchemas";

/**
 * POST /api/ga/outsource-users/[id]/reset-password
 * Setel ulang kata sandi akun outsource dan putus sesi lama (ketat WIG002-only).
 */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002Session(session)) return forbiddenResponse();

    try {
        const { id } = await context.params;
        const result = await validateBody(request, resetOutsourcePasswordSchema);
        if ("error" in result) return result.error;

        const data = await resetOutsourceUserPassword(session, id, result.data.password);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof OutsourceUserError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaOutsourceUsersResetPasswordPOST", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { stressmeterShareUpdateSchema } from "@/lib/validations/validationSchemas";
import { updateAnonymousShareStatus } from "@/lib/services/stressmeterService";

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const { id } = await context.params;
        if (!id || id.trim().length === 0) {
            return NextResponse.json(
                { error: "Pesan anonim tidak ditemukan." },
                { status: 404 }
            );
        }

        const validation = await validateBody(request, stressmeterShareUpdateSchema);
        if ("error" in validation) return validation.error;

        const updated = await updateAnonymousShareStatus(id, validation.data, session.userId);
        if (!updated) {
            return NextResponse.json(
                { error: "Pesan anonim tidak ditemukan." },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: updated,
        });
    } catch (error) {
        return serverErrorResponse("HrStressmeterSharePATCH", error);
    }
}

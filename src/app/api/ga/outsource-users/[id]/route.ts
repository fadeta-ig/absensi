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
    deleteOutsourceUserAccount,
    isWig002Session,
    updateOutsourceUserAccount,
} from "@/lib/services/outsourceUserService";
import { updateOutsourceUserSchema } from "@/lib/validations/validationSchemas";

/**
 * PATCH /api/ga/outsource-users/[id] — ubah profil, status aktif, atau modul RBAC OS (WIG002-only)
 * DELETE /api/ga/outsource-users/[id] — hapus permanen hanya bila tanpa riwayat (WIG002-only)
 */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002Session(session)) return forbiddenResponse();

    try {
        const { id } = await context.params;
        const result = await validateBody(request, updateOutsourceUserSchema);
        if ("error" in result) return result.error;

        const updated = await updateOutsourceUserAccount(session, id, result.data);
        return NextResponse.json({ success: true, data: updated });
    } catch (err) {
        if (err instanceof OutsourceUserError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaOutsourceUsersPATCH", err);
    }
}

export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002Session(session)) return forbiddenResponse();

    try {
        const { id } = await context.params;
        const deleted = await deleteOutsourceUserAccount(session, id);
        return NextResponse.json({ success: true, data: deleted });
    } catch (err) {
        if (err instanceof OutsourceUserError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaOutsourceUsersDELETE", err);
    }
}

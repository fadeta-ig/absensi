import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { birthdayStatusUpdateSchema } from "@/lib/validations/validationSchemas";
import {
    updateBirthdayPreparationStatus,
    deleteBirthdayPreparationStatus,
} from "@/lib/services/birthdayService";

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const { id } = await params;

        const validation = await validateBody(request, birthdayStatusUpdateSchema);
        if ("error" in validation) return validation.error;

        const updated = await updateBirthdayPreparationStatus(id, validation.data);

        return NextResponse.json({
            success: true,
            data: updated,
        });
    } catch (error) {
        return serverErrorResponse("BirthdayStatusPUT", error);
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const { id } = await params;

        await deleteBirthdayPreparationStatus(id);

        return NextResponse.json({
            success: true,
            message: "Status persiapan berhasil dihapus.",
        });
    } catch (error) {
        return serverErrorResponse("BirthdayStatusDELETE", error);
    }
}

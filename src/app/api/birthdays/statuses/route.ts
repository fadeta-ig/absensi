import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { birthdayStatusCreateSchema } from "@/lib/validations/validationSchemas";
import {
    getBirthdayPreparationStatuses,
    createBirthdayPreparationStatus,
} from "@/lib/services/birthdayService";

export async function GET() {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const statuses = await getBirthdayPreparationStatuses();

        return NextResponse.json({
            success: true,
            data: statuses,
        });
    } catch (error) {
        return serverErrorResponse("BirthdayStatusesGET", error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const validation = await validateBody(request, birthdayStatusCreateSchema);
        if ("error" in validation) return validation.error;

        const newStatus = await createBirthdayPreparationStatus(validation.data);

        return NextResponse.json({
            success: true,
            data: newStatus,
        });
    } catch (error) {
        return serverErrorResponse("BirthdayStatusesPOST", error);
    }
}

import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { birthdayPreparationUpdateSchema } from "@/lib/validations/validationSchemas";
import { upsertEmployeeBirthdayPreparation } from "@/lib/services/birthdayService";

export async function PUT(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const validation = await validateBody(request, birthdayPreparationUpdateSchema);
        if ("error" in validation) return validation.error;

        const { employeeId, year, statusId, notes } = validation.data;
        const actorName = session.name || session.username || "HR Admin";

        const result = await upsertEmployeeBirthdayPreparation(
            employeeId,
            year,
            statusId ?? null,
            notes,
            actorName
        );

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        return serverErrorResponse("BirthdayPreparationPUT", error);
    }
}

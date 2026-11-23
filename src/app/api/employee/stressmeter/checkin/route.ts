import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canUseEmployeePortal } from "@/lib/permissions";
import { stressmeterCheckinSchema } from "@/lib/validations/validationSchemas";
import {
    StressmeterDomainError,
    submitEmployeeCheckin,
} from "@/lib/services/stressmeterService";

export async function POST(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canUseEmployeePortal(session) || !session.employeeId) {
            return forbiddenResponse();
        }

        const validation = await validateBody(request, stressmeterCheckinSchema);
        if ("error" in validation) return validation.error;

        const result = await submitEmployeeCheckin(session.employeeId, validation.data);

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof StressmeterDomainError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return serverErrorResponse("EmployeeStressmeterCheckinPOST", error);
    }
}

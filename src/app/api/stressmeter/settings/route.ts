import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { stressmeterSettingSchema } from "@/lib/validations/validationSchemas";
import {
    isStressmeterEnabled,
    setStressmeterEnabled,
} from "@/lib/services/stressmeterService";

export async function GET() {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const enabled = await isStressmeterEnabled();
        return NextResponse.json({
            success: true,
            data: { enabled },
        });
    } catch (error) {
        return serverErrorResponse("HrStressmeterSettingsGET", error);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const validation = await validateBody(request, stressmeterSettingSchema);
        if ("error" in validation) return validation.error;

        const updated = await setStressmeterEnabled(validation.data.enabled, session.userId);
        return NextResponse.json({
            success: true,
            data: updated,
        });
    } catch (error) {
        return serverErrorResponse("HrStressmeterSettingsPUT", error);
    }
}

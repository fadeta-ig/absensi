import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { birthdayReminderSettingSchema } from "@/lib/validations/validationSchemas";
import {
    getBirthdayReminderSettings,
    updateBirthdayReminderSettings,
} from "@/lib/services/birthdayService";
import { isEmailConfigured } from "@/lib/services/emailService";

export async function GET() {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const settings = await getBirthdayReminderSettings();

        return NextResponse.json({
            success: true,
            data: settings,
            isSmtpConfigured: isEmailConfigured(),
        });
    } catch (error) {
        return serverErrorResponse("BirthdaySettingsGET", error);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const validation = await validateBody(request, birthdayReminderSettingSchema);
        if ("error" in validation) return validation.error;

        const actorName = session.name || session.username || "HR Admin";
        const updated = await updateBirthdayReminderSettings(validation.data, actorName);

        return NextResponse.json({
            success: true,
            data: updated,
            isSmtpConfigured: isEmailConfigured(),
        });
    } catch (error) {
        return serverErrorResponse("BirthdaySettingsPUT", error);
    }
}

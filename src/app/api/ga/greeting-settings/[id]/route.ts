import { NextRequest, NextResponse } from "next/server";
import {
    forbiddenResponse,
    requireAuth,
    serverErrorResponse,
    unauthorizedResponse,
    validateBody,
} from "@/lib/middleware/apiGuard";
import { AppSettingsError } from "@/lib/services/appSettingsService";
import {
    canManageGreeting,
    deleteGreetingRule,
    updateGreetingRule,
} from "@/lib/services/greetingSettingsService";
import { greetingRuleIdSchema, greetingRuleSchema } from "../schema";

/**
 * PUT/DELETE /api/ga/greeting-settings/[id] — ubah atau hapus satu aturan.
 * WIG002 dengan `ga.manage` ATAU satu karyawan yang ditunjuk.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!(await canManageGreeting(session))) return forbiddenResponse();

    const { id } = await params;
    const parsedId = greetingRuleIdSchema.safeParse(id);
    if (!parsedId.success) {
        return NextResponse.json({ error: "ID sapaan tidak valid." }, { status: 400 });
    }

    const validation = await validateBody(request, greetingRuleSchema);
    if ("error" in validation) return validation.error;

    try {
        const rule = await updateGreetingRule(parsedId.data, validation.data, session.userId);
        return NextResponse.json({ success: true, data: { rule } });
    } catch (err) {
        if (err instanceof AppSettingsError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreetingSettingsPUT", err);
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!(await canManageGreeting(session))) return forbiddenResponse();

    const { id } = await params;
    const parsedId = greetingRuleIdSchema.safeParse(id);
    if (!parsedId.success) {
        return NextResponse.json({ error: "ID sapaan tidak valid." }, { status: 400 });
    }

    try {
        await deleteGreetingRule(parsedId.data);
        return NextResponse.json({ success: true, data: { id: parsedId.data } });
    } catch (err) {
        if (err instanceof AppSettingsError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreetingSettingsDELETE", err);
    }
}

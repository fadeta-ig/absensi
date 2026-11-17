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
    createGreetingRule,
    listGreetingRules,
} from "@/lib/services/greetingSettingsService";
import { greetingRuleSchema } from "./schema";

/**
 * GET/POST /api/ga/greeting-settings — daftar dan tambah aturan sapaan.
 * WIG002 dengan `ga.manage` ATAU satu karyawan yang ditunjuk.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!(await canManageGreeting(session))) return forbiddenResponse();

    try {
        const rules = await listGreetingRules();
        return NextResponse.json({ success: true, data: { rules } });
    } catch (err) {
        return serverErrorResponse("GreetingSettingsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!(await canManageGreeting(session))) return forbiddenResponse();

    const validation = await validateBody(request, greetingRuleSchema);
    if ("error" in validation) return validation.error;

    try {
        const rule = await createGreetingRule(validation.data, session.userId);
        return NextResponse.json({ success: true, data: { rule } }, { status: 201 });
    } catch (err) {
        if (err instanceof AppSettingsError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreetingSettingsPOST", err);
    }
}

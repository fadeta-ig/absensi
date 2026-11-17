import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    forbiddenResponse,
    requireAuth,
    serverErrorResponse,
    unauthorizedResponse,
    validateBody,
} from "@/lib/middleware/apiGuard";
import { AppSettingsError } from "@/lib/services/appSettingsService";
import {
    getGreetingEditorInfo,
    isWig002Session,
    listGreetingEditorCandidates,
    updateGreetingEditor,
} from "@/lib/services/greetingSettingsService";

const editorSchema = z.object({
    employeeId: z.string().trim().max(100).nullable(),
});

/**
 * GET/PUT /api/ga/greeting-settings/editor — penunjukan satu karyawan yang
 * boleh ikut mengedit teks sapaan. HANYA WIG002 dengan `ga.manage`.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002Session(session)) return forbiddenResponse();

    try {
        const [editor, options] = await Promise.all([
            getGreetingEditorInfo(),
            listGreetingEditorCandidates(),
        ]);
        return NextResponse.json({ success: true, data: { editor, options } });
    } catch (err) {
        return serverErrorResponse("GreetingSettingsEditorGET", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002Session(session)) return forbiddenResponse();

    const validation = await validateBody(request, editorSchema);
    if ("error" in validation) return validation.error;

    try {
        const employeeId = await updateGreetingEditor(validation.data.employeeId, session.userId);
        const editor = await getGreetingEditorInfo();
        return NextResponse.json({ success: true, data: { employeeId, editor } });
    } catch (err) {
        if (err instanceof AppSettingsError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreetingSettingsEditorPUT", err);
    }
}

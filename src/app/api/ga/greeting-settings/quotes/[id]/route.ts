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
    deleteEmployeeGreetingQuote,
    updateEmployeeGreetingQuote,
} from "@/lib/services/greetingSettingsService";
import { greetingQuoteUpdateSchema, greetingRuleIdSchema } from "../../schema";

/**
 * PATCH/DELETE /api/ga/greeting-settings/quotes/[id] — kurasi, ubah, atau hapus
 * satu quotes kiriman karyawan. Dapat diakses oleh WIG001, WIG002, atau editor terpilih.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!(await canManageGreeting(session))) return forbiddenResponse();

    const { id } = await params;
    const parsedId = greetingRuleIdSchema.safeParse(id);
    if (!parsedId.success) {
        return NextResponse.json({ error: "ID quotes tidak valid." }, { status: 400 });
    }

    const validation = await validateBody(request, greetingQuoteUpdateSchema);
    if ("error" in validation) return validation.error;

    try {
        const quote = await updateEmployeeGreetingQuote(
            parsedId.data,
            validation.data,
            session.userId
        );
        return NextResponse.json({ success: true, data: { quote } });
    } catch (err) {
        if (err instanceof AppSettingsError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreetingQuotesPATCH", err);
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
        return NextResponse.json({ error: "ID quotes tidak valid." }, { status: 400 });
    }

    try {
        await deleteEmployeeGreetingQuote(parsedId.data);
        return NextResponse.json({ success: true, data: { id: parsedId.data } });
    } catch (err) {
        if (err instanceof AppSettingsError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreetingQuotesDELETE", err);
    }
}

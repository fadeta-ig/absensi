import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getTemplates, createTemplate, updateTemplate, isWig002, CleaningError } from "@/lib/services/cleaningService";
import { z } from "zod";

const createTemplateSchema = z.object({
    name: z.string().min(1, "Nama template wajib diisi").max(200),
});

const updateTemplateSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
});

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const templates = await getTemplates();
        return NextResponse.json({ success: true, data: templates });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningTemplatesGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, createTemplateSchema);
        if ("error" in result) return result.error;

        const template = await createTemplate(session, result.data);
        return NextResponse.json({ success: true, data: template }, { status: 201 });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningTemplatesPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, updateTemplateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;
        const template = await updateTemplate(session, id, data);
        return NextResponse.json({ success: true, data: template });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningTemplatesPATCH", err);
    }
}

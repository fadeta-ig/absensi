import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getTemplateItems, createTemplateItem, updateTemplateItem, isWig002, CleaningError } from "@/lib/services/cleaningService";
import { z } from "zod";

const createItemSchema = z.object({
    templateId: z.string().min(1, "Template wajib dipilih"),
    name: z.string().min(1, "Nama item wajib diisi").max(200),
    sortOrder: z.number().int().min(0).optional(),
});

const updateItemSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(200).optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const templateId = searchParams.get("templateId");
        if (!templateId) {
            return NextResponse.json({ error: "Parameter templateId wajib diisi." }, { status: 400 });
        }

        const items = await getTemplateItems(templateId);
        return NextResponse.json({ success: true, data: items });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningTemplateItemsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, createItemSchema);
        if ("error" in result) return result.error;

        const item = await createTemplateItem(session, result.data);
        return NextResponse.json({ success: true, data: item }, { status: 201 });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningTemplateItemsPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, updateItemSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;
        const item = await updateTemplateItem(session, id, data);
        return NextResponse.json({ success: true, data: item });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningTemplateItemsPATCH", err);
    }
}

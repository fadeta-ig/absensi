import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { updateChecklistItem, CleaningError } from "@/lib/services/cleaningService";
import { z } from "zod";

const updateItemSchema = z.object({
    isComplete: z.boolean(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes("cleaning.execute")) return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, updateItemSchema);
        if ("error" in result) return result.error;

        const data = await updateChecklistItem(session, id, result.data.isComplete);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningChecklistItemPATCH", err);
    }
}

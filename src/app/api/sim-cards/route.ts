import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getSimCards, createSimCard } from "@/lib/services/simCardService";
import { z } from "zod";
import logger from "@/lib/logger";

const simCardCreateSchema = z.object({
    phoneNumber: z.string().min(1, "Nomor HP wajib diisi"),
    provider: z.string().min(1, "Provider wajib diisi"),
    expiredDate: z.string().nullable().optional(),
    assignedToId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
});

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const result = await getSimCards();
        return NextResponse.json({ data: result, meta: { total: result.length, page: 1, limit: result.length, totalPages: 1 } });
    } catch (err) {
        return serverErrorResponse("SimCardsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const result = await validateBody(request, simCardCreateSchema);
        if ("error" in result) return result.error;

        const simCard = await createSimCard(result.data);
        logger.info("SIM Card created", { id: simCard.id, performedBy: session.username });
        return NextResponse.json(simCard, { status: 201 });
    } catch (err) {
        return serverErrorResponse("SimCardsPOST", err);
    }
}
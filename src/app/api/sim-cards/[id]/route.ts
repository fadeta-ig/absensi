import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { getSimCardById, updateSimCard, deleteSimCard } from "@/lib/services/simCardService";
import { z } from "zod";
import logger from "@/lib/logger";

const simCardUpdateSchema = z.object({
    phoneNumber: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    expiredDate: z.string().nullable().optional(),
    assignedToId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const { id } = await params;
        const simCard = await getSimCardById(id);
        if (!simCard) return NextResponse.json({ error: "SIM Card tidak ditemukan" }, { status: 404 });

        return NextResponse.json(simCard);
    } catch (err) {
        return serverErrorResponse("SimCardGET", err);
    }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, simCardUpdateSchema);
        if ("error" in result) return result.error;

        const simCard = await updateSimCard(id, result.data);
        if (!simCard) return NextResponse.json({ error: "SIM Card tidak ditemukan" }, { status: 404 });

        logger.info("SIM Card updated", { id: simCard.id, performedBy: session.employeeId });
        return NextResponse.json(simCard);
    } catch (err) {
        return serverErrorResponse("SimCardPUT", err);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga") return forbiddenResponse();

    try {
        const { id } = await params;
        const success = await deleteSimCard(id);
        if (!success) return NextResponse.json({ error: "SIM Card tidak ditemukan" }, { status: 404 });

        logger.warn("SIM Card deleted", { id, performedBy: session.employeeId });
        return NextResponse.json({ success: true, message: "SIM Card berhasil dihapus" });
    } catch (err) {
        return serverErrorResponse("SimCardDELETE", err);
    }
}

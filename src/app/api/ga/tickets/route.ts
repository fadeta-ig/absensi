import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { forbiddenResponse, requireAuth, unauthorizedResponse, serverErrorResponse, validateBody } from "@/lib/middleware/apiGuard";
import { logAction } from "@/lib/services/auditService";
import { z } from "zod";

const ticketUpdateSchema = z.object({
    id: z.string(),
    status: z.enum(["PENDING", "IN_PROGRESS", "APPROVED", "REJECTED", "RESOLVED"]),
    gaResponse: z.string().optional(),
});

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

        const tickets = await prisma.assetTicket.findMany({
            orderBy: [{ status: "asc" }, { createdAt: "desc" }],
            include: {
                employee: { select: { name: true, employeeId: true } },
                asset: { select: { name: true, assetCode: true, serialNumber: true } }
            }
        });

        return NextResponse.json(tickets);
    } catch (err) {
        return serverErrorResponse("GATicketGET", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

        const result = await validateBody(request, ticketUpdateSchema);
        if ("error" in result) return result.error;

        const { id, status, gaResponse } = result.data;

        const ticket = await prisma.assetTicket.update({
            where: { id },
            data: {
                status,
                gaResponse: gaResponse || null,
            }
        });

        // Audit Trail Injection
        await logAction(
            `UPDATE_TICKET_${status}`,
            "ASSET_TICKET",
            session.employeeId,
            ticket.ticketCode,
            { newStatus: status, response: gaResponse }
        );

        return NextResponse.json(ticket);
    } catch (err) {
        return serverErrorResponse("GATicketPUT", err);
    }
}

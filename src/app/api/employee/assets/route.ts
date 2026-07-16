import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { requireAuth, unauthorizedResponse, serverErrorResponse, validateBody } from "@/lib/middleware/apiGuard";
import { logAction } from "@/lib/services/auditService";
import { z } from "zod";

const ticketSchema = z.object({
    type: z.enum(["NEW_REQUEST", "DAMAGE_REPORT"]),
    assetId: z.string().optional(),
    title: z.string().min(3),
    description: z.string().min(10),
});

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();

        const [assets, tickets] = await Promise.all([
            prisma.asset.findMany({
                where: { assignedToId: session.employeeId },
                include: { categoryRel: true }
            }),
            prisma.assetTicket.findMany({
                where: { employeeId: session.employeeId },
                orderBy: { createdAt: "desc" },
                include: { asset: { select: { name: true, assetCode: true } } }
            })
        ]);

        return NextResponse.json({ assets, tickets });
    } catch (err) {
        return serverErrorResponse("EmpAssetGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();

        const result = await validateBody(request, ticketSchema);
        if ("error" in result) return result.error;

        const { type, assetId, title, description } = result.data;

        // Generate Ticket Code: TKT-YYYYMMDD-XXXX
        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, "");
        const count = await prisma.assetTicket.count({
            where: { ticketCode: { startsWith: `TKT-${dateStr}` } }
        });
        const ticketCode = `TKT-${dateStr}-${(count + 1).toString().padStart(3, "0")}`;

        const ticket = await prisma.assetTicket.create({
            data: {
                ticketCode,
                employeeId: session.employeeId,
                type,
                assetId: assetId || null,
                title,
                description,
            }
        });

        // Audit Trail Injection
        await logAction(
            `CREATE_TICKET_${type}`,
            "ASSET_TICKET",
            session.employeeId,
            ticketCode,
            { title, assetId }
        );

        return NextResponse.json(ticket, { status: 201 });
    } catch (err) {
        return serverErrorResponse("EmpAssetPOST", err);
    }
}

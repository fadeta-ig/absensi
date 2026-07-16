import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { forbiddenResponse, requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (session.role !== "hr") return forbiddenResponse();

        // Ambil query parameter
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "100", 10);
        const offset = parseInt(searchParams.get("offset") || "0", 10);
        const action = searchParams.get("action");
        const entity = searchParams.get("entity");

        // Build where clause
        const where: Prisma.AuditLogWhereInput = {};
        if (action) where.action = { contains: action };
        if (entity) where.entity = { contains: entity };

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
                include: {
                    user: {
                        select: { displayName: true, username: true }
                    }
                }
            }),
            prisma.auditLog.count({ where })
        ]);

        return NextResponse.json({
            data: logs,
            pagination: {
                total,
                limit,
                offset,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        return serverErrorResponse("AuditLogGET", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return unauthorizedResponse();
        }

        // Ambil query parameter
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "100", 10);
        const offset = parseInt(searchParams.get("offset") || "0", 10);
        const action = searchParams.get("action");
        const entity = searchParams.get("entity");

        // Build where clause
        const where: any = {};
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
                        select: { name: true, employeeId: true }
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

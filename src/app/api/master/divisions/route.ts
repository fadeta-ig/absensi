import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import logger from "@/lib/logger";

const divisionSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Nama divisi harus diisi"),
    code: z.string().nullish(),
    description: z.string().nullish(),
    isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const divisions = await prisma.division.findMany({
            orderBy: { name: "asc" },
            include: {
                _count: { select: { departments: true } },
            },
        });
        return NextResponse.json(divisions);
    } catch (err) {
        return serverErrorResponse("MasterDivisionGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, divisionSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const division = await prisma.division.create({
            data: {
                name: body.name,
                isActive: body.isActive,
            },
        });

        logger.info("Division created", { id: division.id, name: division.name, createdBy: session.employeeId });
        return NextResponse.json(division, { status: 201 });
    } catch (err) {
        return serverErrorResponse("MasterDivisionPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, divisionSchema);
        if ("error" in result) return result.error;
        const { id, name, isActive } = result.data;

        if (!id) {
            return NextResponse.json({ error: "ID divisi diperlukan." }, { status: 400 });
        }

        const division = await prisma.division.update({
            where: { id },
            data: { name, isActive },
        });

        logger.info("Division updated", { id, updatedBy: session.employeeId });
        return NextResponse.json(division);
    } catch (err) {
        return serverErrorResponse("MasterDivisionPUT", err);
    }
}

export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID divisi diperlukan." }, { status: 400 });
        }

        await prisma.division.delete({ where: { id } });

        logger.info("Division deleted", { id, deletedBy: session.employeeId });
        return NextResponse.json({ success: true, message: "Divisi berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("MasterDivisionDELETE", err);
    }
}

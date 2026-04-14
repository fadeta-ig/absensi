import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import logger from "@/lib/logger";

const positionSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Nama jabatan harus diisi"),
    description: z.string().nullish(),
    isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const positions = await prisma.position.findMany({
            orderBy: { name: "asc" },
        });
        return NextResponse.json(positions);
    } catch (err) {
        return serverErrorResponse("MasterPositionGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, positionSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const position = await prisma.position.create({
            data: {
                name: body.name,
                isActive: body.isActive,
            },
        });

        logger.info("Position created", { id: position.id, name: position.name, createdBy: session.employeeId });
        return NextResponse.json(position, { status: 201 });
    } catch (err) {
        return serverErrorResponse("MasterPositionPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, positionSchema);
        if ("error" in result) return result.error;
        const { id, name, isActive } = result.data;

        if (!id) {
            return NextResponse.json({ error: "ID jabatan diperlukan." }, { status: 400 });
        }

        const position = await prisma.position.update({
            where: { id },
            data: {
                name,
                isActive,
            },
        });

        logger.info("Position updated", { id, updatedBy: session.employeeId });
        return NextResponse.json(position);
    } catch (err) {
        return serverErrorResponse("MasterPositionPUT", err);
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
            return NextResponse.json({ error: "ID jabatan diperlukan." }, { status: 400 });
        }

        await prisma.position.delete({ where: { id } });

        logger.info("Position deleted", { id, deletedBy: session.employeeId });
        return NextResponse.json({ success: true, message: "Jabatan berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("MasterPositionDELETE", err);
    }
}

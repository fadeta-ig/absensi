import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import logger from "@/lib/logger";

const departmentSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Nama departemen harus diisi"),
    divisionId: z.string().min(1, "Divisi harus dipilih"),
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
        const { searchParams } = new URL(request.url);
        const divisionId = searchParams.get("divisionId");

        const departments = await prisma.department.findMany({
            where: divisionId ? { divisionId } : {},
            orderBy: { name: "asc" },
            include: { division: { select: { name: true } } },
        });

        return NextResponse.json(departments);
    } catch (err) {
        return serverErrorResponse("MasterDepartmentGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, departmentSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const department = await prisma.department.create({
            data: {
                name: body.name,
                code: body.code || null,
                description: body.description || null,
                divisionId: body.divisionId,
                isActive: body.isActive,
            },
            include: { division: { select: { name: true } } },
        });

        logger.info("Department created", { id: department.id, name: department.name, createdBy: session.username });
        return NextResponse.json(department, { status: 201 });
    } catch (err) {
        return serverErrorResponse("MasterDepartmentPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, departmentSchema);
        if ("error" in result) return result.error;
        const { id, ...data } = result.data;

        if (!id) {
            return NextResponse.json({ error: "ID departemen diperlukan." }, { status: 400 });
        }

        const department = await prisma.department.update({
            where: { id },
            data,
            include: { division: { select: { name: true } } },
        });

        logger.info("Department updated", { id, updatedBy: session.username });
        return NextResponse.json(department);
    } catch (err) {
        return serverErrorResponse("MasterDepartmentPUT", err);
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
            return NextResponse.json({ error: "ID departemen diperlukan." }, { status: 400 });
        }

        await prisma.department.delete({ where: { id } });

        logger.info("Department deleted", { id, deletedBy: session.username });
        return NextResponse.json({ success: true, message: "Departemen berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("MasterDepartmentDELETE", err);
    }
}

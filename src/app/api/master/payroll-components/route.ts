import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import logger from "@/lib/logger";

const payrollComponentSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Nama komponen harus diisi"),
    type: z.enum(["earning", "deduction"]),
    defaultAmount: z.number().min(0).default(0),
    isFixed: z.boolean().default(true),
    isTaxable: z.boolean().default(true),
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
        const components = await prisma.payrollComponent.findMany({
            orderBy: [{ type: "asc" }, { name: "asc" }],
        });
        return NextResponse.json(components);
    } catch (err) {
        return serverErrorResponse("MasterPayrollComponentGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, payrollComponentSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const component = await prisma.payrollComponent.create({
            data: {
                name: body.name,
                type: body.type,
                defaultAmount: body.defaultAmount ?? 0,
                description: body.description || null,
                isActive: body.isActive,
            },
        });

        logger.info("Payroll component created", { id: component.id, name: component.name, createdBy: session.employeeId });
        return NextResponse.json(component, { status: 201 });
    } catch (err) {
        return serverErrorResponse("MasterPayrollComponentPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, payrollComponentSchema);
        if ("error" in result) return result.error;
        const { id, name, type, defaultAmount, description, isActive } = result.data;

        if (!id) {
            return NextResponse.json({ error: "ID komponen diperlukan." }, { status: 400 });
        }

        const component = await prisma.payrollComponent.update({
            where: { id },
            data: {
                name,
                type,
                defaultAmount: defaultAmount ?? 0,
                description: description || undefined,
                isActive,
            },
        });

        logger.info("Payroll component updated", { id, updatedBy: session.employeeId });
        return NextResponse.json(component);
    } catch (err) {
        return serverErrorResponse("MasterPayrollComponentPUT", err);
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
            return NextResponse.json({ error: "ID komponen diperlukan." }, { status: 400 });
        }

        await prisma.payrollComponent.delete({ where: { id } });

        logger.info("Payroll component deleted", { id, deletedBy: session.employeeId });
        return NextResponse.json({ success: true, message: "Komponen gaji berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("MasterPayrollComponentDELETE", err);
    }
}

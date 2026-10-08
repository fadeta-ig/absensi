import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002 } from "@/lib/services/appointmentService";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const employeesQuerySchema = z.object({
    q: z.string().trim().max(50).optional().default(""),
    limit: z.coerce.number().int().min(1).max(200).optional().default(20),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session) && !session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const parsed = employeesQuerySchema.safeParse({
            q: searchParams.get("q") ?? "",
            limit: searchParams.get("limit") ?? undefined,
        });
        if (!parsed.success) {
            return NextResponse.json({ error: "Parameter pencarian tidak valid." }, { status: 400 });
        }
        const query = parsed.data.q.trim();
        const limit = parsed.data.limit;

        const whereCondition = {
            isActive: true,
            ...(query
                ? {
                    OR: [
                        { name: { contains: query } },
                        { employeeId: { contains: query } },
                    ],
                }
                : {}),
        };

        const employees = await prisma.employee.findMany({
            where: whereCondition,
            select: {
                id: true,
                employeeId: true,
                name: true,
                departmentRel: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                divisionRel: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                positionRel: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: { name: "asc" },
            take: limit,
        });

        return NextResponse.json(
            employees.map((emp) => ({
                employeeId: emp.employeeId,
                name: emp.name,
                department: emp.departmentRel?.name || "-",
                position: emp.positionRel?.name || "-",
            }))
        );
    } catch (err) {
        return serverErrorResponse("AppointmentEmployeesGET", err);
    }
}

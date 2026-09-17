import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get("q")?.trim() || "";

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
            take: 20,
        });

        // Format data agar mudah dikonsumsi frontend
        const formatted = employees.map((emp) => ({
            id: emp.id,
            employeeId: emp.employeeId,
            name: emp.name,
            department: emp.departmentRel?.name || "-",
            departmentId: emp.departmentRel?.id || null,
            division: emp.divisionRel?.name || "-",
            divisionId: emp.divisionRel?.id || null,
            position: emp.positionRel?.name || "-",
        }));

        return NextResponse.json(formatted);
    } catch (err) {
        return serverErrorResponse("GreenMeetingEmployeesGET", err);
    }
}

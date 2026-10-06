import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import { canManageGreenMeeting } from "@/lib/services/greenMeetingService";
import { PERMISSIONS } from "@/lib/permissions";
import { z } from "zod";

const employeesQuerySchema = z.object({
    q: z.string().trim().max(50).optional().default(""),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // Autocomplete karyawan: GA pengelola atau HR pemantau (kontrak documentasikan GA-only sebelumnya).
    const isManager = await canManageGreenMeeting(session);
    const isHr = session.permissions.includes(PERMISSIONS.HR_MANAGE);
    if (!isManager && !isHr) return forbiddenResponse();

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
                        { name: { contains: query, mode: "insensitive" as const } },
                        { employeeId: { contains: query, mode: "insensitive" as const } },
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

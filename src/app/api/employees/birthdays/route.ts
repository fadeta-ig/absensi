import { NextRequest, NextResponse } from "next/server";
import {
    forbiddenResponse,
    requireAuth,
    unauthorizedResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { canManageHr } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toEmployeeBirthday } from "@/lib/services/birthdayService";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const employees = await prisma.employee.findMany({
            where: {
                isActive: true,
                privateProfile: { is: { birthDate: { not: null } } },
            },
            select: {
                employeeId: true,
                name: true,
                privateProfile: { select: { birthDate: true } },
            },
            orderBy: { name: "asc" },
        });

        const birthdays = employees.flatMap((employee) => {
            const birthDate = employee.privateProfile?.birthDate;
            return birthDate
                ? [toEmployeeBirthday(employee.employeeId, employee.name, birthDate)]
                : [];
        });

        return NextResponse.json(birthdays, {
            headers: { "Cache-Control": "private, max-age=3600" },
        });
    } catch (error) {
        return serverErrorResponse("EmployeeBirthdaysGET", error);
    }
}

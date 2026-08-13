import { NextRequest, NextResponse } from "next/server";
import {
    forbiddenResponse,
    requireAuth,
    serverErrorResponse,
    unauthorizedResponse,
    validateBody,
} from "@/lib/middleware/apiGuard";
import { employeeStatusChangeSchema } from "@/lib/validations/validationSchemas";
import {
    changeEmployeeStatus,
    EmployeeStatusError,
    getEmployeeStatusOverview,
} from "@/lib/services/employeeStatusService";
import logger from "@/lib/logger";
import { canManageHr } from "@/lib/permissions";
import { actorFromSession } from "@/lib/services/auditService";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const { id } = await context.params;
        const overview = await getEmployeeStatusOverview(id);
        if (!overview) return NextResponse.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
        return NextResponse.json(overview);
    } catch (error) {
        return serverErrorResponse("EmployeeStatusGET", error);
    }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, employeeStatusChangeSchema);
        if ("error" in result) return result.error;

        const { id } = await context.params;
        const changed = await changeEmployeeStatus(id, result.data, actorFromSession(session));
        logger.info("Employee status changed", {
            employeeId: changed.employee.employeeId,
            isActive: changed.employee.isActive,
            changedBy: session.username,
        });

        return NextResponse.json({
            success: true,
            message: `Karyawan berhasil ${changed.employee.isActive ? "diaktifkan kembali" : "dinonaktifkan"}.`,
            ...changed,
        });
    } catch (error) {
        if (error instanceof EmployeeStatusError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return serverErrorResponse("EmployeeStatusPATCH", error);
    }
}

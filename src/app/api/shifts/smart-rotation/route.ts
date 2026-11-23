import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import {
    AppSettingsError,
    getSmartShiftEmployeeIds,
    getSmartShiftEmployeeInfos,
    MAX_SMART_SHIFT_EMPLOYEES,
    setSmartShiftEmployees,
} from "@/lib/services/appSettingsService";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import { PERMISSIONS } from "@/lib/permissions";
import { z } from "zod";
import logger from "@/lib/logger";

const updateSmartShiftSchema = z.object({
    employeeIds: z
        .array(z.string().trim().min(1, "ID karyawan tidak boleh kosong").max(100))
        .max(MAX_SMART_SHIFT_EMPLOYEES, `Maksimal ${MAX_SMART_SHIFT_EMPLOYEES} karyawan.`),
});

function canManageSmartShift(session: Awaited<ReturnType<typeof requireAuth>>): boolean {
    return Boolean(
        session &&
            session.username === "WIG001" &&
            session.permissions.includes(PERMISSIONS.HR_MANAGE)
    );
}

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const [employeeIds, employees] = await Promise.all([
            getSmartShiftEmployeeIds(),
            getSmartShiftEmployeeInfos(),
        ]);
        return NextResponse.json(
            {
                employeeIds,
                employees,
                canManage: canManageSmartShift(session),
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (err) {
        return serverErrorResponse("SmartShiftRotationGET", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageSmartShift(session)) return forbiddenResponse();

    try {
        const parsed = await validateBody(request, updateSmartShiftSchema);
        if ("error" in parsed) return parsed.error;

        const previousIds = await getSmartShiftEmployeeIds();
        const updated = await setSmartShiftEmployees(parsed.data.employeeIds, session.userId ?? null);
        const employees = await getSmartShiftEmployeeInfos();

        await logAction(
            "UPDATE_SMART_SHIFT_EMPLOYEES",
            "AppSetting",
            actorFromSession(session),
            updated.key,
            {
                previousEmployeeIds: previousIds,
                employeeIds: updated.employeeIds,
            }
        );

        logger.info("Smart 3-shift rotation employees updated", {
            updatedBy: session.username,
            count: updated.employeeIds.length,
            employeeIds: updated.employeeIds,
        });

        return NextResponse.json({
            success: true,
            employeeIds: updated.employeeIds,
            employees,
            canManage: true,
        });
    } catch (err) {
        if (err instanceof AppSettingsError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("SmartShiftRotationPUT", err);
    }
}

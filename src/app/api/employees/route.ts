import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import bcrypt from "bcryptjs";
import {
    getVisibleEmployees,
    createEmployee,
    updateEmployee,
    type EmployeeStatusFilter,
    type EmployeeWithRelations,
} from "@/lib/services/employeeService";
import { employeeCreateSchema, employeeUpdateSchema } from "@/lib/validations/validationSchemas";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import logger from "@/lib/logger";
import { canManageHr } from "@/lib/permissions";

function serializeEmployee(employee: EmployeeWithRelations, includeHrData: boolean) {
    const {
        faceDescriptor: _faceDescriptor,
        ...safe
    } = employee;
    void _faceDescriptor;

    const organization = {
        department: employee.departmentRel?.name || "-",
        division: employee.divisionRel?.name || "-",
        position: employee.positionRel?.name || "-",
    };

    if (includeHrData) return { ...safe, ...organization };

    return {
        id: safe.id,
        employeeId: safe.employeeId,
        name: safe.name,
        departmentId: safe.departmentId,
        divisionId: safe.divisionId,
        positionId: safe.positionId,
        managerId: safe.managerId,
        joinDate: safe.joinDate,
        isActive: safe.isActive,
        shiftId: safe.shiftId,
        bypassLocation: safe.bypassLocation,
        locations: safe.locations,
        manager: safe.manager,
        subordinates: safe.subordinates,
        ...organization,
    };
}

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const statusParam = new URL(request.url).searchParams.get("status") ?? "active";
        if (!(["active", "inactive", "all"] as const).includes(statusParam as EmployeeStatusFilter)) {
            return NextResponse.json({ error: "Filter status tidak valid." }, { status: 400 });
        }

        const status = statusParam as EmployeeStatusFilter;
        if (!canManageHr(session) && status !== "active") return forbiddenResponse();

        const employees = (await getVisibleEmployees(session, status))
            .map((employee) => serializeEmployee(employee, canManageHr(session)));

        return NextResponse.json(employees);
    } catch (err) {
        return serverErrorResponse("EmployeesGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, employeeCreateSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        // Generate random password for new employee
        const { randomBytes } = await import("crypto");
        const plainPassword = randomBytes(9).toString("base64url");
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        const employee = await createEmployee({
            ...body,
            passwordHash: hashedPassword,
            createdByUserId: session.userId,
            isActive: true,
        });

        // Send password via email (Synchronous with try/catch for reliability)
        let emailWarning = false;
        try {
            const { sendPasswordEmail } = await import("@/lib/services/emailService");
            await sendPasswordEmail(employee.email, employee.name, plainPassword);
        } catch (emailErr) {
            logger.warn("Gagal kirim email password untuk karyawan baru", { employeeId: employee.employeeId, error: emailErr });
            emailWarning = true;
        }

        logger.info("New employee created", { employeeId: employee.employeeId, createdBy: session.username });
        await logAction("CREATE", "Employee", actorFromSession(session), employee.id, { employeeId: employee.employeeId, name: employee.name });

        return NextResponse.json({ ...serializeEmployee(employee, true), _emailWarning: emailWarning }, { status: 201 });
    } catch (err: unknown) {
        const prismaError = err as { code?: string };
        if (prismaError.code === "P2002") {
            return NextResponse.json({ error: "ID Karyawan sudah terdaftar. Gunakan ID lain." }, { status: 400 });
        }
        if (prismaError.code === "P2003") {
            return NextResponse.json({ error: "Data referensi tidak valid (shift/atasan). Silakan periksa kembali." }, { status: 400 });
        }
        return serverErrorResponse("EmployeesPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, employeeUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;

        const updated = await updateEmployee(id, data);
        if (!updated) {
            return NextResponse.json({ error: "Data karyawan tidak ditemukan." }, { status: 404 });
        }

        logger.info("Employee updated", { targetId: updated.employeeId, updatedBy: session.username });
        await logAction("UPDATE", "Employee", actorFromSession(session), updated.id, data);

        return NextResponse.json(serializeEmployee(updated, true));
    } catch (err: unknown) {
        if ((err as { code?: string })?.code === "P2002") {
            return NextResponse.json({ error: "ID Karyawan sudah digunakan oleh akun lain." }, { status: 400 });
        }
        return serverErrorResponse("EmployeesPUT", err);
    }
}

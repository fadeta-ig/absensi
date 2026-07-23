import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
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
    const organization = {
        department: employee.departmentRel?.name || "-",
        division: employee.divisionRel?.name || "-",
        position: employee.positionRel?.name || "-",
    };

    const publicData = {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        academicTitle: employee.academicTitle,
        preferredName: employee.preferredName,
        departmentId: employee.departmentId,
        divisionId: employee.divisionId,
        positionId: employee.positionId,
        managerId: employee.managerId,
        employmentType: employee.employmentType,
        joinDate: employee.joinDate,
        employmentStartDate: employee.employmentStartDate,
        employmentEndDate: employee.employmentEndDate,
        probationEndDate: employee.probationEndDate,
        isActive: employee.isActive,
        statusChangedAt: employee.statusChangedAt,
        shiftId: employee.shiftId,
        bypassLocation: employee.bypassLocation,
        locations: employee.locations,
        manager: employee.manager,
        subordinates: employee.subordinates,
        ...organization,
    };

    if (!includeHrData) return publicData;
    return {
        ...publicData,
        email: employee.email,
        phone: employee.phone,
        alternatePhone: employee.alternatePhone,
        gender: employee.gender,
        totalLeave: employee.totalLeave,
        usedLeave: employee.usedLeave,
        avatarUrl: employee.avatarUrl,
        basicSalary: employee.basicSalary,
        payrollComponents: employee.payrollComponents,
    };
}

export async function GET(request: NextRequest) {
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

        const actor = actorFromSession(session);
        const employee = await createEmployee({
            ...body,
            passwordHash: hashedPassword,
            createdByUserId: session.userId,
            isActive: true,
        }, actor);

        // Send password via email (Synchronous with try/catch for reliability)
        let emailWarning = false;
        try {
            const { sendPasswordEmail } = await import("@/lib/services/emailService");
            const emailSent = await sendPasswordEmail(employee.email, employee.name, plainPassword);
            emailWarning = !emailSent;
        } catch (emailErr) {
            logger.warn("Gagal kirim email password untuk karyawan baru", { employeeId: employee.employeeId, error: emailErr });
            emailWarning = true;
        }

        logger.info("New employee created", { employeeId: employee.employeeId, createdBy: session.username });
        await logAction("CREATE", "Employee", actor, employee.id, { employeeId: employee.employeeId, name: employee.name });

        return NextResponse.json({ ...serializeEmployee(employee, true), _emailWarning: emailWarning }, { status: 201 });
    } catch (err: unknown) {
        const prismaError = err as { code?: string };
        if (prismaError.code === "P2002") {
            return NextResponse.json({ error: "Email, NIP, nomor identitas, atau rekening sudah digunakan oleh data lain." }, { status: 409 });
        }
        if (prismaError.code === "P2003") {
            return NextResponse.json({ error: "Data referensi tidak valid (shift/atasan). Silakan periksa kembali." }, { status: 400 });
        }
        if (err instanceof Error && (err.message.includes("harus diisi lengkap") || err.message.includes("PTKP") || err.message.includes("NIP berkonflik") || err.message.includes("Tanggal") || err.message.includes("hierarki") || err.message.includes("atasan") || err.message.includes("Departemen"))) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return serverErrorResponse("EmployeesPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, employeeUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;

        const actor = actorFromSession(session);
        const updated = await updateEmployee(id, data, actor);
        if (!updated) {
            return NextResponse.json({ error: "Data karyawan tidak ditemukan." }, { status: 404 });
        }

        logger.info("Employee updated", { targetId: updated.employeeId, updatedBy: session.username });
        await logAction("UPDATE", "Employee", actor, updated.id, {
            employeeId: updated.employeeId,
            changedFields: Object.keys(data),
        });

        return NextResponse.json(serializeEmployee(updated, true));
    } catch (err: unknown) {
        if ((err as { code?: string })?.code === "P2002") {
            return NextResponse.json({ error: "Email, NIP, nomor identitas, atau rekening sudah digunakan oleh data lain." }, { status: 409 });
        }
        if (err instanceof Error && (err.message.includes("harus diisi lengkap") || err.message.includes("PTKP") || err.message.includes("NIP berkonflik") || err.message.includes("Tanggal") || err.message.includes("hierarki") || err.message.includes("atasan") || err.message.includes("Departemen"))) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return serverErrorResponse("EmployeesPUT", err);
    }
}

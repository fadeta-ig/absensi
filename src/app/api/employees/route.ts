import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import bcrypt from "bcryptjs";
import {
    getVisibleEmployees,
    getEmployeeByEmployeeId,
    createEmployee,
    updateEmployee,
    deleteEmployee,
} from "@/lib/services/employeeService";
import { employeeCreateSchema, employeeUpdateSchema } from "@/lib/validations/validationSchemas";
import { logAction } from "@/lib/services/auditService";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const requester = await getEmployeeByEmployeeId(session.employeeId);
        if (!requester) {
            return NextResponse.json({ error: "Data pengguna Anda tidak ditemukan." }, { status: 404 });
        }

        const employees = (await getVisibleEmployees(requester)).map((e: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { password, faceDescriptor, ...safe } = e;
            return {
                ...safe,
                department: e.departmentRel?.name || "-",
                division: e.divisionRel?.name || "-",
                position: e.positionRel?.name || "-",
            };
        });

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
    if (session.role !== "hr") return forbiddenResponse();

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
            password: hashedPassword,
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

        logger.info("New employee created", { employeeId: employee.employeeId, createdBy: session.employeeId });
        await logAction("CREATE", "Employee", session.employeeId, employee.id, { employeeId: employee.employeeId, name: employee.name });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...safe } = employee;
        return NextResponse.json({ ...safe, _emailWarning: emailWarning }, { status: 201 });
    } catch (err: any) {
        if (err?.code === "P2002") {
            return NextResponse.json({ error: "ID Karyawan sudah terdaftar. Gunakan ID lain." }, { status: 400 });
        }
        if (err?.code === "P2003") {
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
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, employeeUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...rawData } = result.data;

        // Defense in depth: strip field sensitif meskipun schema sudah melarangnya
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _p, faceDescriptor: _f, employeeId: _e, ...data } = rawData as Record<string, unknown>;

        const updated = await updateEmployee(id, data);
        if (!updated) {
            return NextResponse.json({ error: "Data karyawan tidak ditemukan." }, { status: 404 });
        }

        logger.info("Employee updated", { targetId: updated.employeeId, updatedBy: session.employeeId });
        await logAction("UPDATE", "Employee", session.employeeId, updated.id, data);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...safe } = updated;
        return NextResponse.json(safe);
    } catch (err: unknown) {
        if ((err as { code?: string })?.code === "P2002") {
            return NextResponse.json({ error: "ID Karyawan sudah digunakan oleh akun lain." }, { status: 400 });
        }
        return serverErrorResponse("EmployeesPUT", err);
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
            return NextResponse.json({ error: "ID Karyawan diperlukan untuk penghapusan." }, { status: 400 });
        }

        const deleted = await deleteEmployee(id);
        if (!deleted) {
            return NextResponse.json({ error: "Data karyawan tidak ditemukan." }, { status: 404 });
        }

        logger.info("Employee deleted", { employeeId: id, deletedBy: session.employeeId });
        await logAction("DELETE", "Employee", session.employeeId, id);
        
        return NextResponse.json({ success: true, message: "Data karyawan berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("EmployeesDELETE", err);
    }
}

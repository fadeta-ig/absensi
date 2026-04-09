import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import {
    getOvertimeRequests,
    getOvertimeRequestById,
    createOvertimeRequest,
    updateOvertimeRequest,
    deleteOvertimeRequest,
} from "@/lib/services/overtimeService";
import { overtimeCreateSchema, overtimeUpdateSchema } from "@/lib/validations/validationSchemas";
import { calculateOvertimePay } from "@/lib/services/overtimeCalcService";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";

function calculateHours(startTime: string, endTime: string): number {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    const diff = endMinutes - startMinutes;
    return Math.round((diff / 60) * 100) / 100;
}

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const overtime = await getOvertimeRequests(
            session.role === "hr" ? undefined : session.employeeId
        );
        return NextResponse.json(overtime);
    } catch (err) {
        return serverErrorResponse("OvertimeGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, overtimeCreateSchema);
        if ("error" in result) return result.error;
        const { date, startTime, endTime, reason, isHoliday } = result.data;

        const hours = calculateHours(startTime, endTime);
        if (hours <= 0) {
            return NextResponse.json(
                { error: "Jam selesai harus setelah jam mulai." },
                { status: 400 }
            );
        }
        if (hours > 8) {
            return NextResponse.json(
                { error: "Maksimal durasi lembur adalah 8 jam per hari." },
                { status: 400 }
            );
        }

        const overtime = await createOvertimeRequest({
            employeeId: session.employeeId,
            date,
            startTime,
            endTime,
            hours,
            reason,
            isHoliday: isHoliday ?? false,
            overtimePay: 0,
            status: "pending",
            createdAt: new Date().toISOString(),
        });

        logger.info("Overtime request created", { employeeId: session.employeeId, overtimeId: overtime.id });
        return NextResponse.json(overtime, { status: 201 });
    } catch (err) {
        return serverErrorResponse("OvertimePOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, overtimeUpdateSchema);
        if ("error" in result) return result.error;
        const { id, status, date, startTime, endTime, reason, approvedHours, isHoliday } = result.data;

        const existing = await getOvertimeRequestById(id);
        if (!existing) {
            return NextResponse.json({ error: "Pengajuan lembur tidak ditemukan." }, { status: 404 });
        }

        // Only HR can update status
        if (status && session.role !== "hr") {
            return forbiddenResponse();
        }

        // Employees can only edit their own pending requests
        if (session.role !== "hr") {
            if (existing.employeeId !== session.employeeId) {
                return forbiddenResponse();
            }
            if (existing.status !== "pending") {
                return NextResponse.json(
                    { error: "Tidak dapat mengubah pengajuan yang sudah diproses." },
                    { status: 400 }
                );
            }
        }

        const updateData: Record<string, unknown> = {};
        if (session.role === "hr" && status !== undefined) {
            updateData.status = status;
        }
        if (date !== undefined) updateData.date = date;
        if (reason !== undefined) updateData.reason = reason;

        const targetStartTime = startTime ?? existing.startTime;
        const targetEndTime = endTime ?? existing.endTime;

        if (startTime !== undefined || endTime !== undefined) {
            const hours = calculateHours(targetStartTime, targetEndTime);
            if (hours <= 0 || hours > 8) {
                return NextResponse.json({ error: "Durasi lembur tidak valid (minimal 0.1 jam, maksimal 8 jam)." }, { status: 400 });
            }
            updateData.startTime = targetStartTime;
            updateData.endTime = targetEndTime;
            updateData.hours = hours;
        }

        if (isHoliday !== undefined) updateData.isHoliday = isHoliday;
        if (approvedHours !== undefined) updateData.approvedHours = approvedHours;

        // Auto-calculate overtime pay when approving
        if (status === "approved") {
            const effectiveHours = approvedHours ?? existing.hours;
            const effectiveIsHoliday = isHoliday ?? (existing as any).isHoliday ?? false;

            // Fetch employee salary + fixed allowances
            const employee = await prisma.employee.findUnique({
                where: { employeeId: existing.employeeId },
                select: { basicSalary: true, payrollComponents: { include: { component: true } } },
            });

            if (employee) {
                const fixedAllowances = employee.payrollComponents
                    .filter((pc) => pc.component.type === "earning" && pc.component.isActive)
                    .reduce((sum, pc) => sum + pc.amount, 0);
                const monthlySalary = employee.basicSalary + fixedAllowances;

                const calcResult = calculateOvertimePay({
                    monthlySalary,
                    hours: effectiveHours,
                    isHoliday: effectiveIsHoliday,
                    workDaySystem: 5,
                });
                updateData.approvedHours = effectiveHours;
                updateData.overtimePay = calcResult.totalPay;
            }
        }

        const updated = await updateOvertimeRequest(id, updateData);
        if (!updated) {
            return NextResponse.json({ error: "Gagal memperbarui data lembur." }, { status: 404 });
        }

        logger.info("Overtime request updated", { overtimeId: id, updatedBy: session.employeeId });
        return NextResponse.json(updated);
    } catch (err) {
        return serverErrorResponse("OvertimePUT", err);
    }
}

export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID pengajuan diperlukan." }, { status: 400 });
        }

        const existing = await getOvertimeRequestById(id);
        if (!existing) {
            return NextResponse.json({ error: "Pengajuan lembur tidak ditemukan." }, { status: 404 });
        }

        if (session.role !== "hr" && existing.employeeId !== session.employeeId) {
            return forbiddenResponse();
        }

        if (session.role !== "hr" && existing.status !== "pending") {
            return NextResponse.json({ error: "Tidak dapat menghapus pengajuan yang sudah diproses." }, { status: 400 });
        }

        const deleted = await deleteOvertimeRequest(id);
        if (!deleted) {
            return NextResponse.json({ error: "Gagal menghapus data lembur." }, { status: 404 });
        }

        logger.info("Overtime request deleted", { overtimeId: id, deletedBy: session.employeeId });
        return NextResponse.json({ success: true, message: "Pengajuan lembur berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("OvertimeDELETE", err);
    }
}

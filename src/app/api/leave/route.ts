import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getLeaveRequests,
    getEmployeeLeaveBalance,
    createLeaveRequest,
    createLeaveRequestsBatch,
    updateLeaveRequest,
    updateLeaveRequestsBulk,
    LeaveAttachmentError,
    LeaveQuotaError,
    LeaveConflictError,
    LeaveValidationError,
} from "@/lib/services/leaveService";
import { leaveRequestSchema, leaveUpdateSchema } from "@/lib/validations/validationSchemas";
import { prisma } from "@/lib/prisma";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import logger from "@/lib/logger";
import { ShiftAssignmentError } from "@/lib/services/shiftAssignmentService";
import { LeaveDateRangeError } from "@/lib/services/leaveDateRange";
import { canManageHr } from "@/lib/permissions";

const KNOWN_LEAVE_ERROR_NAMES = new Set([
    "LeaveAttachmentError",
    "LeaveQuotaError",
    "LeaveValidationError",
    "LeaveConflictError",
    "LeaveDateRangeError",
    "ShiftAssignmentError",
]);

function mapLeaveRouteError(scope: string, err: unknown): NextResponse {
    if (err instanceof Error && KNOWN_LEAVE_ERROR_NAMES.has(err.name)) {
        const status = "statusCode" in err && typeof err.statusCode === "number" ? err.statusCode : 400;
        const code = "code" in err && typeof err.code === "string" ? err.code : undefined;
        return NextResponse.json(code ? { error: err.message, code } : { error: err.message }, { status });
    }
    if (err instanceof Error && err.message.includes("Sisa cuti")) {
        return NextResponse.json({ error: err.message, code: "INSUFFICIENT_LEAVE_QUOTA" }, { status: 400 });
    }
    return serverErrorResponse(scope, err);
}

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const withBalance = request?.nextUrl?.searchParams.get("withBalance") === "1";
        if (withBalance) {
            if (!session.employeeId) return forbiddenResponse();
            const leaves = await getLeaveRequests(session.employeeId);
            const balance = await getEmployeeLeaveBalance(session.employeeId, leaves);
            return NextResponse.json({ leaves, balance });
        }

        if (canManageHr(session) || session.role === "hr") {
            const leaves = await getLeaveRequests();
            return NextResponse.json(leaves);
        }
        if (!session.employeeId) return forbiddenResponse();

        const leaves = await getLeaveRequests(session.employeeId);
        return NextResponse.json(leaves);
    } catch (err) {
        return mapLeaveRouteError("LeaveGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const result = await validateBody(request, leaveRequestSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        // Mode tanggal lepas (discrete batch): 1 tanggal = 1 LeaveRequest single-day, 1 bukti dipakai bersama
        if (Array.isArray(body.dates) && body.dates.length > 0) {
            if (body.type === "maternity" || body.type === "paternity") {
                return NextResponse.json(
                    { error: "Cuti melahirkan dan paternity harus menggunakan rentang tanggal mulai dan selesai." },
                    { status: 400 }
                );
            }

            const createdLeaves = await createLeaveRequestsBatch({
                employeeId: session.employeeId,
                type: body.type,
                dates: body.dates,
                reason: body.reason,
                status: "pending",
                attachment: body.attachment ?? null,
            });

            logger.info("Leave request batch created", {
                employeeId: session.employeeId,
                count: createdLeaves.length,
                type: body.type,
            });

            const actor = actorFromSession(session);
            await Promise.allSettled(
                createdLeaves.map((item) =>
                    logAction(
                        "CREATE_LEAVE",
                        "LEAVE_REQUEST",
                        actor,
                        item.id,
                        { type: item.type, startDate: item.startDate, endDate: item.endDate, batchSize: createdLeaves.length }
                    ).catch((e) => logger.error("Gagal mencatat audit log", { error: e }))
                )
            );

            return NextResponse.json({ created: createdLeaves, count: createdLeaves.length }, { status: 201 });
        }

        const startDate = body.startDate!;
        const endDate = body.endDate!;

        // Custom Validation Rule: Maternity & Paternity Leave (inclusive calendar days)
        if (body.type === "maternity") {
            const employeeData = await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { gender: true },
            });

            if (employeeData?.gender !== "Perempuan") {
                return NextResponse.json({ error: "Cuti 'maternity' hanya berlaku untuk karyawan Perempuan." }, { status: 400 });
            }

            const start = new Date(`${startDate}T00:00:00Z`).getTime();
            const end = new Date(`${endDate}T00:00:00Z`).getTime();
            const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;

            if (days < 90) {
                return NextResponse.json({ error: "Cuti melahirkan (maternity) minimal 90 hari kalender." }, { status: 400 });
            }
        } else if (body.type === "paternity") {
            const employeeData = await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { gender: true },
            });

            if (employeeData?.gender !== "Laki-Laki") {
                return NextResponse.json({ error: "Cuti 'paternity' hanya berlaku untuk karyawan Laki-Laki." }, { status: 400 });
            }

            const start = new Date(`${startDate}T00:00:00Z`).getTime();
            const end = new Date(`${endDate}T00:00:00Z`).getTime();
            const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;

            if (days > 3) {
                return NextResponse.json({ error: "Cuti mendampingi istri melahirkan (paternity) maksimal 3 hari." }, { status: 400 });
            }
        }

        // Saldo annual divalidasi satu kali di service memakai roster efektif
        // per tanggal. Jangan hitung ulang memakai employee.shiftId saat ini.
        const leave = await createLeaveRequest({
            type: body.type,
            startDate,
            endDate,
            reason: body.reason,
            attachment: body.attachment ?? undefined,
            employeeId: session.employeeId,
            status: "pending",
            createdAt: new Date().toISOString(),
        });

        logger.info("Leave request created", { employeeId: session.employeeId, leaveId: leave.id });

        // Audit Trail Injection
        await logAction(
            "CREATE_LEAVE",
            "LEAVE_REQUEST",
            actorFromSession(session),
            leave.id,
            { type: body.type, startDate, endDate }
        ).catch(e => logger.error("Gagal mencatat audit log", { error: e }));

        return NextResponse.json(leave, { status: 201 });
    } catch (err) {
        return mapLeaveRouteError("LeavePOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session) && session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, leaveUpdateSchema);
        if ("error" in result) return result.error;

        if (Array.isArray(result.data.ids) && result.data.ids.length > 0) {
            const bulkStatus = result.data.status as "approved" | "rejected";
            const outcome = await updateLeaveRequestsBulk(result.data.ids, bulkStatus);

            logger.info("Leave requests bulk updated", {
                updatedBy: session.username,
                status: bulkStatus,
                succeededCount: outcome.succeededIds.length,
                failedCount: outcome.failed.length,
            });

            const actor = actorFromSession(session);
            await Promise.allSettled(
                outcome.succeededIds.map((itemId) =>
                    logAction(
                        `UPDATE_LEAVE_${bulkStatus.toUpperCase()}`,
                        "LEAVE_REQUEST",
                        actor,
                        itemId,
                        { status: bulkStatus, bulk: true }
                    ).catch((e) => logger.error("Gagal mencatat audit log", { error: e }))
                )
            );

            return NextResponse.json(outcome);
        }

        const { id, ...data } = result.data as { id: string } & Record<string, unknown>;

        const updated = await updateLeaveRequest(id, data);
        if (!updated) {
            return NextResponse.json({ error: "Permohonan cuti tidak ditemukan." }, { status: 404 });
        }

        logger.info("Leave request updated", { leaveId: id, updatedBy: session.username, status: data.status });

        // Audit Trail Injection
        await logAction(
            `UPDATE_LEAVE_${typeof data.status === 'string' ? data.status.toUpperCase() : 'UNKNOWN'}`,
            "LEAVE_REQUEST",
            actorFromSession(session),
            id,
            data
        ).catch(e => logger.error("Gagal mencatat audit log", { error: e }));

        return NextResponse.json(updated);
    } catch (err: unknown) {
        return mapLeaveRouteError("LeavePUT", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getLeaveRequests, createLeaveRequest, updateLeaveRequest } from "@/lib/services/leaveService";
import { leaveRequestSchema, leaveUpdateSchema } from "@/lib/validations/validationSchemas";
import { prisma } from "@/lib/prisma";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import logger from "@/lib/logger";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        if (session.role === "hr") {
            const leaves = await getLeaveRequests();
            return NextResponse.json(leaves);
        }
        if (!session.employeeId) return forbiddenResponse();

        const leaves = await getLeaveRequests(session.employeeId);
        return NextResponse.json(leaves);
    } catch (err) {
        return serverErrorResponse("LeaveGET", err);
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

        // Custom Validation Rule: Maternity Leave
        if (body.type === "maternity") {
            const employeeData = await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { gender: true },
            });

            if (employeeData?.gender !== "Perempuan") {
                return NextResponse.json({ error: "Cuti 'maternity' hanya berlaku untuk karyawan Perempuan." }, { status: 400 });
            }

            const start = new Date(body.startDate).getTime();
            const end = new Date(body.endDate).getTime();
            const days = (end - start) / (1000 * 60 * 60 * 24);

            if (days < 90) {
                return NextResponse.json({ error: "Cuti melahirkan (maternity) minimal 90 hari." }, { status: 400 });
            }
        } else if (body.type === "paternity") {
            const employeeData = await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { gender: true },
            });

            if (employeeData?.gender !== "Laki-Laki") {
                return NextResponse.json({ error: "Cuti 'paternity' hanya berlaku untuk karyawan Laki-Laki." }, { status: 400 });
            }

            const start = new Date(body.startDate).getTime();
            const end = new Date(body.endDate).getTime();
            const days = (end - start) / (1000 * 60 * 60 * 24) + 1; // inclusive

            if (days > 3) {
                return NextResponse.json({ error: "Cuti mendampingi istri melahirkan (paternity) maksimal 3 hari." }, { status: 400 });
            }
        } else if (body.type === "annual") {
            // General Leave Balance Validation
            const { calculateWorkingDays } = await import("@/lib/services/leaveService");
            
            const employeeData = await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { totalLeave: true, usedLeave: true, shiftId: true },
            });

            if (employeeData) {
                let offDays = new Set<number>([0]);
                if (employeeData.shiftId) {
                    const shift = await prisma.workShift.findUnique({ where: { id: employeeData.shiftId }, include: { days: true } });
                    if (shift) offDays = new Set(shift.days.filter(d => d.isOff).map(d => d.dayOfWeek));
                }

                const remainingLeave = employeeData.totalLeave - employeeData.usedLeave;
                // Asumsi pengajuan cuti akan dicancel sebelum hari berakhir, tapi strict block:
                const requestedDays = calculateWorkingDays(body.startDate, body.endDate, offDays);

                if (requestedDays > remainingLeave) {
                    return NextResponse.json({ error: `Sisa cuti Anda tidak mencukupi. Sisa: ${remainingLeave} hari, Diajukan: ${requestedDays} hari.` }, { status: 400 });
                }
            }
        }

        const leave = await createLeaveRequest({
            ...body,
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
            { type: body.type, startDate: body.startDate, endDate: body.endDate }
        ).catch(e => logger.error("Gagal mencatat audit log", { error: e }));

        return NextResponse.json(leave, { status: 201 });
    } catch (err) {
        return serverErrorResponse("LeavePOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, leaveUpdateSchema);
        if ("error" in result) return result.error;

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
        if (err instanceof Error && err.message.includes("Sisa cuti karyawan tidak mencukupi")) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return serverErrorResponse("LeavePUT", err);
    }
}
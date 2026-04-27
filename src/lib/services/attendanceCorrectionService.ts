import { prisma } from "../prisma";
import logger from "@/lib/logger";
import { AttendanceCorrection } from "@/types";
import { updateAttendance, createAttendance, getAttendanceByDate } from "./attendanceService";
import { toDateString } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────

function toCorrectionDTO(row: any): AttendanceCorrection {
    return {
        id: row.id,
        employeeId: row.employeeId,
        targetDate: toDateString(row.targetDate),
        proposedClockIn: row.proposedClockIn ? new Date(row.proposedClockIn).toISOString() : null,
        proposedClockOut: row.proposedClockOut ? new Date(row.proposedClockOut).toISOString() : null,
        reason: row.reason,
        attachmentUrl: row.attachmentUrl,
        status: row.status,
        assignedManagerId: row.assignedManagerId,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString()
    };
}

// ─── Public Services ──────────────────────────────────────────────────

export async function submitCorrection(data: {
    employeeId: string,
    targetDate: string,
    proposedClockIn?: string | null,
    proposedClockOut?: string | null,
    reason: string,
    attachmentUrl?: string | null
}): Promise<AttendanceCorrection> {
    logger.info("Submission for attendance correction", { employeeId: data.employeeId, date: data.targetDate });

    // Try finding manager of this employee
    const emp = await prisma.employee.findUnique({ where: { employeeId: data.employeeId }, select: { managerId: true }});

    const row = await prisma.attendanceCorrection.create({
        data: {
            employeeId: data.employeeId,
            targetDate: new Date(data.targetDate),
            proposedClockIn: data.proposedClockIn ? new Date(data.proposedClockIn) : null,
            proposedClockOut: data.proposedClockOut ? new Date(data.proposedClockOut) : null,
            reason: data.reason,
            attachmentUrl: data.attachmentUrl ?? null,
            status: "PENDING",
            assignedManagerId: emp?.managerId ?? null
        }
    });

    return toCorrectionDTO(row);
}

export async function getCorrectionsByUser(employeeId: string): Promise<AttendanceCorrection[]> {
    const rows = await prisma.attendanceCorrection.findMany({
        where: { employeeId },
        orderBy: { createdAt: "desc" }
    });
    return rows.map(toCorrectionDTO);
}

export async function getCorrectionsByManager(managerId: string): Promise<AttendanceCorrection[]> {
    const rows = await prisma.attendanceCorrection.findMany({
        where: { assignedManagerId: managerId },
        orderBy: { createdAt: "desc" }
    });
    return rows.map(toCorrectionDTO);
}

export async function getAllCorrections(): Promise<AttendanceCorrection[]> {
    const rows = await prisma.attendanceCorrection.findMany({
        orderBy: { createdAt: "desc" }
    });
    return rows.map(toCorrectionDTO);
}

export async function resolveCorrection(id: string, status: "APPROVED" | "REJECTED", reviewerId: string): Promise<AttendanceCorrection> {
    const record = await prisma.attendanceCorrection.findUnique({ where: { id }});
    if (!record) throw new Error("Correction request not found");

    if (record.status !== "PENDING") {
        throw new Error("Request has already been processed");
    }

    // Use a transaction to ensure database atomicity
    const updated = await prisma.$transaction(async (tx) => {
        const correction = await tx.attendanceCorrection.update({
            where: { id },
            data: { status }
        });

        if (status === "APPROVED") {
            const dateStr = toDateString(record.targetDate);
            const d = new Date(dateStr);
            const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const end = new Date(start.getTime() + 86400000);

            const attendance = await tx.attendanceRecord.findFirst({
                where: { employeeId: record.employeeId, date: { gte: start, lt: end } }
            });

            if (attendance) {
                await tx.attendanceRecord.update({
                    where: { id: attendance.id },
                    data: {
                        ...(record.proposedClockIn && { clockIn: new Date(record.proposedClockIn) }),
                        ...(record.proposedClockOut && { clockOut: new Date(record.proposedClockOut) }),
                        notes: `Susulan diapprove oleh ${reviewerId}. Alasan: ${record.reason}`
                    }
                });
            } else {
                await tx.attendanceRecord.create({
                    data: {
                        employeeId: record.employeeId,
                        date: new Date(record.targetDate),
                        clockIn: record.proposedClockIn ? new Date(record.proposedClockIn) : undefined,
                        clockOut: record.proposedClockOut ? new Date(record.proposedClockOut) : undefined,
                        status: "present",
                        notes: `Susulan diapprove oleh ${reviewerId}. Alasan: ${record.reason}`
                    }
                });
            }
        }
        
        return correction;
    });

    logger.info("Correction resolved atomically", { id: updated.id, status: updated.status });

    return toCorrectionDTO(updated);
}

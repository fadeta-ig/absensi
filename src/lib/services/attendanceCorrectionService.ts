import { prisma } from "../prisma";
import logger from "@/lib/logger";
import { AttendanceCorrection } from "@/types";
import { Prisma } from "@prisma/client";
import { getWIBHoursMinutes, toUTCDateKey, toWIBDateString, addCalendarDays } from "@/lib/timezone";
import {
    getNormalizedShiftWindows,
    isOvernightSchedule,
    type ScheduleDay,
    type ShiftTolerance,
} from "@/lib/services/attendanceShiftHelper";

type AttendanceCorrectionRow = Prisma.AttendanceCorrectionGetPayload<Record<string, never>>;

type CorrectionTransactionClient = Prisma.TransactionClient;

function correctionCalendarKey(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid correction target date: ${value}`);
    return date.toISOString().slice(0, 10);
}

export class AttendanceCorrectionError extends Error {
    constructor(
        message: string,
        public readonly code: "NOT_FOUND" | "PENDING_EXISTS" | "ALREADY_PROCESSED" | "EMPLOYEE_NOT_FOUND" | "INVALID_TARGET_DATE" | "INVALID_CLOCK_IN_DATE" | "LEAVE_CONFLICT",
        public readonly statusCode: number,
    ) {
        super(message);
        this.name = "AttendanceCorrectionError";
    }
}

function leaveConflictMessage(leave: { type: string; status: string }): string {
    const typeLabel = leave.type === "annual" ? "cuti tahunan"
        : leave.type === "sick" ? "sakit"
        : leave.type === "maternity" ? "cuti melahirkan"
        : leave.type === "paternity" ? "cuti ayah"
        : leave.type === "personal" ? "izin pribadi"
        : "cuti";
    const statusLabel = leave.status === "approved" ? "disetujui" : "menunggu persetujuan";
    return `Tanggal tersebut sudah ada pengajuan ${typeLabel} yang ${statusLabel}. Koreksi presensi tidak dapat diproses.`;
}

async function findConflictingLeave(
    tx: CorrectionTransactionClient,
    employeeId: string,
    targetDate: Date,
): Promise<{ type: string; status: string } | null> {
    return tx.leaveRequest.findFirst({
        where: {
            employeeId,
            status: { in: ["approved", "pending"] },
            startDate: { lte: targetDate },
            endDate: { gte: targetDate },
        },
        select: { type: true, status: true },
    });
}

type RecomputedStatus = "present" | "late" | null;

interface ActiveShiftContext {
    days: ScheduleDay[];
    tolerance: ShiftTolerance;
}

async function loadActiveShift(
    tx: CorrectionTransactionClient,
    employeeId: string,
    dateKey?: string,
): Promise<ActiveShiftContext | null> {
    const { resolveShiftForDate } = await import("@/lib/services/shiftAssignmentService");
    const key = dateKey ?? toWIBDateString(new Date());
    const resolved = await resolveShiftForDate(tx, employeeId, key);
    if (!resolved || resolved.days.length === 0) return null;
    return { days: resolved.days, tolerance: resolved.tolerance };
}

/**
 * Batas atas jam masuk H+1 mengikuti toleransi pulang shift:
 * endMinutes + lateCheckOut (mis. 07:00 + 60 = 08:00 WIB).
 */
function overnightClockInUpperMinutes(scheduleDay: ScheduleDay, tolerance: ShiftTolerance): number {
    const [, endHour, endMinute] = [0, ...scheduleDay.endTime.split(":").map(Number)];
    return (endHour * 60 + endMinute) + (tolerance.lateCheckOut ?? 0);
}

/**
 * Validasi tanggal usulan jam masuk: harus tanggal target, atau tepat H+1
 * bila jadwal tanggal target adalah shift lintas hari yang aktif.
 * Mengembalikan null bila valid; melempar INVALID_CLOCK_IN_DATE bila tidak.
 */
export async function validateProposedClockInDate(
    tx: CorrectionTransactionClient,
    employeeId: string,
    targetDateKey: string,
    proposedClockIn: string,
): Promise<void> {
    const proposed = new Date(proposedClockIn);
    if (Number.isNaN(proposed.getTime())) {
        throw new AttendanceCorrectionError(
            "Usulan jam masuk tidak valid.",
            "INVALID_CLOCK_IN_DATE",
            400,
        );
    }
    const clockInDate = toWIBDateString(proposed);
    if (clockInDate === targetDateKey) return;

    const nextDate = addCalendarDays(targetDateKey, 1);
    if (clockInDate !== nextDate) {
        throw new AttendanceCorrectionError(
            "Usulan jam masuk harus berada pada tanggal target.",
            "INVALID_CLOCK_IN_DATE",
            400,
        );
    }
    const shift = await loadActiveShift(tx, employeeId, targetDateKey);
    const scheduleDay = shift?.days.find((day) => day.dayOfWeek === toUTCDateKey(targetDateKey).getUTCDay()) ?? null;
    if (!shift || !scheduleDay || scheduleDay.isOff || !isOvernightSchedule(scheduleDay.startTime, scheduleDay.endTime)) {
        throw new AttendanceCorrectionError(
            "Usulan jam masuk H+1 hanya dapat digunakan untuk shift lintas hari.",
            "INVALID_CLOCK_IN_DATE",
            400,
        );
    }
    const { hours, minutes } = getWIBHoursMinutes(proposed);
    const wallMinutes = hours * 60 + minutes;
    const upper = overnightClockInUpperMinutes(scheduleDay, shift.tolerance);
    // wallMinutes 00:xx H+1 dinilai dalam koordinat hari shift: +1440.
    // Syarat: 00:00 <= wall <= endTime + lateCheckOut.
    if (wallMinutes > upper) {
        throw new AttendanceCorrectionError(
            "Usulan jam masuk H+1 berada di luar jendela shift malam.",
            "INVALID_CLOCK_IN_DATE",
            400,
        );
    }
    const conflicting = await tx.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date: toUTCDateKey(nextDate) } },
        select: { id: true },
    });
    if (conflicting) {
        throw new AttendanceCorrectionError(
            "Tanggal H+1 sudah memiliki catatan presensi.",
            "INVALID_CLOCK_IN_DATE",
            409,
        );
    }
}

/**
 * Hitung ulang status present/late dari proposedClockIn + shift aktif.
 * Mengembalikan null bila status tidak boleh diubah (tanpa proposedClockIn,
 * shift tidak ditemukan, atau record existing berstatus cuti/sakit/libur).
 * Aturan batas identik dengan jalur clock-in normal: late hanya bila
 * relativeClockMinutes > startMinutes + lateCheckIn (strict >).
 */
export async function computeCorrectedStatus(
    tx: CorrectionTransactionClient,
    record: { employeeId: string; targetDate: Date | string; proposedClockIn: Date | string | null },
): Promise<RecomputedStatus> {
    if (!record.proposedClockIn) return null;
    const proposed = record.proposedClockIn instanceof Date ? record.proposedClockIn : new Date(record.proposedClockIn);
    if (Number.isNaN(proposed.getTime())) return null;

    const targetKey = correctionCalendarKey(record.targetDate);
    const existing = await tx.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: record.employeeId, date: toUTCDateKey(targetKey) } },
        select: { status: true, isOffDay: true },
    });
    if (existing && existing.status !== "present" && existing.status !== "late") return null;

    const employeeExists = await tx.employee.findUnique({
        where: { employeeId: record.employeeId },
        select: { employeeId: true },
    });
    if (!employeeExists) return null;

    const shift = await loadActiveShift(tx, record.employeeId, targetKey);
    if (!shift || shift.days.length === 0) return null;

    const shiftDays: ScheduleDay[] = shift.days;
    const scheduleDay = shiftDays.find((day) => day.dayOfWeek === toUTCDateKey(targetKey).getUTCDay()) ?? null;
    if (!scheduleDay || scheduleDay.isOff || existing?.isOffDay) return "present";

    const tolerance: ShiftTolerance = shift.tolerance;
    const [startHour, startMinute] = scheduleDay.startTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const { hours, minutes } = getWIBHoursMinutes(proposed);
    let relativeClockMinutes = hours * 60 + minutes;
    if (isOvernightSchedule(scheduleDay.startTime, scheduleDay.endTime) && relativeClockMinutes < startMinutes) {
        relativeClockMinutes += 24 * 60;
    }
    const windows = getNormalizedShiftWindows(scheduleDay, tolerance);
    return relativeClockMinutes > windows.lateDeadlineMinutes ? "late" : "present";
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function toCorrectionDTO(row: AttendanceCorrectionRow): AttendanceCorrection {
    return {
        id: row.id,
        employeeId: row.employeeId,
        // Correction dates use the historical UTC-midnight calendar key.
        targetDate: correctionCalendarKey(row.targetDate),
        proposedClockIn: row.proposedClockIn ? new Date(row.proposedClockIn).toISOString() : null,
        proposedClockOut: row.proposedClockOut ? new Date(row.proposedClockOut).toISOString() : null,
        reason: row.reason,
        attachmentUrl: row.attachmentUrl,
        status: row.status as AttendanceCorrection["status"],
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

    let targetDate: Date;
    try {
        targetDate = toUTCDateKey(data.targetDate);
    } catch {
        throw new AttendanceCorrectionError(
            "Tanggal target tidak valid. Gunakan format YYYY-MM-DD.",
            "INVALID_TARGET_DATE",
            400,
        );
    }
    const row = await prisma.$transaction(async (tx) => {
        // Lock the employee row so concurrent submissions for this employee serialize
        // even though the schema intentionally has no pending-request unique index.
        const employeeRows = await tx.$queryRaw<Array<{ employee_id: string }>>`
            SELECT employee_id
            FROM employees
            WHERE employee_id = ${data.employeeId}
            FOR UPDATE
        `;
        if (employeeRows.length === 0) {
            throw new AttendanceCorrectionError(
                "Data karyawan tidak ditemukan.",
                "EMPLOYEE_NOT_FOUND",
                404,
            );
        }

        const pending = await tx.attendanceCorrection.findFirst({
            where: {
                employeeId: data.employeeId,
                targetDate,
                status: "PENDING",
            },
        });
        if (pending) {
            throw new AttendanceCorrectionError(
                "Pengajuan koreksi untuk karyawan dan tanggal tersebut masih menunggu proses.",
                "PENDING_EXISTS",
                409,
            );
        }

        const conflictingLeave = await findConflictingLeave(tx, data.employeeId, targetDate);
        if (conflictingLeave) {
            throw new AttendanceCorrectionError(
                leaveConflictMessage(conflictingLeave),
                "LEAVE_CONFLICT",
                409,
            );
        }

        if (data.proposedClockIn) {
            await validateProposedClockInDate(tx, data.employeeId, data.targetDate, data.proposedClockIn);
        }

        return tx.attendanceCorrection.create({
            data: {
                employeeId: data.employeeId,
                targetDate,
                proposedClockIn: data.proposedClockIn ? new Date(data.proposedClockIn) : null,
                proposedClockOut: data.proposedClockOut ? new Date(data.proposedClockOut) : null,
                reason: data.reason,
                attachmentUrl: data.attachmentUrl ?? null,
                status: "PENDING",
                // New requests are resolved centrally by the approved WIG001 workflow.
                assignedManagerId: null,
            },
        });
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
    const updated = await prisma.$transaction(async (tx) => {
        const record = await tx.attendanceCorrection.findUnique({ where: { id } });
        if (!record) {
            throw new AttendanceCorrectionError(
                "Pengajuan koreksi tidak ditemukan.",
                "NOT_FOUND",
                404,
            );
        }
        if (record.status === "PENDING" && status === "APPROVED") {
            const conflictingLeave = await findConflictingLeave(
                tx,
                record.employeeId,
                toUTCDateKey(correctionCalendarKey(record.targetDate)),
            );
            if (conflictingLeave) {
                throw new AttendanceCorrectionError(
                    leaveConflictMessage(conflictingLeave),
                    "LEAVE_CONFLICT",
                    409,
                );
            }
        }

        // The conditional update is the concurrency guard for two reviewers.
        const transition = await tx.attendanceCorrection.updateMany({
            where: { id, status: "PENDING" },
            data: { status },
        });
        if (transition.count !== 1) {
            throw new AttendanceCorrectionError(
                "Pengajuan koreksi sudah diproses.",
                "ALREADY_PROCESSED",
                409,
            );
        }

        if (status === "APPROVED" && (record.proposedClockIn || record.proposedClockOut)) {
            const attendanceUpdate: Prisma.AttendanceRecordUpdateInput = {};
            if (record.proposedClockIn) attendanceUpdate.clockIn = new Date(record.proposedClockIn);
            if (record.proposedClockOut) attendanceUpdate.clockOut = new Date(record.proposedClockOut);
            const recomputedStatus = await computeCorrectedStatus(tx, record);
            if (recomputedStatus) attendanceUpdate.status = recomputedStatus;

            // AttendanceRecord already has a compound unique key for this exact
            // historical UTC-midnight calendar key. Do not rewrite notes or other data.
            await tx.attendanceRecord.upsert({
                where: {
                    employeeId_date: {
                        employeeId: record.employeeId,
                        date: toUTCDateKey(correctionCalendarKey(record.targetDate)),
                    },
                },
                update: attendanceUpdate,
                create: {
                    employeeId: record.employeeId,
                    date: toUTCDateKey(correctionCalendarKey(record.targetDate)),
                    ...(record.proposedClockIn ? { clockIn: new Date(record.proposedClockIn) } : {}),
                    ...(record.proposedClockOut ? { clockOut: new Date(record.proposedClockOut) } : {}),
                    status: recomputedStatus ?? "present",
                },
            });
        }

        const correction = await tx.attendanceCorrection.findUnique({ where: { id } });
        if (!correction) {
            throw new AttendanceCorrectionError(
                "Pengajuan koreksi tidak ditemukan.",
                "NOT_FOUND",
                404,
            );
        }
        return correction;
    });

    logger.info("Correction resolved atomically", { id: updated.id, status: updated.status, reviewerId });

    return toCorrectionDTO(updated);
}

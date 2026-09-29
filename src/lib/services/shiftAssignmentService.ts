import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import { addCalendarDays, isValidCalendarDate, toUTCDateKey, toWIBDateString } from "@/lib/timezone";
import type { ScheduleDay, ShiftTolerance } from "@/lib/services/attendanceShiftHelper";
import { validateLeaveDateRange } from "@/lib/services/leaveDateRange";

type ShiftClient = Prisma.TransactionClient | typeof prisma;

export interface ResolvedShift {
    shiftId: string | null;
    shiftName: string | null;
    days: ScheduleDay[];
    tolerance: ShiftTolerance;
    source: "assignment" | "fallback" | "default" | "none";
}

export class ShiftAssignmentError extends Error {
    constructor(
        message: string,
        public readonly code: "OVERLAP" | "NOT_FOUND" | "INVALID_RANGE",
        public readonly statusCode: number,
    ) {
        super(message);
        this.name = "ShiftAssignmentError";
    }
}

function toShiftContext(shift: {
    id: string;
    name: string;
    earlyCheckIn: number;
    lateCheckIn: number;
    earlyCheckOut: number;
    lateCheckOut: number;
    days: ScheduleDay[];
} | null, source: ResolvedShift["source"]): ResolvedShift | null {
    if (!shift) return null;
    return {
        shiftId: shift.id,
        shiftName: shift.name,
        days: shift.days,
        tolerance: {
            earlyCheckIn: shift.earlyCheckIn,
            lateCheckIn: shift.lateCheckIn,
            earlyCheckOut: shift.earlyCheckOut,
            lateCheckOut: shift.lateCheckOut,
        },
        source,
    };
}

/**
 * Resolve shift yang berlaku untuk employee pada tanggal kalender WIB.
 * Prioritas: assignment mencakup tanggal -> shiftId fallback -> default.
 * Mengembalikan null bila tidak ada shift sama sekali.
 */
export async function resolveShiftForDate(
    client: ShiftClient,
    employeeId: string,
    dateKey: string,
): Promise<ResolvedShift | null> {
    if (!isValidCalendarDate(dateKey)) {
        throw new ShiftAssignmentError("Tanggal harus berformat YYYY-MM-DD yang valid.", "INVALID_RANGE", 400);
    }
    const keyDate = toUTCDateKey(dateKey);
    const rows = await client.shiftAssignment.findMany({
        where: { employeeId, effectiveFrom: { lte: keyDate } },
        orderBy: { effectiveFrom: "desc" },
        include: { shift: { include: { days: true } } },
    });
    const covering = rows.filter((row) => !row.effectiveTo || keyDate < row.effectiveTo);
    if (covering.length > 1) {
        // Data korup (overlap) yang lolos guard lama: pakai yang terbaru tapi catat agar diperbaiki manual.
        logger.warn("Shift assignment overlap terdeteksi saat baca", {
            employeeId,
            dateKey,
            count: covering.length,
        });
    }
    const first = covering[0];
    if (first) return toShiftContext(first.shift, "assignment");

    const employee = await client.employee.findUnique({
        where: { employeeId },
        select: { shiftId: true },
    });
    if (employee?.shiftId) {
        const shift = await client.workShift.findUnique({
            where: { id: employee.shiftId },
            include: { days: true },
        });
        const resolved = toShiftContext(shift, "fallback");
        if (resolved) return resolved;
    }
    const defaultShift = await client.workShift.findFirst({
        where: { isDefault: true },
        include: { days: true },
    });
    return toShiftContext(defaultShift, "default");
}

/**
 * Hitung hari kerja pada rentang dengan shift efektif per tanggal (untuk cuti lintas-rotasi).
 */
export async function countWorkingDaysForEmployee(
    client: ShiftClient,
    employeeId: string,
    startDateKey: string,
    endDateKey: string,
): Promise<number> {
    const range = validateLeaveDateRange(startDateKey, endDateKey);
    if (!range.success) {
        throw new ShiftAssignmentError(range.message, "INVALID_RANGE", 400);
    }
    let count = 0;
    let current = startDateKey;
    for (let dayIndex = 0; dayIndex < range.calendarDays; dayIndex++) {
        const shift = await resolveShiftForDate(client, employeeId, current);
        const dayOfWeek = toUTCDateKey(current).getUTCDay();
        const scheduleDay = shift?.days.find((d) => d.dayOfWeek === dayOfWeek) ?? null;
        const isOff = scheduleDay ? scheduleDay.isOff : dayOfWeek === 0;
        if (!isOff) count++;
        if (dayIndex + 1 < range.calendarDays) current = addCalendarDays(current, 1);
    }
    return count;
}

export interface BulkAssignmentInput {
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
}

export interface RosterEntry {
    employeeId: string;
    shiftId: string | null;
    source: ResolvedShift["source"];
    assignment: {
        id: string;
        effectiveFrom: string;
        effectiveTo: string | null;
    } | null;
}

/**
 * Tetapkan shift ber-tanggal untuk banyak karyawan sekaligus.
 * Menutup assignment terbuka sebelumnya (chaining) dan menolak overlap.
 */
export async function assignShiftsBulk(
    items: BulkAssignmentInput[],
    createdByUserId?: string | null,
): Promise<{ applied: number; results: Array<{ employeeId: string; shiftId: string; effectiveFrom: string }> }> {
    if (items.length === 0) {
        throw new ShiftAssignmentError("Tidak ada penugasan yang dikirim.", "INVALID_RANGE", 400);
    }
    if (items.length > 200) {
        throw new ShiftAssignmentError("Maksimal 200 penugasan per batch.", "INVALID_RANGE", 400);
    }
    return prisma.$transaction(async (tx) => {
        const results: Array<{ employeeId: string; shiftId: string; effectiveFrom: string }> = [];
        // Deterministik: proses per karyawan berurutan tanggal agar chaining tidak tergantung urutan input.
        const sorted = [...items].sort((a, b) =>
            a.employeeId.localeCompare(b.employeeId) || a.effectiveFrom.localeCompare(b.effectiveFrom)
        );
        const ordered = sorted.map((item, index) => {
            const next = sorted[index + 1];
            // Dua assignment open-ended berurutan berarti rotasi/chaining:
            // baris sebelumnya otomatis selesai tepat saat baris berikutnya mulai.
            if (!item.effectiveTo && next?.employeeId === item.employeeId) {
                return { ...item, effectiveTo: next.effectiveFrom };
            }
            return item;
        });
        // Validasi overlap intra-batch sebelum menulis apa pun.
        const seen: Array<{ employeeId: string; from: string; to: string | null }> = [];
        for (const item of ordered) {
            if (!isValidCalendarDate(item.effectiveFrom)) {
                throw new ShiftAssignmentError(
                    `Tanggal berlaku tidak valid untuk ${item.employeeId}.`,
                    "INVALID_RANGE",
                    400,
                );
            }
            if (item.effectiveTo !== undefined && item.effectiveTo !== null && item.effectiveTo !== "") {
                if (!isValidCalendarDate(item.effectiveTo)) {
                    throw new ShiftAssignmentError(
                        `Tanggal selesai tidak valid untuk ${item.employeeId}.`,
                        "INVALID_RANGE",
                        400,
                    );
                }
            } else if (item.effectiveTo === "") {
                throw new ShiftAssignmentError(
                    `Tanggal selesai tidak valid untuk ${item.employeeId}.`,
                    "INVALID_RANGE",
                    400,
                );
            }
            const fromDate = toUTCDateKey(item.effectiveFrom);
            const toDate = item.effectiveTo ? toUTCDateKey(item.effectiveTo) : null;
            if (toDate && toDate <= fromDate) {
                throw new ShiftAssignmentError(
                    `Tanggal selesai harus setelah tanggal mulai untuk ${item.employeeId}.`,
                    "INVALID_RANGE",
                    400,
                );
            }
            for (const prev of seen) {
                if (prev.employeeId !== item.employeeId) continue;
                const prevTo = prev.to ?? "9999-12-31";
                const curTo = item.effectiveTo || "9999-12-31";
                if (prev.from < curTo && item.effectiveFrom < prevTo) {
                    throw new ShiftAssignmentError(
                        `Penugasan ${item.employeeId} tumpang tindih dalam batch yang sama.`,
                        "OVERLAP",
                        409,
                    );
                }
            }
            seen.push({ employeeId: item.employeeId, from: item.effectiveFrom, to: item.effectiveTo || null });
        }
        // Lock in deterministic employee order so concurrent roster writes serialize
        // without introducing lock-order deadlocks across multi-employee batches.
        for (const employeeId of [...new Set(ordered.map((item) => item.employeeId))].sort()) {
            const employeeRows = await tx.$queryRaw<Array<{ employee_id: string }>>`
                SELECT employee_id
                FROM employees
                WHERE employee_id = ${employeeId}
                FOR UPDATE
            `;
            if (employeeRows.length === 0) {
                throw new ShiftAssignmentError(
                    `Karyawan ${employeeId} tidak ditemukan.`,
                    "NOT_FOUND",
                    404,
                );
            }
        }
        for (const item of ordered) {
            const fromDate = toUTCDateKey(item.effectiveFrom);
            const toDate = item.effectiveTo ? toUTCDateKey(item.effectiveTo) : null;
            const employee = await tx.employee.findUnique({
                where: { employeeId: item.employeeId },
                select: { employeeId: true, isActive: true },
            });
            if (!employee) {
                throw new ShiftAssignmentError(
                    `Karyawan ${item.employeeId} tidak ditemukan.`,
                    "NOT_FOUND",
                    404,
                );
            }
            const shift = await tx.workShift.findUnique({ where: { id: item.shiftId }, select: { id: true } });
            if (!shift) {
                throw new ShiftAssignmentError(
                    `Shift untuk ${item.employeeId} tidak ditemukan.`,
                    "NOT_FOUND",
                    404,
                );
            }
            // Tutup assignment terbuka yang dimulai sebelum tanggal baru (chaining).
            await tx.shiftAssignment.updateMany({
                where: {
                    employeeId: item.employeeId,
                    effectiveTo: null,
                    effectiveFrom: { lt: fromDate },
                },
                data: { effectiveTo: fromDate },
            });
            // Tolak sisa overlap.
            const overlap = await tx.shiftAssignment.findFirst({
                where: {
                    employeeId: item.employeeId,
                    effectiveFrom: { lt: toDate ?? new Date("9999-12-31T00:00:00.000Z") },
                    OR: [{ effectiveTo: null }, { effectiveTo: { gt: fromDate } }],
                },
                select: { id: true },
            });
            if (overlap) {
                throw new ShiftAssignmentError(
                    `Penugasan ${item.employeeId} tumpang tindih dengan jadwal yang sudah ada.`,
                    "OVERLAP",
                    409,
                );
            }
            await tx.shiftAssignment.create({
                data: {
                    employeeId: item.employeeId,
                    shiftId: item.shiftId,
                    effectiveFrom: fromDate,
                    effectiveTo: toDate,
                    createdByUserId: createdByUserId ?? null,
                },
            });
            results.push({ employeeId: item.employeeId, shiftId: item.shiftId, effectiveFrom: item.effectiveFrom });
        }
        return { applied: results.length, results };
    });
}

/**
 * Daftar roster (shift efektif) per karyawan pada satu tanggal.
 * Batch query agar tidak N+1: 1 query assignments + 1 query employees + shift fallback secukupnya.
 */
export async function getRosterForDate(dateKey: string): Promise<RosterEntry[]> {
    if (!isValidCalendarDate(dateKey)) {
        throw new ShiftAssignmentError("Tanggal harus berformat YYYY-MM-DD yang valid.", "INVALID_RANGE", 400);
    }
    const keyDate = toUTCDateKey(dateKey);
    const employees = await prisma.employee.findMany({
        where: { isActive: true },
        select: { employeeId: true, shiftId: true },
    });
    const activeEmployeeIds = employees.map((employee) => employee.employeeId);
    const covering = activeEmployeeIds.length > 0
        ? await prisma.shiftAssignment.findMany({
            where: {
                employeeId: { in: activeEmployeeIds },
                effectiveFrom: { lte: keyDate },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: keyDate } }],
            },
            orderBy: { effectiveFrom: "desc" },
            select: { id: true, employeeId: true, shiftId: true, effectiveFrom: true, effectiveTo: true },
        })
        : [];
    const latestByEmployee = new Map<string, (typeof covering)[number]>();
    for (const row of covering) {
        if (!latestByEmployee.has(row.employeeId)) latestByEmployee.set(row.employeeId, row);
    }
    const fallbackShiftIds = new Set<string>();
    for (const employee of employees) {
        if (!latestByEmployee.has(employee.employeeId) && employee.shiftId) {
            fallbackShiftIds.add(employee.shiftId);
        }
    }
    const fallbackShifts = fallbackShiftIds.size > 0
        ? await prisma.workShift.findMany({
            where: { id: { in: [...fallbackShiftIds] } },
            select: { id: true },
        })
        : [];
    const fallbackExists = new Set(fallbackShifts.map((s) => s.id));
    // Default shift bila employee tanpa assignment maupun shiftId valid.
    const needsDefault = employees.some((employee) =>
        !latestByEmployee.has(employee.employeeId)
        && (!employee.shiftId || !fallbackExists.has(employee.shiftId))
    );
    const defaultShift = needsDefault
        ? await prisma.workShift.findFirst({ where: { isDefault: true }, select: { id: true } })
        : null;
    return employees.map((employee) => {
        const assigned = latestByEmployee.get(employee.employeeId);
        if (assigned) {
            return {
                employeeId: employee.employeeId,
                shiftId: assigned.shiftId,
                source: "assignment" as const,
                assignment: {
                    id: assigned.id,
                    effectiveFrom: assigned.effectiveFrom.toISOString().slice(0, 10),
                    effectiveTo: assigned.effectiveTo?.toISOString().slice(0, 10) ?? null,
                },
            };
        }
        if (employee.shiftId && fallbackExists.has(employee.shiftId)) {
            return { employeeId: employee.employeeId, shiftId: employee.shiftId, source: "fallback" as const, assignment: null };
        }
        if (defaultShift) {
            return { employeeId: employee.employeeId, shiftId: defaultShift.id, source: "default" as const, assignment: null };
        }
        return { employeeId: employee.employeeId, shiftId: null, source: "none" as const, assignment: null };
    });
}

/**
 * Batalkan satu assignment masa depan (undo roster).
 * Hanya assignment dengan effectiveFrom setelah hari ini (WIB) yang boleh dihapus,
 * agar riwayat yang sudah berjalan tidak ditulis ulang.
 */
export async function cancelAssignment(employeeId: string, effectiveFromKey: string): Promise<void> {
    if (!employeeId) {
        throw new ShiftAssignmentError("ID karyawan harus diisi.", "NOT_FOUND", 404);
    }
    if (!isValidCalendarDate(effectiveFromKey)) {
        throw new ShiftAssignmentError("Tanggal harus berformat YYYY-MM-DD yang valid.", "INVALID_RANGE", 400);
    }
    const today = toWIBDateString();
    if (effectiveFromKey <= today) {
        throw new ShiftAssignmentError(
            "Hanya jadwal masa depan yang dapat dibatalkan. Jadwal yang sudah berjalan diubah dengan membuat assignment baru.",
            "INVALID_RANGE",
            409,
        );
    }
    const effectiveFrom = toUTCDateKey(effectiveFromKey);
    await prisma.$transaction(async (tx) => {
        // Serialize perubahan roster karyawan yang sama dengan jalur bulk assignment.
        const employeeRows = await tx.$queryRaw<Array<{ employee_id: string }>>`
            SELECT employee_id
            FROM employees
            WHERE employee_id = ${employeeId}
            FOR UPDATE
        `;
        if (employeeRows.length === 0) {
            throw new ShiftAssignmentError("Karyawan tidak ditemukan.", "NOT_FOUND", 404);
        }

        const assignment = await tx.shiftAssignment.findUnique({
            where: { employeeId_effectiveFrom: { employeeId, effectiveFrom } },
            select: { id: true, effectiveFrom: true },
        });
        if (!assignment) {
            throw new ShiftAssignmentError("Jadwal roster tidak ditemukan.", "NOT_FOUND", 404);
        }

        const successor = await tx.shiftAssignment.findFirst({
            where: {
                employeeId,
                effectiveFrom: { gt: effectiveFrom },
            },
            orderBy: { effectiveFrom: "asc" },
            select: { effectiveFrom: true },
        });
        await tx.shiftAssignment.delete({ where: { id: assignment.id } });
        // Bulk assignment menutup baris sebelumnya tepat pada effectiveFrom baru.
        // Saat dibatalkan, sambungkan baris tersebut ke penerus terdekat tanpa overlap.
        const previous = await tx.shiftAssignment.findFirst({
            where: {
                employeeId,
                effectiveFrom: { lt: effectiveFrom },
                effectiveTo: effectiveFrom,
            },
            orderBy: { effectiveFrom: "desc" },
            select: { id: true },
        });
        if (previous) {
            await tx.shiftAssignment.update({
                where: { id: previous.id },
                data: { effectiveTo: successor?.effectiveFrom ?? null },
            });
        }
    });
}

/** Tanggal WIB hari ini, untuk default effective date roster. */
export function todayWib(): string {
    return toWIBDateString();
}



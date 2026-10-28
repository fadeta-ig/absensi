import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import { addCalendarDays, isValidCalendarDate, toUTCDateKey, toWIBDateString } from "@/lib/timezone";
import type { ScheduleDay, ShiftTolerance } from "@/lib/services/attendanceShiftHelper";
import { validateLeaveDateRange } from "@/lib/services/leaveDateRange";

type ShiftClient = Prisma.TransactionClient | typeof prisma;

const FAR_FUTURE = new Date("9999-12-31T00:00:00.000Z");
export const ROSTER_TIMELINE_MAX_DAYS = 31;

export interface ResolvedShift {
    shiftId: string | null;
    shiftName: string | null;
    days: ScheduleDay[];
    tolerance: ShiftTolerance;
    source: "assignment" | "fallback" | "default" | "none";
}

export type ShiftAssignmentErrorCode = "OVERLAP" | "NOT_FOUND" | "INVALID_RANGE";

export class ShiftAssignmentError extends Error {
    constructor(
        message: string,
        public readonly code: ShiftAssignmentErrorCode,
        public readonly statusCode: number,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = "ShiftAssignmentError";
    }
}

type ShiftWithDays = {
    id: string;
    name: string;
    earlyCheckIn: number;
    lateCheckIn: number;
    earlyCheckOut: number;
    lateCheckOut: number;
    days: ScheduleDay[];
};

function toShiftContext(shift: ShiftWithDays | null, source: ResolvedShift["source"]): ResolvedShift | null {
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

function toDateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function toNullableDateKey(value: Date | null): string | null {
    return value ? toDateKey(value) : null;
}

function covers(row: { effectiveFrom: Date; effectiveTo: Date | null }, day: Date): boolean {
    return row.effectiveFrom <= day && (!row.effectiveTo || day < row.effectiveTo);
}

async function resolveBaseShift(client: ShiftClient, employeeId: string): Promise<ResolvedShift | null> {
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

async function lockEmployee(tx: Prisma.TransactionClient, employeeId: string): Promise<void> {
    const employeeRows = await tx.$queryRaw<Array<{ employee_id: string }>>`
        SELECT employee_id
        FROM employees
        WHERE employee_id = ${employeeId}
        FOR UPDATE
    `;
    if (employeeRows.length === 0) {
        throw new ShiftAssignmentError(`Karyawan ${employeeId} tidak ditemukan.`, "NOT_FOUND", 404);
    }
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
    return resolveBaseShift(client, employeeId);
}

export interface ResolvedShiftDay {
    date: string;
    shift: ResolvedShift | null;
}

/**
 * Resolve shift per tanggal untuk rentang inklusif [startDateKey, endDateKey] dengan
 * jumlah query tetap (bukan satu resolve per hari). Prioritas sama dengan resolveShiftForDate.
 */
export async function resolveShiftsForRange(
    client: ShiftClient,
    employeeId: string,
    startDateKey: string,
    endDateKey: string,
): Promise<ResolvedShiftDay[]> {
    if (!isValidCalendarDate(startDateKey) || !isValidCalendarDate(endDateKey)) {
        throw new ShiftAssignmentError("Tanggal harus berformat YYYY-MM-DD yang valid.", "INVALID_RANGE", 400);
    }
    if (endDateKey < startDateKey) {
        throw new ShiftAssignmentError("Tanggal akhir tidak boleh sebelum tanggal mulai.", "INVALID_RANGE", 400);
    }
    const startDate = toUTCDateKey(startDateKey);
    const endDate = toUTCDateKey(endDateKey);
    const rows = await client.shiftAssignment.findMany({
        where: {
            employeeId,
            effectiveFrom: { lte: endDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: startDate } }],
        },
        orderBy: { effectiveFrom: "desc" },
        include: { shift: { include: { days: true } } },
    });

    let baseResolved = false;
    let baseShift: ResolvedShift | null = null;
    let overlapLogged = false;
    const result: ResolvedShiftDay[] = [];
    let current = startDateKey;
    while (current <= endDateKey) {
        const day = toUTCDateKey(current);
        const covering = rows.filter((row) => covers(row, day));
        if (covering.length > 1 && !overlapLogged) {
            overlapLogged = true;
            logger.warn("Shift assignment overlap terdeteksi saat baca", {
                employeeId,
                dateKey: current,
                count: covering.length,
            });
        }
        let shift: ResolvedShift | null;
        if (covering[0]) {
            shift = toShiftContext(covering[0].shift, "assignment");
        } else {
            if (!baseResolved) {
                baseShift = await resolveBaseShift(client, employeeId);
                baseResolved = true;
            }
            shift = baseShift;
        }
        result.push({ date: current, shift });
        if (current === endDateKey) break;
        current = addCalendarDays(current, 1);
    }
    return result;
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
    const resolvedDays = await resolveShiftsForRange(client, employeeId, startDateKey, endDateKey);
    let count = 0;
    for (const { date, shift } of resolvedDays) {
        const dayOfWeek = toUTCDateKey(date).getUTCDay();
        const scheduleDay = shift?.days.find((d) => d.dayOfWeek === dayOfWeek) ?? null;
        const isOff = scheduleDay ? scheduleDay.isOff : dayOfWeek === 0;
        if (!isOff) count++;
    }
    return count;
}

export interface BulkAssignmentInput {
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
}

export interface BulkAssignmentOptions {
    /** Ganti jadwal masa depan (mulai hari ini atau setelahnya) yang dimulai di dalam periode baru. */
    replaceFuture?: boolean;
    /** Hitung rencana perubahan lalu batalkan transaksi tanpa menyimpan. */
    dryRun?: boolean;
}

export type RosterPlanActionType = "truncate" | "split" | "replace" | "trimStart";

export interface RosterPlanAction {
    type: RosterPlanActionType;
    assignmentId: string;
    shiftId: string;
    /** Interval lama, effectiveTo eksklusif. */
    effectiveFrom: string;
    effectiveTo: string | null;
    /** Interval yang tersisa setelah perubahan (untuk truncate/split/trimStart). */
    resultFrom?: string;
    resultTo?: string | null;
}

export interface RosterPlanConflict {
    employeeId: string;
    assignmentId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    reason: "HISTORY" | "FUTURE";
}

export interface RosterPlanItem {
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    actions: RosterPlanAction[];
    conflicts: RosterPlanConflict[];
    /** Shift yang berlaku tepat setelah periode berakhir (hanya dihitung saat dryRun). */
    after: { date: string; shiftId: string | null; source: ResolvedShift["source"] } | null;
}

export interface BulkAssignmentOutcome {
    applied: number;
    dryRun: boolean;
    results: Array<{ employeeId: string; shiftId: string; effectiveFrom: string; effectiveTo: string | null }>;
    plan: RosterPlanItem[];
    conflicts: RosterPlanConflict[];
}

class DryRunRollback extends Error {
    constructor(public readonly outcome: BulkAssignmentOutcome) {
        super("roster dry-run rollback");
        this.name = "DryRunRollback";
    }
}

function invalidItem(message: string): ShiftAssignmentError {
    return new ShiftAssignmentError(message, "INVALID_RANGE", 400);
}

function normalizeBatch(items: BulkAssignmentInput[]): Array<{ employeeId: string; shiftId: string; effectiveFrom: string; effectiveTo: string | null }> {
    for (const item of items) {
        if (!isValidCalendarDate(item.effectiveFrom)) {
            throw invalidItem(`Tanggal berlaku tidak valid untuk ${item.employeeId}.`);
        }
        if (item.effectiveTo === "" || (item.effectiveTo && !isValidCalendarDate(item.effectiveTo))) {
            throw invalidItem(`Tanggal selesai tidak valid untuk ${item.employeeId}.`);
        }
    }
    // Deterministik: proses per karyawan berurutan tanggal agar chaining tidak tergantung urutan input.
    const sorted = [...items].sort((a, b) =>
        a.employeeId.localeCompare(b.employeeId) || a.effectiveFrom.localeCompare(b.effectiveFrom)
    );
    for (let index = 1; index < sorted.length; index++) {
        const prev = sorted[index - 1];
        const item = sorted[index];
        if (prev.employeeId === item.employeeId && prev.effectiveFrom === item.effectiveFrom) {
            throw new ShiftAssignmentError(
                `Penugasan ${item.employeeId} tumpang tindih dalam batch yang sama.`,
                "OVERLAP",
                409,
            );
        }
    }
    const ordered = sorted.map((item, index) => {
        const next = sorted[index + 1];
        // Dua assignment open-ended berurutan berarti rotasi/chaining:
        // baris sebelumnya otomatis selesai tepat saat baris berikutnya mulai.
        if (!item.effectiveTo && next?.employeeId === item.employeeId) {
            return { ...item, effectiveTo: next.effectiveFrom };
        }
        return { ...item, effectiveTo: item.effectiveTo || null };
    });
    const seen: Array<{ employeeId: string; from: string; to: string | null }> = [];
    for (const item of ordered) {
        if (item.effectiveTo && item.effectiveTo <= item.effectiveFrom) {
            throw invalidItem(`Tanggal selesai harus setelah tanggal mulai untuk ${item.employeeId}.`);
        }
        for (const prev of seen) {
            if (prev.employeeId !== item.employeeId) continue;
            const prevTo = prev.to ?? "9999-12-31";
            const curTo = item.effectiveTo ?? "9999-12-31";
            if (prev.from < curTo && item.effectiveFrom < prevTo) {
                throw new ShiftAssignmentError(
                    `Penugasan ${item.employeeId} tumpang tindih dalam batch yang sama.`,
                    "OVERLAP",
                    409,
                );
            }
        }
        seen.push({ employeeId: item.employeeId, from: item.effectiveFrom, to: item.effectiveTo });
    }
    return ordered;
}

/**
 * Tetapkan shift ber-tanggal untuk banyak karyawan sekaligus pada interval [effectiveFrom, effectiveTo).
 *
 * Aturan terhadap jadwal yang sudah ada:
 * - Baris yang dimulai sebelum periode dan mencakup awal periode dipotong (truncate). Bila baris itu
 *   melewati akhir periode, sisa ekornya dibuat ulang dengan shift lama (split).
 * - Baris yang dimulai di dalam periode sebelum hari ini adalah riwayat dan selalu konflik.
 * - Baris yang dimulai di dalam periode mulai hari ini menjadi konflik kecuali `replaceFuture`,
 *   yang memangkas awalnya ke akhir periode atau menghapusnya bila seluruhnya tertutup.
 * Semua konflik dikumpulkan lalu ditolak sekaligus (409). `dryRun` mengembalikan rencana tanpa menyimpan.
 */
export async function assignShiftsBulk(
    items: BulkAssignmentInput[],
    createdByUserId?: string | null,
    options: BulkAssignmentOptions = {},
): Promise<BulkAssignmentOutcome> {
    if (items.length === 0) {
        throw new ShiftAssignmentError("Tidak ada penugasan yang dikirim.", "INVALID_RANGE", 400);
    }
    if (items.length > 200) {
        throw new ShiftAssignmentError("Maksimal 200 penugasan per batch.", "INVALID_RANGE", 400);
    }
    const ordered = normalizeBatch(items);
    const replaceFuture = options.replaceFuture === true;
    const dryRun = options.dryRun === true;
    const today = toWIBDateString();

    try {
        return await prisma.$transaction(async (tx) => {
            // Lock in deterministic employee order so concurrent roster writes serialize
            // without introducing lock-order deadlocks across multi-employee batches.
            for (const employeeId of [...new Set(ordered.map((item) => item.employeeId))].sort()) {
                await lockEmployee(tx, employeeId);
            }
            const shiftIds = [...new Set(ordered.map((item) => item.shiftId))];
            const existingShifts = await tx.workShift.findMany({
                where: { id: { in: shiftIds } },
                select: { id: true },
            });
            const knownShiftIds = new Set(existingShifts.map((shift) => shift.id));
            const missingShift = ordered.find((item) => !knownShiftIds.has(item.shiftId));
            if (missingShift) {
                throw new ShiftAssignmentError(
                    `Shift untuk ${missingShift.employeeId} tidak ditemukan.`,
                    "NOT_FOUND",
                    404,
                );
            }

            const plan: RosterPlanItem[] = [];
            const results: BulkAssignmentOutcome["results"] = [];
            for (const item of ordered) {
                const fromDate = toUTCDateKey(item.effectiveFrom);
                const toDate = item.effectiveTo ? toUTCDateKey(item.effectiveTo) : null;
                const rows = await tx.shiftAssignment.findMany({
                    where: {
                        employeeId: item.employeeId,
                        effectiveFrom: { lt: toDate ?? FAR_FUTURE },
                        OR: [{ effectiveTo: null }, { effectiveTo: { gt: fromDate } }],
                    },
                    orderBy: { effectiveFrom: "asc" },
                    select: { id: true, shiftId: true, effectiveFrom: true, effectiveTo: true },
                });

                const planItem: RosterPlanItem = {
                    employeeId: item.employeeId,
                    shiftId: item.shiftId,
                    effectiveFrom: item.effectiveFrom,
                    effectiveTo: item.effectiveTo,
                    actions: [],
                    conflicts: [],
                    after: null,
                };
                for (const row of rows) {
                    const rowFrom = toDateKey(row.effectiveFrom);
                    const rowTo = toNullableDateKey(row.effectiveTo);
                    const base = { assignmentId: row.id, shiftId: row.shiftId, effectiveFrom: rowFrom, effectiveTo: rowTo };
                    const extendsPastEnd = toDate !== null && (row.effectiveTo === null || row.effectiveTo > toDate);
                    if (row.effectiveFrom < fromDate) {
                        planItem.actions.push({ ...base, type: "truncate", resultFrom: rowFrom, resultTo: item.effectiveFrom });
                        if (extendsPastEnd) {
                            planItem.actions.push({ ...base, type: "split", resultFrom: item.effectiveTo!, resultTo: rowTo });
                        }
                    } else if (rowFrom < today) {
                        planItem.conflicts.push({ ...base, employeeId: item.employeeId, reason: "HISTORY" });
                    } else if (!replaceFuture) {
                        planItem.conflicts.push({ ...base, employeeId: item.employeeId, reason: "FUTURE" });
                    } else if (extendsPastEnd) {
                        planItem.actions.push({ ...base, type: "trimStart", resultFrom: item.effectiveTo!, resultTo: rowTo });
                    } else {
                        planItem.actions.push({ ...base, type: "replace" });
                    }
                }
                plan.push(planItem);
                if (planItem.conflicts.length > 0) continue;

                for (const action of planItem.actions) {
                    if (action.type === "truncate") {
                        await tx.shiftAssignment.update({
                            where: { id: action.assignmentId },
                            data: { effectiveTo: fromDate },
                        });
                    } else if (action.type === "split") {
                        await tx.shiftAssignment.create({
                            data: {
                                employeeId: item.employeeId,
                                shiftId: action.shiftId,
                                effectiveFrom: toDate!,
                                effectiveTo: action.resultTo ? toUTCDateKey(action.resultTo) : null,
                                createdByUserId: createdByUserId ?? null,
                            },
                        });
                    } else if (action.type === "trimStart") {
                        await tx.shiftAssignment.update({
                            where: { id: action.assignmentId },
                            data: { effectiveFrom: toDate! },
                        });
                    } else {
                        await tx.shiftAssignment.delete({ where: { id: action.assignmentId } });
                    }
                }
                // Jaring pengaman: setelah semua aksi tidak boleh tersisa overlap.
                const overlap = await tx.shiftAssignment.findFirst({
                    where: {
                        employeeId: item.employeeId,
                        effectiveFrom: { lt: toDate ?? FAR_FUTURE },
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
                results.push({
                    employeeId: item.employeeId,
                    shiftId: item.shiftId,
                    effectiveFrom: item.effectiveFrom,
                    effectiveTo: item.effectiveTo,
                });
            }

            const conflicts = plan.flatMap((planItem) => planItem.conflicts);
            if (dryRun) {
                for (const planItem of plan) {
                    if (!planItem.effectiveTo || planItem.conflicts.length > 0) continue;
                    const resolved = await resolveShiftForDate(tx, planItem.employeeId, planItem.effectiveTo);
                    planItem.after = {
                        date: planItem.effectiveTo,
                        shiftId: resolved?.shiftId ?? null,
                        source: resolved?.source ?? "none",
                    };
                }
                throw new DryRunRollback({ applied: 0, dryRun: true, results, plan, conflicts });
            }
            if (conflicts.length > 0) {
                const employeesInConflict = new Set(conflicts.map((conflict) => conflict.employeeId)).size;
                throw new ShiftAssignmentError(
                    `${conflicts.length} jadwal milik ${employeesInConflict} karyawan bertabrakan dengan roster yang sudah ada.`,
                    "OVERLAP",
                    409,
                    conflicts,
                );
            }
            return { applied: results.length, dryRun: false, results, plan, conflicts };
        });
    } catch (error) {
        if (error instanceof DryRunRollback) return error.outcome;
        throw error;
    }
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
                    effectiveFrom: toDateKey(assigned.effectiveFrom),
                    effectiveTo: toNullableDateKey(assigned.effectiveTo),
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

export interface RosterTimelineCell {
    date: string;
    shiftId: string | null;
    source: ResolvedShift["source"];
    assignmentId: string | null;
}

export interface RosterTimelineAssignment {
    id: string;
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
}

export interface RosterTimeline {
    from: string;
    /** Hari terakhir yang ditampilkan (inklusif). */
    to: string;
    today: string;
    days: number;
    defaultShiftId: string | null;
    employees: Array<{ employeeId: string; baseShiftId: string | null; cells: RosterTimelineCell[] }>;
    /** Assignment yang beririsan dengan rentang atau masih berjalan/akan datang (effectiveTo eksklusif). */
    assignments: RosterTimelineAssignment[];
}

/**
 * Timeline roster seluruh karyawan aktif untuk `days` hari mulai `fromKey`.
 * Query tetap: employees, shifts, assignments.
 */
export async function getRosterTimeline(fromKey: string, days: number): Promise<RosterTimeline> {
    if (!isValidCalendarDate(fromKey)) {
        throw new ShiftAssignmentError("Tanggal harus berformat YYYY-MM-DD yang valid.", "INVALID_RANGE", 400);
    }
    if (!Number.isInteger(days) || days < 1 || days > ROSTER_TIMELINE_MAX_DAYS) {
        throw new ShiftAssignmentError(
            `Jumlah hari harus 1 sampai ${ROSTER_TIMELINE_MAX_DAYS}.`,
            "INVALID_RANGE",
            400,
        );
    }
    const today = toWIBDateString();
    const toKey = addCalendarDays(fromKey, days - 1);
    const dateKeys = Array.from({ length: days }, (_, index) => addCalendarDays(fromKey, index));
    const lowerBound = toUTCDateKey(fromKey < today ? fromKey : today);

    const [employees, shifts] = await Promise.all([
        prisma.employee.findMany({
            where: { isActive: true },
            select: { employeeId: true, shiftId: true },
            orderBy: { employeeId: "asc" },
        }),
        prisma.workShift.findMany({ select: { id: true, isDefault: true } }),
    ]);
    const knownShiftIds = new Set(shifts.map((shift) => shift.id));
    const defaultShiftId = shifts.find((shift) => shift.isDefault)?.id ?? null;
    const employeeIds = employees.map((employee) => employee.employeeId);
    const rows = employeeIds.length > 0
        ? await prisma.shiftAssignment.findMany({
            where: {
                employeeId: { in: employeeIds },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: lowerBound } }],
            },
            orderBy: [{ employeeId: "asc" }, { effectiveFrom: "asc" }],
            select: { id: true, employeeId: true, shiftId: true, effectiveFrom: true, effectiveTo: true },
        })
        : [];
    const rowsByEmployee = new Map<string, typeof rows>();
    for (const row of rows) {
        const list = rowsByEmployee.get(row.employeeId) ?? [];
        list.push(row);
        rowsByEmployee.set(row.employeeId, list);
    }

    return {
        from: fromKey,
        to: toKey,
        today,
        days,
        defaultShiftId,
        employees: employees.map((employee) => {
            const employeeRows = rowsByEmployee.get(employee.employeeId) ?? [];
            const baseShiftId = employee.shiftId && knownShiftIds.has(employee.shiftId) ? employee.shiftId : null;
            const cells = dateKeys.map((date): RosterTimelineCell => {
                const day = toUTCDateKey(date);
                let covering: (typeof employeeRows)[number] | undefined;
                for (const row of employeeRows) {
                    if (covers(row, day) && (!covering || row.effectiveFrom > covering.effectiveFrom)) covering = row;
                }
                if (covering) {
                    return { date, shiftId: covering.shiftId, source: "assignment", assignmentId: covering.id };
                }
                if (baseShiftId) return { date, shiftId: baseShiftId, source: "fallback", assignmentId: null };
                if (defaultShiftId) return { date, shiftId: defaultShiftId, source: "default", assignmentId: null };
                return { date, shiftId: null, source: "none", assignmentId: null };
            });
            return { employeeId: employee.employeeId, baseShiftId, cells };
        }),
        assignments: rows.map((row) => ({
            id: row.id,
            employeeId: row.employeeId,
            shiftId: row.shiftId,
            effectiveFrom: toDateKey(row.effectiveFrom),
            effectiveTo: toNullableDateKey(row.effectiveTo),
        })),
    };
}

export interface CancelledAssignment {
    id: string;
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    /** Baris sebelumnya yang diperpanjang untuk menutup celah, bila ada. */
    extendedPreviousId: string | null;
    /** Penerus dengan shift sama yang digabung ke baris sebelumnya, bila ada. */
    mergedSuccessorId: string | null;
}

/**
 * Batalkan satu assignment yang dimulai hari ini atau setelahnya (undo roster).
 * Riwayat yang dimulai sebelum hari ini (WIB) tidak boleh dihapus.
 * Baris sebelumnya yang dipotong tepat pada tanggal mulai assignment diperpanjang hingga
 * akhir assignment yang dibatalkan; bila penerusnya bershift sama dan bersambung, keduanya digabung.
 */
export async function cancelAssignment(employeeId: string, effectiveFromKey: string): Promise<CancelledAssignment> {
    if (!employeeId) {
        throw new ShiftAssignmentError("ID karyawan harus diisi.", "NOT_FOUND", 404);
    }
    if (!isValidCalendarDate(effectiveFromKey)) {
        throw new ShiftAssignmentError("Tanggal harus berformat YYYY-MM-DD yang valid.", "INVALID_RANGE", 400);
    }
    const today = toWIBDateString();
    if (effectiveFromKey < today) {
        throw new ShiftAssignmentError(
            "Jadwal yang dimulai sebelum hari ini tidak dapat dibatalkan. Ubah tanggal akhirnya atau buat jadwal baru.",
            "INVALID_RANGE",
            409,
        );
    }
    const effectiveFrom = toUTCDateKey(effectiveFromKey);
    return prisma.$transaction(async (tx) => {
        // Serialize perubahan roster karyawan yang sama dengan jalur bulk assignment.
        await lockEmployee(tx, employeeId);

        const assignment = await tx.shiftAssignment.findUnique({
            where: { employeeId_effectiveFrom: { employeeId, effectiveFrom } },
            select: { id: true, shiftId: true, effectiveFrom: true, effectiveTo: true },
        });
        if (!assignment) {
            throw new ShiftAssignmentError("Jadwal roster tidak ditemukan.", "NOT_FOUND", 404);
        }

        await tx.shiftAssignment.delete({ where: { id: assignment.id } });
        const previous = await tx.shiftAssignment.findFirst({
            where: {
                employeeId,
                effectiveFrom: { lt: effectiveFrom },
                effectiveTo: effectiveFrom,
            },
            orderBy: { effectiveFrom: "desc" },
            select: { id: true, shiftId: true },
        });
        let mergedSuccessorId: string | null = null;
        if (previous) {
            let newPreviousTo = assignment.effectiveTo;
            if (assignment.effectiveTo) {
                const successor = await tx.shiftAssignment.findUnique({
                    where: { employeeId_effectiveFrom: { employeeId, effectiveFrom: assignment.effectiveTo } },
                    select: { id: true, shiftId: true, effectiveTo: true },
                });
                if (successor && successor.shiftId === previous.shiftId) {
                    await tx.shiftAssignment.delete({ where: { id: successor.id } });
                    newPreviousTo = successor.effectiveTo;
                    mergedSuccessorId = successor.id;
                }
            }
            await tx.shiftAssignment.update({
                where: { id: previous.id },
                data: { effectiveTo: newPreviousTo },
            });
        }
        return {
            id: assignment.id,
            employeeId,
            shiftId: assignment.shiftId,
            effectiveFrom: effectiveFromKey,
            effectiveTo: toNullableDateKey(assignment.effectiveTo),
            extendedPreviousId: previous?.id ?? null,
            mergedSuccessorId,
        };
    });
}

export interface UpdatedAssignmentEnd {
    id: string;
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    previousEffectiveTo: string | null;
    effectiveTo: string | null;
    changed: boolean;
}

/**
 * Ubah tanggal akhir (eksklusif) satu assignment: memendekkan atau memperpanjang.
 * Hanya bagian mulai hari ini yang boleh berubah, dan tidak boleh melewati awal assignment berikutnya.
 */
export async function updateAssignmentEnd(
    employeeId: string,
    effectiveFromKey: string,
    newEffectiveToKey: string | null,
): Promise<UpdatedAssignmentEnd> {
    if (!employeeId) {
        throw new ShiftAssignmentError("ID karyawan harus diisi.", "NOT_FOUND", 404);
    }
    if (!isValidCalendarDate(effectiveFromKey) || (newEffectiveToKey !== null && !isValidCalendarDate(newEffectiveToKey))) {
        throw new ShiftAssignmentError("Tanggal harus berformat YYYY-MM-DD yang valid.", "INVALID_RANGE", 400);
    }
    if (newEffectiveToKey !== null && newEffectiveToKey <= effectiveFromKey) {
        throw new ShiftAssignmentError("Tanggal akhir harus setelah tanggal mulai jadwal.", "INVALID_RANGE", 400);
    }
    const today = toWIBDateString();
    if (newEffectiveToKey !== null && newEffectiveToKey < today) {
        throw new ShiftAssignmentError(
            "Tanggal akhir baru tidak boleh membuat jadwal berakhir sebelum hari ini.",
            "INVALID_RANGE",
            409,
        );
    }
    const effectiveFrom = toUTCDateKey(effectiveFromKey);
    return prisma.$transaction(async (tx) => {
        await lockEmployee(tx, employeeId);
        const assignment = await tx.shiftAssignment.findUnique({
            where: { employeeId_effectiveFrom: { employeeId, effectiveFrom } },
            select: { id: true, shiftId: true, effectiveTo: true },
        });
        if (!assignment) {
            throw new ShiftAssignmentError("Jadwal roster tidak ditemukan.", "NOT_FOUND", 404);
        }
        const previousEffectiveTo = toNullableDateKey(assignment.effectiveTo);
        if (previousEffectiveTo !== null && previousEffectiveTo < today) {
            throw new ShiftAssignmentError(
                "Jadwal yang sudah berakhir sebelum hari ini tidak dapat diubah.",
                "INVALID_RANGE",
                409,
            );
        }
        const base = {
            id: assignment.id,
            employeeId,
            shiftId: assignment.shiftId,
            effectiveFrom: effectiveFromKey,
            previousEffectiveTo,
        };
        if (previousEffectiveTo === newEffectiveToKey) {
            return { ...base, effectiveTo: newEffectiveToKey, changed: false };
        }
        const successor = await tx.shiftAssignment.findFirst({
            where: { employeeId, effectiveFrom: { gt: effectiveFrom } },
            orderBy: { effectiveFrom: "asc" },
            select: { effectiveFrom: true },
        });
        if (successor) {
            const successorFrom = toDateKey(successor.effectiveFrom);
            if (newEffectiveToKey === null || newEffectiveToKey > successorFrom) {
                throw new ShiftAssignmentError(
                    `Tanggal akhir bertabrakan dengan jadwal berikutnya yang mulai ${successorFrom}.`,
                    "OVERLAP",
                    409,
                );
            }
        }
        await tx.shiftAssignment.update({
            where: { id: assignment.id },
            data: { effectiveTo: newEffectiveToKey ? toUTCDateKey(newEffectiveToKey) : null },
        });
        return { ...base, effectiveTo: newEffectiveToKey, changed: true };
    });
}

/** Tanggal WIB hari ini, untuk default effective date roster. */
export function todayWib(): string {
    return toWIBDateString();
}

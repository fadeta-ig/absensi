import { prisma } from "@/lib/prisma";
import { WorkShift } from "@/types";
import { Prisma } from "@prisma/client";
import { seed3Shifts } from "@/../prisma/seed3Shifts";

type WorkShiftWithDays = Prisma.WorkShiftGetPayload<{ include: { days: true } }>;

export class ShiftConflictError extends Error {
    public readonly statusCode = 409;

    constructor(
        message: string,
        public readonly assignmentCount: number = 0,
        public readonly rosterCount: number = 0,
    ) {
        super(message);
        this.name = "ShiftConflictError";
    }
}

function mapWorkShift(row: WorkShiftWithDays): WorkShift {
    return row;
}

/** Fetches all shifts with their day schedules */
export async function getShifts(): Promise<WorkShift[]> {
    const rows = await prisma.workShift.findMany({
        orderBy: { name: "asc" },
        include: { days: { orderBy: { dayOfWeek: "asc" } } },
    });
    return rows.map(mapWorkShift);
}

interface ShiftDayInput {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOff: boolean;
}

interface CreateShiftInput {
    name: string;
    isDefault: boolean;
    lateCheckIn?: number;
    earlyCheckIn?: number;
    lateCheckOut?: number;
    earlyCheckOut?: number;
    days?: ShiftDayInput[];
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ShiftValidationError extends Error {
    public readonly statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = "ShiftValidationError";
    }
}

/**
 * Validasi definisi shift di level service (bukan hanya Zod),
 * agar pemanggil langsung tetap tidak bisa membuat shift 0 hari / jam rusak / toleransi minus.
 */
export function validateShiftDefinition(days: ShiftDayInput[] | undefined, tolerances: {
    lateCheckIn?: number; earlyCheckIn?: number; lateCheckOut?: number; earlyCheckOut?: number;
}): void {
    for (const [key, value] of Object.entries(tolerances)) {
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
            throw new ShiftValidationError(`Toleransi ${key} harus bilangan bulat >= 0.`);
        }
    }
    if (!days || days.length !== 7) {
        throw new ShiftValidationError("Jadwal shift wajib lengkap 7 hari.");
    }
    const seen = new Set<number>();
    for (const day of days) {
        if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6 || seen.has(day.dayOfWeek)) {
            throw new ShiftValidationError("Hari shift harus unik 0-6 (Minggu-Sabtu).");
        }
        seen.add(day.dayOfWeek);
        if (!TIME_PATTERN.test(day.startTime) || !TIME_PATTERN.test(day.endTime)) {
            throw new ShiftValidationError(`Jam shift hari ${day.dayOfWeek} harus format HH:mm yang valid.`);
        }
        if (!day.isOff && day.startTime === day.endTime) {
            throw new ShiftValidationError(`Jam masuk dan pulang hari kerja ${day.dayOfWeek} tidak boleh sama.`);
        }
    }
}

export async function createShift(data: CreateShiftInput): Promise<WorkShift> {
    validateShiftDefinition(data.days, {
        lateCheckIn: data.lateCheckIn,
        earlyCheckIn: data.earlyCheckIn,
        lateCheckOut: data.lateCheckOut,
        earlyCheckOut: data.earlyCheckOut,
    });
    return prisma.$transaction(async (tx) => {
        if (data.isDefault) {
            await tx.workShift.updateMany({ data: { isDefault: false } });
        }

        const row = await tx.workShift.create({
            data: {
                name: data.name,
                isDefault: data.isDefault,
                lateCheckIn: data.lateCheckIn ?? 0,
                earlyCheckIn: data.earlyCheckIn ?? 0,
                lateCheckOut: data.lateCheckOut ?? 0,
                earlyCheckOut: data.earlyCheckOut ?? 0,
                days: {
                    create: (data.days ?? []).map((d) => ({
                        dayOfWeek: d.dayOfWeek,
                        startTime: d.startTime,
                        endTime: d.endTime,
                        isOff: d.isOff,
                    })),
                },
            },
            include: { days: { orderBy: { dayOfWeek: "asc" } } },
        });
        return mapWorkShift(row);
    });
}

export async function updateShift(id: string, data: Partial<CreateShiftInput>): Promise<WorkShift | null> {
    return prisma.$transaction(async (tx) => {
        const existing = await tx.workShift.findUnique({ where: { id }, select: { id: true, isDefault: true } });
        if (!existing) return null;

        if (existing.isDefault && data.isDefault === false) {
            throw new ShiftConflictError("Shift default tidak dapat dinonaktifkan langsung. Tetapkan shift lain sebagai default.");
        }

        if (data.days !== undefined || data.lateCheckIn !== undefined || data.earlyCheckIn !== undefined || data.lateCheckOut !== undefined || data.earlyCheckOut !== undefined) {
            const base = data.days ?? await tx.workShiftDay.findMany({
                where: { shiftId: id },
                select: { dayOfWeek: true, startTime: true, endTime: true, isOff: true },
            });
            validateShiftDefinition(base, {
                lateCheckIn: data.lateCheckIn,
                earlyCheckIn: data.earlyCheckIn,
                lateCheckOut: data.lateCheckOut,
                earlyCheckOut: data.earlyCheckOut,
            });
        }

        if (data.isDefault) {
            await tx.workShift.updateMany({
                where: { id: { not: id } },
                data: { isDefault: false },
            });
        }

        const row = await tx.workShift.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
                ...(data.lateCheckIn !== undefined && { lateCheckIn: data.lateCheckIn }),
                ...(data.earlyCheckIn !== undefined && { earlyCheckIn: data.earlyCheckIn }),
                ...(data.lateCheckOut !== undefined && { lateCheckOut: data.lateCheckOut }),
                ...(data.earlyCheckOut !== undefined && { earlyCheckOut: data.earlyCheckOut }),
                ...(data.days && {
                    days: {
                        deleteMany: {},
                        create: data.days.map((d) => ({
                            dayOfWeek: d.dayOfWeek,
                            startTime: d.startTime,
                            endTime: d.endTime,
                            isOff: d.isOff,
                        })),
                    },
                }),
            },
            include: { days: { orderBy: { dayOfWeek: "asc" } } },
        });
        return mapWorkShift(row);
    });
}

export async function deleteShift(id: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const existing = await tx.workShift.findUnique({
            where: { id },
            select: { id: true, isDefault: true },
        });
        if (!existing) return false;

        const assignmentCount = await tx.employee.count({ where: { shiftId: id } });
        if (existing.isDefault) {
            throw new ShiftConflictError(
                `Shift default tidak dapat dihapus.${assignmentCount > 0 ? ` Saat ini digunakan oleh ${assignmentCount} karyawan.` : ""} Tetapkan shift lain sebagai default terlebih dahulu.`,
                assignmentCount
            );
        }
        if (assignmentCount > 0) {
            throw new ShiftConflictError(
                `Shift tidak dapat dihapus karena masih digunakan oleh ${assignmentCount} karyawan.`,
                assignmentCount
            );
        }
        const rosterCount = await tx.shiftAssignment.count({ where: { shiftId: id } });
        if (rosterCount > 0) {
            throw new ShiftConflictError(
                `Shift tidak dapat dihapus karena masih dipakai ${rosterCount} jadwal roster.`,
                assignmentCount,
                rosterCount,
            );
        }

        await tx.workShift.delete({ where: { id } });
        return true;
    });
}

export async function initialize3ShiftPreset(): Promise<{ results: string[]; shifts: WorkShift[] }> {
    return prisma.$transaction(async (tx) => {
        const results = await seed3Shifts(tx);
        const rows = await tx.workShift.findMany({
            orderBy: { name: "asc" },
            include: { days: { orderBy: { dayOfWeek: "asc" } } },
        });
        return { results, shifts: rows.map(mapWorkShift) };
    });
}

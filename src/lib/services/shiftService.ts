import { prisma } from "../prisma";
import { WorkShift } from "@/types";
import { Prisma } from "@prisma/client";

type WorkShiftWithDays = Prisma.WorkShiftGetPayload<{ include: { days: true } }>;

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

export async function createShift(data: CreateShiftInput): Promise<WorkShift> {
    if (data.isDefault) {
        await prisma.workShift.updateMany({ data: { isDefault: false } });
    }
    const row = await prisma.workShift.create({
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
}

export async function updateShift(id: string, data: Partial<CreateShiftInput>): Promise<WorkShift | null> {
    const existing = await prisma.workShift.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return null;

    if (data.isDefault) {
        await prisma.workShift.updateMany({ data: { isDefault: false } });
    }

    // If days are provided, delete old ones and recreate
    if (data.days) {
        await prisma.workShiftDay.deleteMany({ where: { shiftId: id } });
    }

    const row = await prisma.workShift.update({
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
}

export async function deleteShift(id: string): Promise<boolean> {
    const existing = await prisma.workShift.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return false;
    await prisma.workShift.delete({ where: { id } });
    return true;
}

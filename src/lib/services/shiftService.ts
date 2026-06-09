import { prisma } from "../prisma";
import { WorkShift } from "@/types";
import logger from "@/lib/logger";
import { toISOOrNull } from "@/lib/utils";

function mapWorkShift(row: any): WorkShift {
    return {
        ...row,
        createdAt: toISOOrNull(row.createdAt)!,
        updatedAt: toISOOrNull(row.updatedAt)!,
    };
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
    days: ShiftDayInput[];
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
                create: data.days.map((d) => ({
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
    try {
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
    } catch (error) {
        logger.error("Failed to update shift", { id, error });
        return null;
    }
}

export async function deleteShift(id: string): Promise<boolean> {
    try {
        await prisma.workShift.delete({ where: { id } });
        return true;
    } catch (error) {
        logger.error("Failed to delete shift", { id, error });
        return false;
    }
}

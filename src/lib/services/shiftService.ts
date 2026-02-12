import { prisma } from "../prisma";
import { WorkShift } from "@/types";

export async function getShifts(): Promise<WorkShift[]> {
    const rows = await prisma.workShift.findMany({ orderBy: { name: "asc" } });
    return rows as unknown as WorkShift[];
}

export async function createShift(data: Omit<WorkShift, "id">): Promise<WorkShift> {
    if (data.isDefault) {
        await prisma.workShift.updateMany({ data: { isDefault: false } });
    }
    const row = await prisma.workShift.create({
        data: {
            name: data.name,
            startTime: data.startTime,
            endTime: data.endTime,
            isDefault: data.isDefault,
        },
    });
    return row as unknown as WorkShift;
}

export async function updateShift(id: string, data: Partial<WorkShift>): Promise<WorkShift | null> {
    try {
        if (data.isDefault) {
            await prisma.workShift.updateMany({ data: { isDefault: false } });
        }
        const row = await prisma.workShift.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.startTime !== undefined && { startTime: data.startTime }),
                ...(data.endTime !== undefined && { endTime: data.endTime }),
                ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
            },
        });
        return row as unknown as WorkShift;
    } catch {
        return null;
    }
}

export async function deleteShift(id: string): Promise<boolean> {
    try {
        await prisma.workShift.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}

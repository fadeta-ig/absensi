import { prisma } from "../prisma";
import { OvertimeRequest } from "@/types";

export async function getOvertimeRequests(employeeId?: string): Promise<OvertimeRequest[]> {
    const rows = await prisma.overtimeRequest.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { createdAt: "desc" },
    });
    return rows as OvertimeRequest[];
}

export async function getOvertimeRequestById(id: string): Promise<OvertimeRequest | undefined> {
    const row = await prisma.overtimeRequest.findUnique({ where: { id } });
    if (!row) return undefined;
    return row as OvertimeRequest;
}

export async function createOvertimeRequest(data: Omit<OvertimeRequest, "id">): Promise<OvertimeRequest> {
    const row = await prisma.overtimeRequest.create({
        data: {
            employeeId: data.employeeId,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            hours: data.hours,
            reason: data.reason,
            status: data.status,
            createdAt: data.createdAt,
        },
    });
    return row as OvertimeRequest;
}

export async function updateOvertimeRequest(id: string, data: Partial<OvertimeRequest>): Promise<OvertimeRequest | null> {
    try {
        const row = await prisma.overtimeRequest.update({
            where: { id },
            data: {
                ...(data.date !== undefined && { date: data.date }),
                ...(data.startTime !== undefined && { startTime: data.startTime }),
                ...(data.endTime !== undefined && { endTime: data.endTime }),
                ...(data.hours !== undefined && { hours: data.hours }),
                ...(data.reason !== undefined && { reason: data.reason }),
                ...(data.status !== undefined && { status: data.status }),
            },
        });
        return row as OvertimeRequest;
    } catch {
        return null;
    }
}

export async function deleteOvertimeRequest(id: string): Promise<boolean> {
    try {
        await prisma.overtimeRequest.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}

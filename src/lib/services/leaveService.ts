import { prisma } from "../prisma";
import { LeaveRequest } from "@/types";

export async function getLeaveRequests(employeeId?: string): Promise<LeaveRequest[]> {
    const rows = await prisma.leaveRequest.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { createdAt: "desc" },
    });
    return rows as unknown as LeaveRequest[];
}

export async function createLeaveRequest(data: Omit<LeaveRequest, "id">): Promise<LeaveRequest> {
    const row = await prisma.leaveRequest.create({
        data: {
            employeeId: data.employeeId,
            type: data.type,
            startDate: data.startDate,
            endDate: data.endDate,
            reason: data.reason,
            status: data.status,
            createdAt: data.createdAt,
        },
    });
    return row as unknown as LeaveRequest;
}

export async function updateLeaveRequest(id: string, data: Partial<LeaveRequest>): Promise<LeaveRequest | null> {
    try {
        const row = await prisma.leaveRequest.update({
            where: { id },
            data: {
                ...(data.status !== undefined && { status: data.status }),
                ...(data.reason !== undefined && { reason: data.reason }),
            },
        });
        return row as unknown as LeaveRequest;
    } catch {
        return null;
    }
}

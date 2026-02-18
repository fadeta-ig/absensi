import { prisma } from "../prisma";
import { LeaveRequest } from "@/types";

export async function getLeaveRequests(employeeId?: string): Promise<any[]> {
    const rows = await prisma.leaveRequest.findMany({
        where: employeeId ? { employeeId } : undefined,
        include: {
            employee: {
                select: {
                    name: true,
                    employeeId: true,
                    totalLeave: true,
                    usedLeave: true
                }
            }
        },
        orderBy: { createdAt: "desc" },
    });
    return rows;
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
            attachment: (data as any).attachment,
            createdAt: data.createdAt,
        },
    });
    return row as unknown as LeaveRequest;
}

function calculateDays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    const diff = e.getTime() - s.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
}

export async function updateLeaveRequest(id: string, data: Partial<LeaveRequest>): Promise<LeaveRequest | null> {
    try {
        // If approving, we need to update employee leave balance
        if (data.status === "approved") {
            const request = await prisma.leaveRequest.findUnique({
                where: { id },
                include: { employee: true }
            });

            if (request && request.status !== "approved") {
                const days = calculateDays(request.startDate, request.endDate);

                // Update employee usedLeave
                await prisma.employee.update({
                    where: { employeeId: request.employeeId },
                    data: {
                        usedLeave: {
                            increment: days
                        }
                    }
                });
            }
        }

        const row = await prisma.leaveRequest.update({
            where: { id },
            data: {
                ...(data.status !== undefined && { status: data.status }),
                ...(data.reason !== undefined && { reason: data.reason }),
            },
        });
        return row as unknown as LeaveRequest;
    } catch (err) {
        console.error("[LeaveService Update Error]:", err);
        return null;
    }
}

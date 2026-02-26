import { prisma } from "../prisma";
import { LeaveRequest } from "@/types";
import logger from "@/lib/logger";

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
    logger.info("Pengajuan cuti baru", { employeeId: data.employeeId, type: data.type, startDate: data.startDate, endDate: data.endDate });
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
        const existing = await prisma.leaveRequest.findUnique({
            where: { id },
            include: { employee: true }
        });

        if (!existing) return null;

        // Balance Recalculation Logic
        if (data.status === "approved" || (existing.status === "approved" && (data.startDate || data.endDate))) {
            const oldDays = calculateDays(existing.startDate, existing.endDate);
            const newDays = calculateDays(
                data.startDate || existing.startDate,
                data.endDate || existing.endDate
            );

            let diff = 0;
            if (existing.status !== "approved" && data.status === "approved") {
                // Changing from pending/rejected to approved
                diff = newDays;
            } else if (existing.status === "approved" && data.status !== "rejected") {
                // Already approved, just adjusting dates
                diff = newDays - oldDays;
            }

            if (diff !== 0) {
                await prisma.employee.update({
                    where: { employeeId: existing.employeeId },
                    data: { usedLeave: { increment: diff } }
                });
            }
        } else if (existing.status === "approved" && data.status === "rejected") {
            // Reversing an approval
            const days = calculateDays(existing.startDate, existing.endDate);
            await prisma.employee.update({
                where: { employeeId: existing.employeeId },
                data: { usedLeave: { decrement: days } }
            });
        }

        const row = await prisma.leaveRequest.update({
            where: { id },
            data: {
                ...(data.status !== undefined && { status: data.status }),
                ...(data.startDate !== undefined && { startDate: data.startDate }),
                ...(data.endDate !== undefined && { endDate: data.endDate }),
                ...(data.reason !== undefined && { reason: data.reason }),
            },
        });
        return row as unknown as LeaveRequest;
    } catch (err) {
        logger.error("Gagal update leave request", { id, error: err });
        return null;
    }
}

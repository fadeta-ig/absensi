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
            startDate: new Date(data.startDate),
            endDate: new Date(data.endDate),
            reason: data.reason,
            status: data.status,
            attachment: data.attachment,
            // createdAt: @default(now()) — tidak perlu diisi
        },
    });
    return row as unknown as LeaveRequest;
}

/**
 * Hitung hari kerja antara start dan end berdasarkan shift karyawan.
 * Menggunakan isOff dari WorkShiftDay untuk menentukan hari libur.
 * Jika offDays tidak diberikan, default: hanya Minggu (0) yang libur.
 */
export function calculateWorkingDays(
    start: Date | string,
    end: Date | string,
    offDays: Set<number> = new Set([0]) // default: Minggu libur
): number {
    const s = new Date(start);
    const e = new Date(end);
    let count = 0;
    const current = new Date(s);

    while (current <= e) {
        const dayOfWeek = current.getDay();
        if (!offDays.has(dayOfWeek)) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }

    return Math.max(count, 0);
}

export async function updateLeaveRequest(id: string, data: Partial<LeaveRequest>): Promise<LeaveRequest | null> {
    try {
        const existing = await prisma.leaveRequest.findUnique({
            where: { id },
            include: { employee: true }
        });

        if (!existing) return null;

        // Balance Recalculation Logic
        // Resolve employee's shift offDays for accurate working-day calculation
        const offDays = new Set<number>([0]); // default: Minggu
        if (existing.employee.shiftId) {
            const shift = await prisma.workShift.findUnique({
                where: { id: existing.employee.shiftId },
                include: { days: true },
            });
            if (shift) {
                offDays.clear();
                for (const d of shift.days) {
                    if (d.isOff) offDays.add(d.dayOfWeek);
                }
            }
        }

        if (data.status === "approved" || (existing.status === "approved" && (data.startDate || data.endDate))) {
            const oldDays = calculateWorkingDays(existing.startDate, existing.endDate, offDays);
            const newDays = calculateWorkingDays(
                data.startDate || existing.startDate,
                data.endDate || existing.endDate,
                offDays
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
            const days = calculateWorkingDays(existing.startDate, existing.endDate, offDays);
            await prisma.employee.update({
                where: { employeeId: existing.employeeId },
                data: { usedLeave: { decrement: days } }
            });
        }

        const row = await prisma.leaveRequest.update({
            where: { id },
            data: {
                ...(data.status !== undefined && { status: data.status }),
                ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
                ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
                ...(data.reason !== undefined && { reason: data.reason }),
            },
        });
        return row as unknown as LeaveRequest;
    } catch (err) {
        logger.error("Gagal update leave request", { id, error: err });
        return null;
    }
}

import { prisma } from "../prisma";
import { LeaveRequest } from "@/types";
import { Prisma } from "@prisma/client";
import { LeaveDateRangeError, validateLeaveDateRange } from "@/lib/services/leaveDateRange";
import { toDateString } from "@/lib/utils";
import { toUTCDateKey } from "@/lib/timezone";

/** Tipe inferensi Prisma untuk LeaveRequest beserta relasi employee-nya */
export type LeaveRequestWithEmployee = Prisma.LeaveRequestGetPayload<{
    include: {
        employee: {
            select: { name: true; employeeId: true; totalLeave: true; usedLeave: true };
        };
    };
}>;

/** Mapper aman: mengkonversi Date fields Prisma menjadi string ISO untuk LeaveRequest */
function toLeaveRequest(row: Prisma.LeaveRequestGetPayload<Record<string, never>>): LeaveRequest {
    return {
        id: row.id,
        employeeId: row.employeeId,
        type: row.type as LeaveRequest["type"],
        startDate: row.startDate instanceof Date ? row.startDate.toISOString().split("T")[0] : String(row.startDate),
        endDate: row.endDate instanceof Date ? row.endDate.toISOString().split("T")[0] : String(row.endDate),
        reason: row.reason,
        status: row.status as LeaveRequest["status"],
        attachment: row.attachment ?? null,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
}

export async function getLeaveRequests(employeeId?: string): Promise<LeaveRequestWithEmployee[]> {
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
    const startDate = toDateString(data.startDate);
    const endDate = toDateString(data.endDate);
    assertSupportedLeaveRange(startDate, endDate);

    // Pre-check: validasi saldo cuti untuk tipe annual
    if (data.type === "annual") {
        const employee = await prisma.employee.findUnique({
            where: { employeeId: data.employeeId },
            select: { totalLeave: true, usedLeave: true },
        });

        if (!employee) {
            throw new Error("Data karyawan tidak ditemukan.");
        }

        // Hitung hari kerja per tanggal dengan shift efektif masing-masing hari (mendukung rotasi).
        const { countWorkingDaysForEmployee } = await import("@/lib/services/shiftAssignmentService");
        const requestedDays = await countWorkingDaysForEmployee(
            prisma,
            data.employeeId,
            startDate,
            endDate,
        );
        const remainingLeave = employee.totalLeave - employee.usedLeave;

        if (requestedDays > remainingLeave) {
            throw new Error(
                `Sisa cuti tahunan tidak mencukupi. Sisa: ${remainingLeave} hari, dibutuhkan: ${requestedDays} hari kerja.`
            );
        }
    }

    const row = await prisma.leaveRequest.create({
        data: {
            employeeId: data.employeeId,
            type: data.type,
            startDate: toUTCDateKey(startDate),
            endDate: toUTCDateKey(endDate),
            reason: data.reason,
            status: data.status,
            attachment: data.attachment,
            // createdAt: @default(now()) — tidak perlu diisi
        },
    });
    return toLeaveRequest(row);
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
    const existing = await prisma.leaveRequest.findUnique({
        where: { id },
        include: { employee: true }
    });

    if (!existing) return null;

    const startDate = toDateString(data.startDate || existing.startDate);
    const endDate = toDateString(data.endDate || existing.endDate);
    assertSupportedLeaveRange(startDate, endDate);

    // Balance Recalculation Logic
    // Hitung hari kerja per tanggal dengan shift efektif masing-masing hari (mendukung rotasi).
    const { countWorkingDaysForEmployee } = await import("@/lib/services/shiftAssignmentService");

    if (existing.type === "annual") {
        if (data.status === "approved" || (existing.status === "approved" && (data.startDate || data.endDate))) {
            const oldDays = await countWorkingDaysForEmployee(
                prisma,
                existing.employeeId,
                toDateString(existing.startDate),
                toDateString(existing.endDate),
            );
            const newDays = await countWorkingDaysForEmployee(
                prisma,
                existing.employeeId,
                toDateString(data.startDate || existing.startDate),
                toDateString(data.endDate || existing.endDate),
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
                if (diff > 0 && (existing.employee.totalLeave - existing.employee.usedLeave) < diff) {
                    throw new Error(`Sisa cuti karyawan tidak mencukupi untuk persetujuan ini.`);
                }
                await prisma.employee.update({
                    where: { employeeId: existing.employeeId },
                    data: { usedLeave: { increment: diff } }
                });
            }
        } else if (existing.status === "approved" && data.status === "rejected") {
            // Reversing an approval
            const days = await countWorkingDaysForEmployee(
                prisma,
                existing.employeeId,
                toDateString(existing.startDate),
                toDateString(existing.endDate),
            );
            await prisma.employee.update({
                where: { employeeId: existing.employeeId },
                data: { usedLeave: { decrement: days } }
            });
        }
    }

    const row = await prisma.leaveRequest.update({
        where: { id },
        data: {
            ...(data.status !== undefined && { status: data.status }),
            ...(data.startDate !== undefined && { startDate: toUTCDateKey(startDate) }),
            ...(data.endDate !== undefined && { endDate: toUTCDateKey(endDate) }),
            ...(data.reason !== undefined && { reason: data.reason }),
        },
    });
    return toLeaveRequest(row);
}

function assertSupportedLeaveRange(startDate: string, endDate: string): void {
    const range = validateLeaveDateRange(startDate, endDate);
    if (!range.success) {
        throw new LeaveDateRangeError(range.message);
    }
}

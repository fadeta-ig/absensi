import { prisma } from "../prisma";
import { OvertimeRequest } from "@/types";
import { Prisma } from "@prisma/client";
import { toDateString, toTimeString } from "@/lib/utils";
import logger from "@/lib/logger";

import { calculateOvertimePay } from "./overtimeCalcService";

// ─── Date helpers imported from @/lib/utils ────────────────────

/** Tipe Prisma OvertimeRequest mentah tanpa relasi */
type PrismaOvertimeRow = Prisma.OvertimeRequestGetPayload<Record<string, never>>;

/** Tipe Prisma OvertimeRequest dengan relasi employee */
export type OvertimeRequestWithEmployee = Prisma.OvertimeRequestGetPayload<{
    include: { employee: { select: { name: true; employeeId: true } } };
}>;

function toOvertimeRequest(row: PrismaOvertimeRow): OvertimeRequest {
    return {
        id: row.id,
        employeeId: row.employeeId,
        date: toDateString(row.date),
        startTime: toTimeString(row.startTime),
        endTime: toTimeString(row.endTime),
        hours: row.hours,
        approvedHours: row.approvedHours ?? null,
        isHoliday: row.isHoliday,
        overtimePay: row.overtimePay,
        reason: row.reason,
        status: row.status as OvertimeRequest["status"],
        createdAt: toDateString(row.createdAt),
    };
}

// ─── Service Functions ────────────────────────────────────────

export async function getOvertimeRequests(employeeId?: string): Promise<(OvertimeRequest & { employee?: { name: string; employeeId: string } })[]> {
    const rows = await prisma.overtimeRequest.findMany({
        where: employeeId ? { employeeId } : undefined,
        include: {
            employee: {
                select: { name: true, employeeId: true },
            },
        },
        orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({ ...toOvertimeRequest(r), employee: r.employee }));
}

export async function getOvertimeRequestById(id: string): Promise<OvertimeRequest | undefined> {
    const row = await prisma.overtimeRequest.findUnique({ where: { id } });
    if (!row) return undefined;
    return toOvertimeRequest(row);
}

export async function createOvertimeRequest(data: Omit<OvertimeRequest, "id">): Promise<OvertimeRequest> {
    // startTime dan endTime dikirim sebagai "HH:MM" — gabung dengan date agar jadi DateTime valid
    const dateStr = data.date; // "YYYY-MM-DD"
    const startDateTime = new Date(`${dateStr}T${data.startTime}:00`);
    const endDateTime = new Date(`${dateStr}T${data.endTime}:00`);

    // Rollover check: jika jam selesai < jam mulai, asumsikan lewat tengah malam
    if (endDateTime < startDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1);
    }

    // Auto-calculate overtimePay berdasarkan basicSalary karyawan
    let overtimePay = 0;
    const employee = await prisma.employee.findUnique({
        where: { employeeId: data.employeeId },
        select: { basicSalary: true },
    });
    if (employee && employee.basicSalary > 0) {
        overtimePay = calculateOvertimePay({
            monthlySalary: employee.basicSalary,
            hours: data.hours,
            isHoliday: data.isHoliday ?? false,
        }).totalPay;
    }

    logger.info("Overtime request created", { employeeId: data.employeeId, hours: data.hours, overtimePay });

    const row = await prisma.overtimeRequest.create({
        data: {
            employeeId: data.employeeId,
            date: new Date(dateStr),
            startTime: startDateTime,
            endTime: endDateTime,
            hours: data.hours,
            isHoliday: data.isHoliday ?? false,
            overtimePay,
            reason: data.reason,
            status: data.status,
        },
    });
    return toOvertimeRequest(row);
}


export async function updateOvertimeRequest(id: string, data: Partial<OvertimeRequest> & Record<string, unknown>): Promise<OvertimeRequest | null> {
    try {
        // Ambil existing record untuk date + recalculate
        const existing = await prisma.overtimeRequest.findUnique({
            where: { id },
            include: { employee: { select: { basicSalary: true } } },
        });
        if (!existing) return null;

        const baseDateStr = data.date
            ? String(data.date)
            : toDateString(existing.date);

        // Recalculate overtimePay saat approved dan approvedHours berubah
        let recalculatedPay: number | undefined;
        if (data.status === "approved" && existing.employee.basicSalary > 0) {
            const finalHours = (data.approvedHours as number | undefined) ?? existing.hours;
            const finalIsHoliday = (data.isHoliday as boolean | undefined) ?? existing.isHoliday;
            recalculatedPay = calculateOvertimePay({
                monthlySalary: existing.employee.basicSalary,
                hours: finalHours,
                isHoliday: finalIsHoliday,
            }).totalPay;
        }

        const row = await prisma.overtimeRequest.update({
            where: { id },
            data: {
                ...(data.date !== undefined && { date: new Date(baseDateStr) }),
                ...(data.startTime !== undefined && { startTime: new Date(`${baseDateStr}T${data.startTime}:00`) }),
                ...(data.endTime !== undefined && { 
                    endTime: (() => {
                        const s = data.startTime ? new Date(`${baseDateStr}T${data.startTime}:00`) : existing.startTime;
                        const e = new Date(`${baseDateStr}T${data.endTime}:00`);
                        if (e < s) e.setDate(e.getDate() + 1);
                        return e;
                    })() 
                }),
                ...(data.hours !== undefined && { hours: data.hours }),
                ...(data.reason !== undefined && { reason: data.reason }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.approvedHours !== undefined && { approvedHours: data.approvedHours }),
                ...(data.isHoliday !== undefined && { isHoliday: data.isHoliday }),
                ...(recalculatedPay !== undefined ? { overtimePay: recalculatedPay } : (data.overtimePay !== undefined && { overtimePay: data.overtimePay })),
            },
        });
        return toOvertimeRequest(row);
    } catch (err) {
        logger.error("Gagal update overtime request", { id, error: err });
        return null;
    }
}


export async function deleteOvertimeRequest(id: string): Promise<boolean> {
    try {
        await prisma.overtimeRequest.delete({ where: { id } });
        return true;
    } catch (error) {
        logger.error("Gagal delete overtime request", { id, error });
        return false;
    }
}

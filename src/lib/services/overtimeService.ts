import { prisma } from "../prisma";
import { OvertimeRequest } from "@/types";
import { toDateString, toTimeString } from "@/lib/utils";

// ─── Date helpers imported from @/lib/utils ────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toOvertimeRequest(row: any): OvertimeRequest {
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

export async function getOvertimeRequests(employeeId?: string): Promise<any[]> {
    const rows = await prisma.overtimeRequest.findMany({
        where: employeeId ? { employeeId } : undefined,
        include: {
            employee: {
                select: { name: true, employeeId: true },
            },
        },
        orderBy: { createdAt: "desc" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({ ...toOvertimeRequest(r), employee: r.employee }));
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

    const row = await prisma.overtimeRequest.create({
        data: {
            employeeId: data.employeeId,
            date: new Date(dateStr),
            startTime: startDateTime,
            endTime: endDateTime,
            hours: data.hours,
            reason: data.reason,
            status: data.status,
            // createdAt: @default(now()) — tidak perlu diisi
        },
    });
    return toOvertimeRequest(row);
}


export async function updateOvertimeRequest(id: string, data: Partial<OvertimeRequest> & Record<string, unknown>): Promise<OvertimeRequest | null> {
    try {
        // Ambil existing record untuk tahu date jika diperlukan saat konversi startTime/endTime
        const existing = data.startTime !== undefined || data.endTime !== undefined
            ? await prisma.overtimeRequest.findUnique({ where: { id }, select: { date: true } })
            : null;

        const baseDateStr = data.date
            ? String(data.date)
            : existing?.date
                ? new Date(existing.date).toISOString().split("T")[0]
                : "";

        const row = await prisma.overtimeRequest.update({
            where: { id },
            data: {
                ...(data.date !== undefined && { date: new Date(baseDateStr) }),
                ...(data.startTime !== undefined && { startTime: new Date(`${baseDateStr}T${data.startTime}:00`) }),
                ...(data.endTime !== undefined && { endTime: new Date(`${baseDateStr}T${data.endTime}:00`) }),
                ...(data.hours !== undefined && { hours: data.hours }),
                ...(data.reason !== undefined && { reason: data.reason }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.approvedHours !== undefined && { approvedHours: data.approvedHours }),
                ...(data.isHoliday !== undefined && { isHoliday: data.isHoliday }),
                ...(data.overtimePay !== undefined && { overtimePay: data.overtimePay }),
            },
        });
        return toOvertimeRequest(row);
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

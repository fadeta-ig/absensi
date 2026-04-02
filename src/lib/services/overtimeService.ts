import { prisma } from "../prisma";
import { OvertimeRequest } from "@/types";

// ─── Helper: Date → string ────────────────────────────────────
const d2s = (d: Date | string | null | undefined): string => {
    if (!d) return "";
    return d instanceof Date ? d.toISOString().split("T")[0] : String(d);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toOvertimeRequest(row: any): OvertimeRequest {
    return {
        id: row.id,
        employeeId: row.employeeId,
        date: d2s(row.date),
        startTime: d2s(row.startTime),
        endTime: d2s(row.endTime),
        hours: row.hours,
        approvedHours: row.approvedHours ?? null,
        isHoliday: row.isHoliday,
        overtimePay: row.overtimePay,
        reason: row.reason,
        status: row.status as OvertimeRequest["status"],
        createdAt: d2s(row.createdAt),
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
    const row = await prisma.overtimeRequest.create({
        data: {
            employeeId: data.employeeId,
            date: new Date(data.date),
            startTime: new Date(data.startTime),
            endTime: new Date(data.endTime),
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
        const row = await prisma.overtimeRequest.update({
            where: { id },
            data: {
                ...(data.date !== undefined && { date: new Date(data.date as string) }),
                ...(data.startTime !== undefined && { startTime: new Date(data.startTime as string) }),
                ...(data.endTime !== undefined && { endTime: new Date(data.endTime as string) }),
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

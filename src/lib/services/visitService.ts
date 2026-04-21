import { prisma } from "../prisma";
import { VisitReport } from "@/types";
import { toDateString, toTimeString } from "@/lib/utils";

// ─── Employee include fragment ──────────────────────────────────
const employeeInclude = {
    employee: {
        select: {
            name: true,
            departmentRel: { select: { name: true } },
        },
    },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVisitReport(row: any): VisitReport {
    return {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: row.employee?.name ?? null,
        employeeDepartment: row.employee?.departmentRel?.name ?? null,
        date: toDateString(row.date),
        visitStartTime: row.visitStartTime ? toTimeString(row.visitStartTime) : null,
        visitEndTime: row.visitEndTime ? toTimeString(row.visitEndTime) : null,
        clientName: row.clientName,
        clientAddress: row.clientAddress,
        purpose: row.purpose,
        result: row.result ?? null,
        location: row.location
            ? (typeof row.location === "string" ? JSON.parse(row.location) : row.location)
            : null,
        photo: row.photo ?? null,
        status: row.status as VisitReport["status"],
        notes: row.notes ?? null,
        createdAt: toDateString(row.createdAt),
    };
}

// ─── Helpers ────────────────────────────────────────────────────

/** Convert "HH:MM" time string to a full DateTime (today's date + time) for DB storage */
function timeStringToDateTime(timeStr: string): Date {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const now = new Date();
    now.setHours(hours, minutes, 0, 0);
    return now;
}

// ─── Service Functions ────────────────────────────────────────

export async function getVisitReports(employeeId?: string): Promise<VisitReport[]> {
    const rows = await prisma.visitReport.findMany({
        where: employeeId ? { employeeId } : undefined,
        include: employeeInclude,
        orderBy: { createdAt: "desc" },
    });
    return rows.map(toVisitReport);
}

export async function getVisitReportById(id: string): Promise<VisitReport | undefined> {
    const row = await prisma.visitReport.findUnique({
        where: { id },
        include: employeeInclude,
    });
    if (!row) return undefined;
    return toVisitReport(row);
}

export async function createVisitReport(data: Omit<VisitReport, "id">): Promise<VisitReport> {
    const row = await prisma.visitReport.create({
        data: {
            employeeId: data.employeeId,
            date: new Date(data.date),
            visitStartTime: data.visitStartTime ? timeStringToDateTime(data.visitStartTime) : undefined,
            visitEndTime: data.visitEndTime ? timeStringToDateTime(data.visitEndTime) : undefined,
            clientName: data.clientName,
            clientAddress: data.clientAddress,
            purpose: data.purpose,
            result: data.result,
            location: data.location ? JSON.stringify(data.location) : undefined,
            photo: data.photo,
            status: data.status,
            notes: data.notes,
        },
        include: employeeInclude,
    });
    return toVisitReport(row);
}

export async function updateVisitReport(id: string, data: Partial<VisitReport>): Promise<VisitReport | null> {
    try {
        const row = await prisma.visitReport.update({
            where: { id },
            data: {
                ...(data.clientName !== undefined && { clientName: data.clientName }),
                ...(data.clientAddress !== undefined && { clientAddress: data.clientAddress }),
                ...(data.purpose !== undefined && { purpose: data.purpose }),
                ...(data.result !== undefined && { result: data.result }),
                ...(data.visitStartTime !== undefined && { visitStartTime: data.visitStartTime ? timeStringToDateTime(data.visitStartTime) : null }),
                ...(data.visitEndTime !== undefined && { visitEndTime: data.visitEndTime ? timeStringToDateTime(data.visitEndTime) : null }),
                ...(data.location !== undefined && { location: data.location ? JSON.stringify(data.location) : null }),
                ...(data.photo !== undefined && { photo: data.photo }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.notes !== undefined && { notes: data.notes }),
            },
            include: employeeInclude,
        });
        return toVisitReport(row);
    } catch {
        return null;
    }
}

export async function deleteVisitReport(id: string): Promise<boolean> {
    try {
        await prisma.visitReport.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}

import { prisma } from "../prisma";
import { VisitReport } from "@/types";

// ─── Helper: Date → string ────────────────────────────────────
const d2s = (d: Date | string | null | undefined): string => {
    if (!d) return "";
    return d instanceof Date ? d.toISOString().split("T")[0] : String(d);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVisitReport(row: any): VisitReport {
    return {
        id: row.id,
        employeeId: row.employeeId,
        date: d2s(row.date),
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
        createdAt: d2s(row.createdAt),
    };
}

// ─── Service Functions ────────────────────────────────────────

export async function getVisitReports(employeeId?: string): Promise<VisitReport[]> {
    const rows = await prisma.visitReport.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { createdAt: "desc" },
    });
    return rows.map(toVisitReport);
}

export async function getVisitReportById(id: string): Promise<VisitReport | undefined> {
    const row = await prisma.visitReport.findUnique({ where: { id } });
    if (!row) return undefined;
    return toVisitReport(row);
}

export async function createVisitReport(data: Omit<VisitReport, "id">): Promise<VisitReport> {
    const row = await prisma.visitReport.create({
        data: {
            employeeId: data.employeeId,
            date: new Date(data.date),
            clientName: data.clientName,
            clientAddress: data.clientAddress,
            purpose: data.purpose,
            result: data.result,
            location: data.location ? JSON.stringify(data.location) : undefined,
            photo: data.photo,
            status: data.status,
            notes: data.notes,
            // createdAt: @default(now()) — tidak perlu diisi
        },
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
                ...(data.location !== undefined && { location: data.location ? JSON.stringify(data.location) : null }),
                ...(data.photo !== undefined && { photo: data.photo }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.notes !== undefined && { notes: data.notes }),
            },
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

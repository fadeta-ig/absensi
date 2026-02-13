import { prisma } from "../prisma";
import { VisitReport } from "@/types";

export async function getVisitReports(employeeId?: string): Promise<VisitReport[]> {
    const rows = await prisma.visitReport.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { createdAt: "desc" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({
        ...r,
        location: r.location as VisitReport["location"],
        status: r.status as VisitReport["status"],
    })) as VisitReport[];
}

export async function getVisitReportById(id: string): Promise<VisitReport | undefined> {
    const row = await prisma.visitReport.findUnique({ where: { id } });
    if (!row) return undefined;
    return {
        ...row,
        location: row.location as VisitReport["location"],
        status: row.status as VisitReport["status"],
    } as VisitReport;
}

export async function createVisitReport(data: Omit<VisitReport, "id">): Promise<VisitReport> {
    const row = await prisma.visitReport.create({
        data: {
            employeeId: data.employeeId,
            date: data.date,
            clientName: data.clientName,
            clientAddress: data.clientAddress,
            purpose: data.purpose,
            result: data.result,
            location: data.location ? JSON.parse(JSON.stringify(data.location)) : undefined,
            photo: data.photo,
            status: data.status,
            notes: data.notes,
            createdAt: data.createdAt,
        },
    });
    return {
        ...row,
        location: row.location as VisitReport["location"],
        status: row.status as VisitReport["status"],
    } as VisitReport;
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
                ...(data.location !== undefined && { location: data.location ? JSON.parse(JSON.stringify(data.location)) : null }),
                ...(data.photo !== undefined && { photo: data.photo }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.notes !== undefined && { notes: data.notes }),
            },
        });
        return {
            ...row,
            location: row.location as VisitReport["location"],
            status: row.status as VisitReport["status"],
        } as VisitReport;
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

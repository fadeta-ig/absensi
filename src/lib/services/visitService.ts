import { prisma } from "../prisma";
import { VisitReport, VisitStatus } from "@/types";
import { toDateString } from "@/lib/utils";
import logger from "@/lib/logger";

// ─── Employee include fragment ──────────────────────────────────
const employeeInclude = {
    employee: {
        select: {
            name: true,
            departmentRel: { select: { name: true } },
        },
    },
} as const;

// ─── JSON Helpers ───────────────────────────────────────────────

function parseJsonField<T>(raw: string | null | undefined): T | null {
    if (!raw) return null;
    try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        return null;
    }
}

function toTimeDisplay(d: Date | string | null | undefined): string | null {
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVisitReport(row: any): VisitReport {
    return {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: row.employee?.name ?? null,
        employeeDepartment: row.employee?.departmentRel?.name ?? null,
        date: toDateString(row.date),
        clockInTime: toTimeDisplay(row.clockInTime),
        clockOutTime: toTimeDisplay(row.clockOutTime),
        clientName: row.clientName,
        clientAddress: row.clientAddress,
        purpose: row.purpose,
        result: row.result ?? null,
        visitLocation: parseJsonField<{ lat: number; lng: number }>(row.visitLocation),
        visitRadius: row.visitRadius ?? 300,
        clockInLocation: parseJsonField<{ lat: number; lng: number }>(row.clockInLocation),
        clockOutLocation: parseJsonField<{ lat: number; lng: number }>(row.clockOutLocation),
        clockInPhotos: parseJsonField<string[]>(row.clockInPhotos),
        clockOutPhotos: parseJsonField<string[]>(row.clockOutPhotos),
        status: row.status as VisitStatus,
        notes: row.notes ?? null,
        hrChecked: row.hrChecked ?? false,
        createdAt: toDateString(row.createdAt),
    };
}

// ─── Query Functions ────────────────────────────────────────────

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

// ─── Draft CRUD ─────────────────────────────────────────────────

interface CreateDraftInput {
    employeeId: string;
    clientName: string;
    clientAddress: string;
    purpose: string;
    visitLocation: { lat: number; lng: number };
    visitRadius?: number;
    notes?: string | null;
}

export async function createVisitDraft(data: CreateDraftInput): Promise<VisitReport> {
    const row = await prisma.visitReport.create({
        data: {
            employeeId: data.employeeId,
            date: new Date(),
            clientName: data.clientName,
            clientAddress: data.clientAddress,
            purpose: data.purpose,
            visitLocation: JSON.stringify(data.visitLocation),
            visitRadius: data.visitRadius ?? 300,
            notes: data.notes ?? null,
            status: "draft",
        },
        include: employeeInclude,
    });
    return toVisitReport(row);
}

interface UpdateDraftInput {
    clientName?: string;
    clientAddress?: string;
    purpose?: string;
    visitLocation?: { lat: number; lng: number };
    visitRadius?: number;
    notes?: string | null;
}

export async function updateVisitDraft(id: string, data: UpdateDraftInput): Promise<VisitReport | null> {
    try {
        const existing = await prisma.visitReport.findUnique({ where: { id }, select: { status: true } });
        if (!existing || existing.status !== "draft") {
            logger.warn("Attempted to update non-draft visit", { id, currentStatus: existing?.status });
            return null;
        }

        const row = await prisma.visitReport.update({
            where: { id },
            data: {
                ...(data.clientName !== undefined && { clientName: data.clientName }),
                ...(data.clientAddress !== undefined && { clientAddress: data.clientAddress }),
                ...(data.purpose !== undefined && { purpose: data.purpose }),
                ...(data.visitLocation !== undefined && { visitLocation: JSON.stringify(data.visitLocation) }),
                ...(data.visitRadius !== undefined && { visitRadius: data.visitRadius }),
                ...(data.notes !== undefined && { notes: data.notes }),
            },
            include: employeeInclude,
        });
        return toVisitReport(row);
    } catch (error) {
        logger.error("Failed to update visit draft", { id, error });
        return null;
    }
}

// ─── Clock In ───────────────────────────────────────────────────

interface ClockInInput {
    location: { lat: number; lng: number };
    photos: string[];
}

export async function clockInVisit(id: string, data: ClockInInput): Promise<VisitReport | null> {
    try {
        const existing = await prisma.visitReport.findUnique({
            where: { id },
            select: { status: true, visitLocation: true, visitRadius: true },
        });

        if (!existing || existing.status !== "draft") {
            logger.warn("Clock in failed: invalid status", { id, currentStatus: existing?.status });
            return null;
        }

        const row = await prisma.visitReport.update({
            where: { id },
            data: {
                clockInTime: new Date(),
                clockInLocation: JSON.stringify(data.location),
                clockInPhotos: JSON.stringify(data.photos),
                status: "clocked_in",
            },
            include: employeeInclude,
        });
        return toVisitReport(row);
    } catch (error) {
        logger.error("Failed to clock in visit", { id, error });
        return null;
    }
}

// ─── Clock Out ──────────────────────────────────────────────────

interface ClockOutInput {
    location: { lat: number; lng: number };
    photos: string[];
    result?: string | null;
}

export async function clockOutVisit(id: string, data: ClockOutInput): Promise<VisitReport | null> {
    try {
        const existing = await prisma.visitReport.findUnique({
            where: { id },
            select: { status: true, visitLocation: true, visitRadius: true },
        });

        if (!existing || existing.status !== "clocked_in") {
            logger.warn("Clock out failed: invalid status", { id, currentStatus: existing?.status });
            return null;
        }

        const row = await prisma.visitReport.update({
            where: { id },
            data: {
                clockOutTime: new Date(),
                clockOutLocation: JSON.stringify(data.location),
                clockOutPhotos: JSON.stringify(data.photos),
                result: data.result ?? null,
                status: "clocked_out",
            },
            include: employeeInclude,
        });
        return toVisitReport(row);
    } catch (error) {
        logger.error("Failed to clock out visit", { id, error });
        return null;
    }
}

// ─── HR Verification ──────────────────────────────────────────────

export async function verifyVisit(id: string, isChecked: boolean): Promise<VisitReport | null> {
    try {
        const existing = await prisma.visitReport.findUnique({
            where: { id },
            select: { status: true },
        });

        if (!existing || existing.status !== "clocked_out") {
            logger.warn("Verify failed: invalid status", { id, currentStatus: existing?.status });
            return null;
        }

        const row = await prisma.visitReport.update({
            where: { id },
            data: { hrChecked: isChecked },
            include: employeeInclude,
        });
        return toVisitReport(row);
    } catch (error) {
        logger.error("Failed to verify visit", { id, error });
        return null;
    }
}

// ─── Delete (Draft only) ────────────────────────────────────────

export async function deleteVisitReport(id: string): Promise<boolean> {
    try {
        const existing = await prisma.visitReport.findUnique({
            where: { id },
            select: { status: true },
        });

        if (!existing || existing.status !== "draft") {
            logger.warn("Delete failed: can only delete drafts", { id, currentStatus: existing?.status });
            return false;
        }

        await prisma.visitReport.delete({ where: { id } });
        return true;
    } catch (error) {
        logger.error("Failed to delete visit report", { id, error });
        return false;
    }
}

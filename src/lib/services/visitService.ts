import { prisma } from "../prisma";
import {
    VisitPhoto,
    VisitPhotoCategory,
    VisitPhotoDraft,
    VisitPhotoPhase,
    VisitReport,
    VisitStatus,
} from "@/types";
import { calculateDistance, toDateString } from "@/lib/utils";
import logger from "@/lib/logger";
import {
    prepareVisitPhotos,
    VisitPhotoLocationEvidence,
    VisitPhotoValidationError,
} from "@/lib/services/visitPhotoService";

// ─── Employee include fragment ──────────────────────────────────
const employeeInclude = {
    employee: {
        select: {
            name: true,
            departmentRel: { select: { name: true } },
        },
    },
    photos: {
        orderBy: { sequence: "asc" as const },
    },
} as const;

// ─── JSON Helpers ───────────────────────────────────────────────

function parseJsonField<T>(raw: string | null | undefined, context: Record<string, unknown>): T | null {
    if (!raw) return null;
    try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (error) {
        logger.warn("Stored visit JSON parse failed", {
            ...context,
            error,
        });
        return null;
    }
}

function toTimeDisplay(d: Date | string | null | undefined): string | null {
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVisitPhoto(row: any): VisitPhoto {
    const id = String(row.id);
    return {
        id,
        phase: row.phase as VisitPhotoPhase,
        sequence: row.sequence,
        category: row.category as VisitPhotoCategory,
        caption: row.caption ?? null,
        capturedAtDevice: row.capturedAtDevice instanceof Date
            ? row.capturedAtDevice.toISOString()
            : row.capturedAtDevice
                ? new Date(row.capturedAtDevice).toISOString()
                : null,
        receivedAtServer: new Date(row.receivedAtServer).toISOString(),
        officialTimestamp: new Date(row.officialTimestamp).toISOString(),
        latitude: row.latitude,
        longitude: row.longitude,
        accuracyMeters: row.accuracyMeters ?? null,
        distanceToTargetMeters: row.distanceToTargetMeters ?? null,
        sha256Original: row.sha256Original,
        mimeType: row.mimeType,
        fileSize: row.fileSize,
        width: row.width,
        height: row.height,
        overlayVersion: row.overlayVersion,
        stampedUrl: `/api/visits/photos/${encodeURIComponent(id)}?variant=stamped`,
        originalUrl: `/api/visits/photos/${encodeURIComponent(id)}?variant=original`,
    };
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
        visitLocation: parseJsonField<{ lat: number; lng: number }>(row.visitLocation, { field: "visitLocation", id: row.id, employeeId: row.employeeId }),
        visitRadius: row.visitRadius ?? 300,
        clockInLocation: parseJsonField<{ lat: number; lng: number }>(row.clockInLocation, { field: "clockInLocation", id: row.id, employeeId: row.employeeId }),
        clockOutLocation: parseJsonField<{ lat: number; lng: number }>(row.clockOutLocation, { field: "clockOutLocation", id: row.id, employeeId: row.employeeId }),
        clockInPhotos: parseJsonField<string[]>(row.clockInPhotos, { field: "clockInPhotos", id: row.id, employeeId: row.employeeId }),
        clockOutPhotos: parseJsonField<string[]>(row.clockOutPhotos, { field: "clockOutPhotos", id: row.id, employeeId: row.employeeId }),
        photos: Array.isArray(row.photos) ? row.photos.map(toVisitPhoto) : [],
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
}

// ─── Clock In ───────────────────────────────────────────────────

interface ClockInInput {
    location: VisitPhotoLocationEvidence;
    photos: VisitPhotoDraft[];
}

class VisitTransitionConflictError extends Error {}

export async function clockInVisit(id: string, data: ClockInInput): Promise<VisitReport | null> {
    let prepared: Awaited<ReturnType<typeof prepareVisitPhotos>> | null = null;
    try {
        const existing = await prisma.visitReport.findUnique({
            where: { id },
            select: {
                employeeId: true,
                status: true,
                visitLocation: true,
                visitRadius: true,
                clientName: true,
            },
        });

        if (!existing || existing.status !== "draft") {
            logger.warn("Clock in failed: invalid status", { id, currentStatus: existing?.status });
            return null;
        }

        const officialTimestamp = new Date();
        const target = parseJsonField<{ lat: number; lng: number }>(existing.visitLocation, { field: "visitLocation", id, employeeId: existing.employeeId });
        const distanceToTargetMeters = target
            ? calculateDistance(data.location.lat, data.location.lng, target.lat, target.lng)
            : null;
        prepared = await prepareVisitPhotos({
            visitId: id,
            clientName: existing.clientName,
            phase: "CLOCK_IN",
            officialTimestamp,
            photos: data.photos,
            location: data.location,
            distanceToTargetMeters,
        });

        const row = await prisma.$transaction(async (tx) => {
            const updated = await tx.visitReport.updateMany({
                where: { id, status: "draft" },
                data: {
                    clockInTime: officialTimestamp,
                    clockInLocation: JSON.stringify(data.location),
                    status: "clocked_in",
                },
            });
            if (updated.count !== 1) throw new VisitTransitionConflictError();
            await tx.visitPhoto.createMany({ data: prepared!.records });
            return tx.visitReport.findUniqueOrThrow({
                where: { id },
                include: employeeInclude,
            });
        });
        prepared = null;
        return toVisitReport(row);
    } catch (error) {
        if (prepared) await prepared.cleanup();
        if (error instanceof VisitPhotoValidationError) throw error;
        if (error instanceof VisitTransitionConflictError) {
            logger.warn("Clock in failed: concurrent status transition", { id });
            return null;
        }
        throw error;
    }
}

// ─── Clock Out ──────────────────────────────────────────────────

interface ClockOutInput {
    location: VisitPhotoLocationEvidence;
    photos: VisitPhotoDraft[];
    result?: string | null;
}

export async function clockOutVisit(id: string, data: ClockOutInput): Promise<VisitReport | null> {
    let prepared: Awaited<ReturnType<typeof prepareVisitPhotos>> | null = null;
    try {
        const existing = await prisma.visitReport.findUnique({
            where: { id },
            select: {
                employeeId: true,
                status: true,
                visitLocation: true,
                visitRadius: true,
                clientName: true,
            },
        });

        if (!existing || existing.status !== "clocked_in") {
            logger.warn("Clock out failed: invalid status", { id, currentStatus: existing?.status });
            return null;
        }

        const officialTimestamp = new Date();
        const target = parseJsonField<{ lat: number; lng: number }>(existing.visitLocation, { field: "visitLocation", id, employeeId: existing.employeeId });
        const distanceToTargetMeters = target
            ? calculateDistance(data.location.lat, data.location.lng, target.lat, target.lng)
            : null;
        prepared = await prepareVisitPhotos({
            visitId: id,
            clientName: existing.clientName,
            phase: "CLOCK_OUT",
            officialTimestamp,
            photos: data.photos,
            location: data.location,
            distanceToTargetMeters,
        });

        const row = await prisma.$transaction(async (tx) => {
            const updated = await tx.visitReport.updateMany({
                where: { id, status: "clocked_in" },
                data: {
                    clockOutTime: officialTimestamp,
                    clockOutLocation: JSON.stringify(data.location),
                    result: data.result ?? null,
                    status: "clocked_out",
                },
            });
            if (updated.count !== 1) throw new VisitTransitionConflictError();
            await tx.visitPhoto.createMany({ data: prepared!.records });
            return tx.visitReport.findUniqueOrThrow({
                where: { id },
                include: employeeInclude,
            });
        });
        prepared = null;
        return toVisitReport(row);
    } catch (error) {
        if (prepared) await prepared.cleanup();
        if (error instanceof VisitPhotoValidationError) throw error;
        if (error instanceof VisitTransitionConflictError) {
            logger.warn("Clock out failed: concurrent status transition", { id });
            return null;
        }
        throw error;
    }
}

// ─── HR Verification ──────────────────────────────────────────────

export async function verifyVisit(id: string, isChecked: boolean): Promise<VisitReport | null> {
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
}

// ─── Delete (Draft only) ────────────────────────────────────────

export async function deleteVisitReport(id: string): Promise<boolean> {
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
}

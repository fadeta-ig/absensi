import { prisma } from "@/lib/prisma";
import { toWIBDateString } from "@/lib/timezone";
import { PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import type { AuditActor } from "@/lib/services/auditService";
import type { SessionPayload } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import logger from "@/lib/logger";

type TxClient = Prisma.TransactionClient;

// ─── Error ────────────────────────────────────────────────────

export class CleaningError extends Error {
    constructor(message: string, public statusCode: number = 400) {
        super(message);
        this.name = "CleaningError";
    }
}

// ─── Name normalization ───────────────────────────────────────

export function normalizeName(raw: string): string {
    return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

// ─── WIG002 authorization ─────────────────────────────────────

export function isWig002(session: SessionPayload): boolean {
    return session.username === "WIG002" && session.permissions.includes(PERMISSIONS.GA_MANAGE);
}

function requireWig002(session: SessionPayload): void {
    if (!isWig002(session)) {
        throw new CleaningError("Hanya WIG002 dengan ga.manage yang dapat mengelola kebersihan.", 403);
    }
}

// ─── Worker authorization ─────────────────────────────────────

function requireCleaningWorker(session: SessionPayload): void {
    if (
        !session.roles.includes(SYSTEM_ROLES.CLEANING_WORKER) ||
        !session.permissions.includes(PERMISSIONS.CLEANING_EXECUTE)
    ) {
        throw new CleaningError("Anda tidak memiliki akses petugas kebersihan.", 403);
    }
}

// ─── WIB date capture ─────────────────────────────────────────

function captureWibDate(): string {
    return toWIBDateString(new Date());
}

function nextWibDate(today: string): string {
    const d = new Date(today + "T00:00:00+07:00");
    d.setDate(d.getDate() + 1);
    return toWIBDateString(d);
}

// ─── Assignment interval helpers ──────────────────────────────

/** Check if an assignment is effective (active) on a given WIB date. */
function isEffectiveOnDate(assignment: { startsOnWibDate: string; endsOnWibDate: string | null }, wibDate: string): boolean {
    return assignment.startsOnWibDate <= wibDate && (assignment.endsOnWibDate === null || assignment.endsOnWibDate > wibDate);
}

/** Prisma where clause fragment for assignments effective on a given WIB date. */
function effectiveOnDateWhere(wibDate: string) {
    return {
        startsOnWibDate: { lte: wibDate },
        OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: wibDate } }],
    };
}

/** Check for overlapping assignment intervals for a room+user pair. Excludes a specific assignment ID if provided. */
async function hasOverlappingAssignment(
    tx: TxClient,
    roomId: string,
    userId: string,
    startsOn: string,
    endsOn: string | null,
    excludeId?: string
): Promise<boolean> {
    // Two intervals [s1, e1) and [s2, e2) overlap if s1 < e2 AND s2 < e1
    // With null meaning infinity: null end means always overlaps with any start after it
    const where: Prisma.CleaningWorkerAssignmentWhereInput = {
        roomId,
        userId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        // Existing interval starts before new interval ends (or new has no end)
        ...(endsOn ? { startsOnWibDate: { lt: endsOn } } : {}),
        // Existing interval ends after new interval starts (or existing has no end)
        OR: [
            { endsOnWibDate: null },
            { endsOnWibDate: { gt: startsOn } },
        ],
    };
    const count = await tx.cleaningWorkerAssignment.count({ where });
    return count > 0;
}

// ─── CLEANING_WORKER role sync ────────────────────────────────

/** Add or remove the CLEANING_WORKER role based on effective assignments for a given WIB date. */
export async function syncCleaningWorkerRole(tx: TxClient, userId: string, wibToday: string) {
    const effectiveCount = await tx.cleaningWorkerAssignment.count({
        where: {
            userId,
            ...effectiveOnDateWhere(wibToday),
        },
    });
    const cleaningRole = await tx.role.findUnique({ where: { code: SYSTEM_ROLES.CLEANING_WORKER } });
    if (!cleaningRole) {
        logger.error("[CleaningService] CLEANING_WORKER role not found in database. Run seed.");
        throw new CleaningError("Role CLEANING_WORKER tidak ditemukan. Jalankan seed terlebih dahulu.", 500);
    }

    const existingAssignment = await tx.userRoleAssignment.findFirst({
        where: { userId, roleId: cleaningRole.id },
    });

    if (effectiveCount > 0 && !existingAssignment) {
        await tx.userRoleAssignment.create({ data: { userId, roleId: cleaningRole.id } });
        await tx.userAccount.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    } else if (effectiveCount === 0 && existingAssignment) {
        await tx.userRoleAssignment.delete({
            where: { userId_roleId: { userId, roleId: cleaningRole.id } },
        });
        await tx.userAccount.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    }
}

// ─── Eligibility checks ──────────────────────────────────────

const EXCLUDED_ASSIGNMENT_ROLES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.HR_ADMIN, SYSTEM_ROLES.GA_ADMIN] as string[];

async function validateEligibility(tx: TxClient, userId: string, workerType: "INTERNAL" | "OUTSOURCE", currentSessionUserId: string) {
    const user = await tx.userAccount.findUnique({
        where: { id: userId },
        include: {
            employee: { select: { isActive: true } },
            roles: { select: { role: { select: { code: true } } } },
        },
    });
    if (!user || !user.isActive) throw new CleaningError("Akun pengguna tidak valid atau sudah tidak aktif.", 422);

    // WIG002 may not assign itself or accounts with admin roles
    if (userId === currentSessionUserId) {
        throw new CleaningError("Tidak dapat menugaskan akun WIG002 sendiri.", 422);
    }
    const userRoles = user.roles.map((r) => r.role.code);
    if (userRoles.some((r) => EXCLUDED_ASSIGNMENT_ROLES.includes(r))) {
        throw new CleaningError("Akun dengan role admin tidak dapat ditugaskan sebagai petugas kebersihan.", 422);
    }

    if (workerType === "INTERNAL") {
        if (!user.employeeId || !user.employee?.isActive) {
            throw new CleaningError("Petugas internal harus memiliki employee aktif.", 422);
        }
    } else {
        if (user.employeeId) {
            throw new CleaningError("Petugas outsource tidak boleh terhubung ke employee.", 422);
        }
    }
}

// ─── Template management (WIG002) ─────────────────────────────

export async function getTemplates() {
    return prisma.cleaningTemplate.findMany({
        include: { items: { orderBy: { sortOrder: "asc" } }, _count: { select: { rooms: true } } },
        orderBy: { name: "asc" },
    });
}

export async function createTemplate(session: SessionPayload, data: { name: string }) {
    requireWig002(session);
    const nameNormalized = normalizeName(data.name);
    if (!nameNormalized) throw new CleaningError("Nama template tidak boleh kosong.");

    const existing = await prisma.cleaningTemplate.findUnique({ where: { nameNormalized } });
    if (existing) throw new CleaningError("Template dengan nama tersebut sudah ada.", 409);

    const template = await prisma.cleaningTemplate.create({
        data: { name: data.name.trim(), nameNormalized },
    });

    await logAction("CREATE_CLEANING_TEMPLATE", "CLEANING_TEMPLATE", actorFromSession(session), template.id, { name: template.name });
    return template;
}

export async function updateTemplate(session: SessionPayload, id: string, data: { name?: string; isActive?: boolean }) {
    requireWig002(session);
    const template = await prisma.cleaningTemplate.findUnique({ where: { id }, include: { _count: { select: { rooms: { where: { isActive: true } } } } } });
    if (!template) throw new CleaningError("Template tidak ditemukan.", 404);

    if (data.isActive === false && template._count.rooms > 0) {
        throw new CleaningError("Template masih digunakan oleh ruangan aktif. Nonaktifkan atau ganti template ruangan terlebih dahulu.", 422);
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
        const nameNormalized = normalizeName(data.name);
        if (!nameNormalized) throw new CleaningError("Nama template tidak boleh kosong.");
        const dup = await prisma.cleaningTemplate.findUnique({ where: { nameNormalized } });
        if (dup && dup.id !== id) throw new CleaningError("Template dengan nama tersebut sudah ada.", 409);
        updateData.name = data.name.trim();
        updateData.nameNormalized = nameNormalized;
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.cleaningTemplate.update({ where: { id }, data: updateData });
    await logAction("UPDATE_CLEANING_TEMPLATE", "CLEANING_TEMPLATE", actorFromSession(session), id, { changes: data });
    return updated;
}

// ─── Template item management (WIG002) ────────────────────────

export async function getTemplateItems(templateId: string) {
    return prisma.cleaningTemplateItem.findMany({
        where: { templateId },
        orderBy: { sortOrder: "asc" },
    });
}

export async function createTemplateItem(session: SessionPayload, data: { templateId: string; name: string; sortOrder?: number }) {
    requireWig002(session);
    const template = await prisma.cleaningTemplate.findUnique({ where: { id: data.templateId } });
    if (!template) throw new CleaningError("Template tidak ditemukan.", 404);

    const nameNormalized = normalizeName(data.name);
    if (!nameNormalized) throw new CleaningError("Nama item tidak boleh kosong.");

    const existing = await prisma.cleaningTemplateItem.findUnique({
        where: { templateId_nameNormalized: { templateId: data.templateId, nameNormalized } },
    });
    if (existing) throw new CleaningError("Item dengan nama tersebut sudah ada dalam template ini.", 409);

    const sortOrder = data.sortOrder ?? ((await prisma.cleaningTemplateItem.count({ where: { templateId: data.templateId } })) + 1);

    const item = await prisma.cleaningTemplateItem.create({
        data: {
            templateId: data.templateId,
            name: data.name.trim(),
            nameNormalized,
            sortOrder,
        },
    });

    await logAction("CREATE_CLEANING_TEMPLATE_ITEM", "CLEANING_TEMPLATE_ITEM", actorFromSession(session), item.id, { templateId: data.templateId, name: item.name });
    return item;
}

export async function updateTemplateItem(session: SessionPayload, id: string, data: { name?: string; sortOrder?: number; isActive?: boolean }) {
    requireWig002(session);
    const item = await prisma.cleaningTemplateItem.findUnique({ where: { id } });
    if (!item) throw new CleaningError("Item template tidak ditemukan.", 404);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
        const nameNormalized = normalizeName(data.name);
        if (!nameNormalized) throw new CleaningError("Nama item tidak boleh kosong.");
        const dup = await prisma.cleaningTemplateItem.findUnique({
            where: { templateId_nameNormalized: { templateId: item.templateId, nameNormalized } },
        });
        if (dup && dup.id !== id) throw new CleaningError("Item dengan nama tersebut sudah ada dalam template ini.", 409);
        updateData.name = data.name.trim();
        updateData.nameNormalized = nameNormalized;
    }
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.cleaningTemplateItem.update({ where: { id }, data: updateData });
    await logAction("UPDATE_CLEANING_TEMPLATE_ITEM", "CLEANING_TEMPLATE_ITEM", actorFromSession(session), id, { changes: data });
    return updated;
}

// ─── Room management (WIG002) ─────────────────────────────────

export async function getRooms(session: SessionPayload) {
    requireWig002(session);
    const wibToday = captureWibDate();
    return prisma.cleaningRoom.findMany({
        include: {
            template: { select: { id: true, name: true } },
            assignments: {
                where: effectiveOnDateWhere(wibToday),
                include: { user: { select: { id: true, username: true, displayName: true } } },
            },
            _count: { select: { checklists: true } },
        },
        orderBy: { name: "asc" },
    });
}

export async function createRoom(session: SessionPayload, data: { name: string; templateId: string }) {
    requireWig002(session);
    const nameNormalized = normalizeName(data.name);
    if (!nameNormalized) throw new CleaningError("Nama ruangan tidak boleh kosong.");

    const existing = await prisma.cleaningRoom.findUnique({ where: { nameNormalized } });
    if (existing) throw new CleaningError("Ruangan dengan nama tersebut sudah ada.", 409);

    const template = await prisma.cleaningTemplate.findUnique({ where: { id: data.templateId } });
    if (!template || !template.isActive) throw new CleaningError("Template tidak valid atau sudah tidak aktif.", 422);

    const room = await prisma.cleaningRoom.create({
        data: { name: data.name.trim(), nameNormalized, templateId: data.templateId },
    });

    await logAction("CREATE_CLEANING_ROOM", "CLEANING_ROOM", actorFromSession(session), room.id, { name: room.name, templateId: data.templateId });
    return room;
}

export async function updateRoom(session: SessionPayload, id: string, data: { name?: string; templateId?: string; isActive?: boolean }) {
    requireWig002(session);
    const room = await prisma.cleaningRoom.findUnique({ where: { id } });
    if (!room) throw new CleaningError("Ruangan tidak ditemukan.", 404);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
        const nameNormalized = normalizeName(data.name);
        if (!nameNormalized) throw new CleaningError("Nama ruangan tidak boleh kosong.");
        const dup = await prisma.cleaningRoom.findUnique({ where: { nameNormalized } });
        if (dup && dup.id !== id) throw new CleaningError("Ruangan dengan nama tersebut sudah ada.", 409);
        updateData.name = data.name.trim();
        updateData.nameNormalized = nameNormalized;
    }
    if (data.templateId !== undefined) {
        const template = await prisma.cleaningTemplate.findUnique({ where: { id: data.templateId } });
        if (!template || !template.isActive) throw new CleaningError("Template tidak valid atau sudah tidak aktif.", 422);
        updateData.templateId = data.templateId;
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.cleaningRoom.update({ where: { id }, data: updateData });
    await logAction("UPDATE_CLEANING_ROOM", "CLEANING_ROOM", actorFromSession(session), id, { changes: data });
    return updated;
}

// ─── Assignment management (WIG002) ───────────────────────────

export async function getAssignments(
    session: SessionPayload,
    filters?: { roomId?: string; workerType?: "INTERNAL" | "OUTSOURCE"; includeInactive?: boolean }
) {
    requireWig002(session);
    const wibToday = captureWibDate();

    const where: Prisma.CleaningWorkerAssignmentWhereInput = {};
    if (filters?.roomId) where.roomId = filters.roomId;
    if (filters?.workerType) where.workerType = filters.workerType;
    if (!filters?.includeInactive) {
        // Only show currently effective assignments
        Object.assign(where, effectiveOnDateWhere(wibToday));
    }

    const assignments = await prisma.cleaningWorkerAssignment.findMany({
        where,
        include: {
            room: { select: { id: true, name: true } },
            user: { select: { id: true, username: true, displayName: true, employeeId: true } },
        },
        orderBy: { createdAt: "desc" },
    });

    return assignments.map((a) => ({
        ...a,
        isEffective: isEffectiveOnDate(a, wibToday),
    }));
}

export type CreateAssignmentInput = {
    roomId: string;
    userId: string;
    workerType: "INTERNAL" | "OUTSOURCE";
    applyToToday?: boolean;
};

export async function createAssignment(session: SessionPayload, data: CreateAssignmentInput) {
    requireWig002(session);
    const wibToday = captureWibDate();
    const startsOn = data.applyToToday ? wibToday : nextWibDate(wibToday);

    const room = await prisma.cleaningRoom.findUnique({ where: { id: data.roomId } });
    if (!room || !room.isActive) throw new CleaningError("Ruangan tidak valid atau sudah tidak aktif.", 422);

    await validateEligibility(prisma as unknown as TxClient, data.userId, data.workerType, session.userId);

    const result = await prisma.$transaction(async (tx) => {
        // Check for overlapping assignment
        const overlaps = await hasOverlappingAssignment(tx, data.roomId, data.userId, startsOn, null);
        if (overlaps) {
            throw new CleaningError("Penugasan aktif untuk akun dan ruangan tersebut sudah ada atau periodenya tumpang tindih.", 409);
        }

        const assignment = await tx.cleaningWorkerAssignment.create({
            data: {
                roomId: data.roomId,
                userId: data.userId,
                workerType: data.workerType,
                startsOnWibDate: startsOn,
            },
        });

        await syncCleaningWorkerRole(tx, data.userId, wibToday);
        return assignment;
    });

    await logAction("CREATE_CLEANING_ASSIGNMENT", "CLEANING_WORKER_ASSIGNMENT", actorFromSession(session), result.id, {
        roomId: data.roomId,
        userId: data.userId,
        workerType: data.workerType,
        applyToToday: data.applyToToday,
        startsOnWibDate: startsOn,
    });
    return result;
}

export type EndAssignmentInput = {
    assignmentId: string;
    applyToToday?: boolean;
    reason: string;
};

export async function endAssignment(session: SessionPayload, data: EndAssignmentInput) {
    requireWig002(session);
    const wibToday = captureWibDate();
    const endsOn = data.applyToToday ? wibToday : nextWibDate(wibToday);

    const result = await prisma.$transaction(async (tx) => {
        const assignment = await tx.cleaningWorkerAssignment.findUnique({ where: { id: data.assignmentId } });
        if (!assignment) throw new CleaningError("Penugasan tidak ditemukan.", 404);
        if (assignment.endsOnWibDate !== null) throw new CleaningError("Penugasan sudah diakhiri.", 409);
        if (!isEffectiveOnDate(assignment, wibToday) && assignment.startsOnWibDate > wibToday) {
            // Planned assignment: end before it starts
        }

        const ended = await tx.cleaningWorkerAssignment.update({
            where: { id: assignment.id },
            data: { endsOnWibDate: endsOn },
        });

        await syncCleaningWorkerRole(tx, assignment.userId, wibToday);
        return ended;
    });

    await logAction("END_CLEANING_ASSIGNMENT", "CLEANING_WORKER_ASSIGNMENT", actorFromSession(session), result.id, {
        roomId: result.roomId,
        userId: result.userId,
        endsOnWibDate: endsOn,
        applyToToday: data.applyToToday,
        reason: data.reason,
    });
    return result;
}

export type ReplaceAssignmentInput = {
    assignmentId: string;
    newUserId: string;
    newWorkerType: "INTERNAL" | "OUTSOURCE";
    applyToToday?: boolean;
    reason: string;
};

export async function replaceAssignment(session: SessionPayload, data: ReplaceAssignmentInput) {
    requireWig002(session);
    const wibToday = captureWibDate();
    const effectiveDate = data.applyToToday ? wibToday : nextWibDate(wibToday);

    await validateEligibility(prisma as unknown as TxClient, data.newUserId, data.newWorkerType, session.userId);

    const result = await prisma.$transaction(async (tx) => {
        const oldAssignment = await tx.cleaningWorkerAssignment.findUnique({ where: { id: data.assignmentId } });
        if (!oldAssignment) throw new CleaningError("Penugasan tidak ditemukan.", 404);
        if (oldAssignment.endsOnWibDate !== null) throw new CleaningError("Penugasan sudah diakhiri.", 409);

        // End the old assignment
        const ended = await tx.cleaningWorkerAssignment.update({
            where: { id: oldAssignment.id },
            data: { endsOnWibDate: effectiveDate },
        });

        // Check for overlaps on the new assignment
        const overlaps = await hasOverlappingAssignment(tx, oldAssignment.roomId, data.newUserId, effectiveDate, null);
        if (overlaps) {
            throw new CleaningError("Petugas pengganti sudah memiliki penugasan aktif atau periodenya tumpang tindih di ruangan ini.", 409);
        }

        // Create the new assignment
        const newAssignment = await tx.cleaningWorkerAssignment.create({
            data: {
                roomId: oldAssignment.roomId,
                userId: data.newUserId,
                workerType: data.newWorkerType,
                startsOnWibDate: effectiveDate,
            },
        });

        // Sync roles for both old and new user
        await syncCleaningWorkerRole(tx, oldAssignment.userId, wibToday);
        await syncCleaningWorkerRole(tx, data.newUserId, wibToday);

        return { ended, newAssignment };
    });

    await logAction("REPLACE_CLEANING_ASSIGNMENT", "CLEANING_WORKER_ASSIGNMENT", actorFromSession(session), result.newAssignment.id, {
        oldAssignmentId: data.assignmentId,
        newUserId: data.newUserId,
        newWorkerType: data.newWorkerType,
        applyToToday: data.applyToToday,
        effectiveDate,
        reason: data.reason,
    });
    return result;
}

// ─── Available users for assignment (WIG002) ──────────────────

export async function getAvailableUsersForAssignment(session: SessionPayload, workerType: "INTERNAL" | "OUTSOURCE") {
    requireWig002(session);

    if (workerType === "INTERNAL") {
        return prisma.userAccount.findMany({
            where: {
                isActive: true,
                employeeId: { not: null },
                employee: { isActive: true },
                // Exclude admin roles and current WIG002
                id: { not: session.userId },
                roles: {
                    none: {
                        role: { code: { in: EXCLUDED_ASSIGNMENT_ROLES } },
                    },
                },
            },
            select: {
                id: true,
                username: true,
                displayName: true,
                employeeId: true,
                employee: { select: { name: true } },
            },
            orderBy: { displayName: "asc" },
        });
    }

    // OUTSOURCE: active accounts without employee relation
    return prisma.userAccount.findMany({
        where: {
            isActive: true,
            employeeId: null,
            id: { not: session.userId },
            roles: {
                none: {
                    role: { code: { in: EXCLUDED_ASSIGNMENT_ROLES } },
                },
            },
        },
        select: {
            id: true,
            username: true,
            displayName: true,
            employeeId: true,
        },
        orderBy: { displayName: "asc" },
    });
}

// ─── Automatic revocation (for source status transactions) ────

/**
 * Revoke all effective cleaning assignments for a user when their account
 * or employee eligibility changes. Called from within the source status transaction.
 * Returns the count of revoked assignments.
 */
export async function revokeCleaningAssignments(
    tx: TxClient,
    userId: string,
    reason: string,
    actor: AuditActor
): Promise<number> {
    const wibToday = toWIBDateString(new Date());
    const effectiveAssignments = await tx.cleaningWorkerAssignment.findMany({
        where: {
            userId,
            ...effectiveOnDateWhere(wibToday),
        },
        include: {
            room: { select: { id: true, name: true } },
        },
    });

    if (effectiveAssignments.length === 0) return 0;

    for (const assignment of effectiveAssignments) {
        await tx.cleaningWorkerAssignment.update({
            where: { id: assignment.id },
            data: { endsOnWibDate: wibToday },
        });

        await tx.auditLog.create({
            data: {
                action: "REVOKE_CLEANING_ASSIGNMENT",
                entity: "CLEANING_WORKER_ASSIGNMENT",
                entityId: assignment.id,
                actorType: actor.type ?? "SYSTEM",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.identifier,
                actorName: actor.name ?? null,
                actorRole: actor.role ?? null,
                details: JSON.stringify({
                    userId: assignment.userId,
                    roomId: assignment.roomId,
                    roomName: assignment.room.name,
                    workerType: assignment.workerType,
                    startsOnWibDate: assignment.startsOnWibDate,
                    endsOnWibDate: wibToday,
                    reason,
                }),
            },
        });
    }

    await syncCleaningWorkerRole(tx, userId, wibToday);
    return effectiveAssignments.length;
}

// ─── Petugas: list assigned rooms ─────────────────────────────

export async function getWorkerRooms(session: SessionPayload) {
    requireCleaningWorker(session);
    const wibToday = captureWibDate();

    const assignments = await prisma.cleaningWorkerAssignment.findMany({
        where: {
            userId: session.userId,
            ...effectiveOnDateWhere(wibToday),
        },
        include: {
            room: {
                select: {
                    id: true,
                    name: true,
                    isActive: true,
                    template: { select: { id: true, name: true, isActive: true } },
                },
            },
        },
    });

    return assignments
        .filter((a) => a.room.isActive)
        .map((a) => a.room);
}

// ─── Petugas: create or get daily checklist ───────────────────

export async function getOrCreateDailyChecklist(session: SessionPayload, roomId: string) {
    requireCleaningWorker(session);
    const wibToday = captureWibDate();

    await verifyRoomAssignment(session.userId, roomId, wibToday);

    const room = await prisma.cleaningRoom.findUnique({
        where: { id: roomId },
        include: { template: { include: { items: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } } },
    });
    if (!room || !room.isActive) throw new CleaningError("Ruangan tidak ditemukan atau tidak aktif.", 404);
    if (!room.template || !room.template.isActive) throw new CleaningError("ROOM_NOT_READY", 422);

    const activeItems = room.template.items;
    if (activeItems.length === 0) throw new CleaningError("ROOM_NOT_READY", 422);

    let checklist = await prisma.cleaningDailyChecklist.findUnique({
        where: { roomId_wibDate: { roomId, wibDate: wibToday } },
        include: {
            items: {
                orderBy: { sortOrder: "asc" },
                include: { lastChangedBy: { select: { id: true, displayName: true } } },
            },
        },
    });

    if (!checklist) {
        try {
            checklist = await prisma.$transaction(async (tx) => {
                const created = await tx.cleaningDailyChecklist.create({
                    data: {
                        roomId,
                        wibDate: wibToday,
                        roomNameSnapshot: room.name,
                        items: {
                            create: activeItems.map((ti) => ({
                                templateItemId: ti.id,
                                itemNameSnapshot: ti.name,
                                sortOrder: ti.sortOrder,
                                isActive: true,
                                isComplete: false,
                            })),
                        },
                    },
                    include: {
                        items: {
                            orderBy: { sortOrder: "asc" },
                            include: { lastChangedBy: { select: { id: true, displayName: true } } },
                        },
                    },
                });

                await logAction("CREATE_CLEANING_CHECKLIST", "CLEANING_DAILY_CHECKLIST", actorFromSession(session), created.id, {
                    roomId,
                    wibDate: wibToday,
                    itemCount: activeItems.length,
                });

                return created;
            });
        } catch (error) {
            if ((error as { code?: string })?.code !== "P2002") throw error;

            checklist = await prisma.cleaningDailyChecklist.findUnique({
                where: { roomId_wibDate: { roomId, wibDate: wibToday } },
                include: {
                    items: {
                        orderBy: { sortOrder: "asc" },
                        include: { lastChangedBy: { select: { id: true, displayName: true } } },
                    },
                },
            });
            if (!checklist) throw error;
        }
    }

    return {
        ...checklist,
        derivedStatus: deriveChecklistStatus(checklist.items),
    };
}

// ─── Petugas: read existing checklist (any date) ──────────────

export async function getChecklist(session: SessionPayload, roomId: string, date: string) {
    requireCleaningWorker(session);
    const wibToday = captureWibDate();

    await verifyRoomAssignment(session.userId, roomId, wibToday);

    const checklist = await prisma.cleaningDailyChecklist.findUnique({
        where: { roomId_wibDate: { roomId, wibDate: date } },
        include: {
            items: {
                orderBy: { sortOrder: "asc" },
                include: { lastChangedBy: { select: { id: true, displayName: true } } },
            },
        },
    });

    if (!checklist) return null;

    return {
        ...checklist,
        derivedStatus: deriveChecklistStatus(checklist.items),
    };
}

// ─── Petugas: update item completion ──────────────────────────

export async function updateChecklistItem(session: SessionPayload, itemId: string, isComplete: boolean) {
    requireCleaningWorker(session);
    const wibToday = captureWibDate();

    const item = await prisma.cleaningDailyChecklistItem.findUnique({
        where: { id: itemId },
        include: { checklist: { select: { roomId: true, wibDate: true } } },
    });

    if (!item) throw new CleaningError("Item checklist tidak ditemukan.", 404);
    if (!item.isActive) throw new CleaningError("Item tidak aktif.", 422);
    if (item.checklist.wibDate !== wibToday) {
        throw new CleaningError("Hanya item hari ini (WIB) yang dapat diubah.", 422);
    }

    await verifyRoomAssignment(session.userId, item.checklist.roomId, wibToday);

    const updated = await prisma.cleaningDailyChecklistItem.update({
        where: { id: itemId },
        data: {
            isComplete,
            lastChangedByUserId: session.userId,
            lastChangedAt: new Date(),
        },
        include: { lastChangedBy: { select: { id: true, displayName: true } } },
    });

    await logAction("UPDATE_CLEANING_ITEM", "CLEANING_DAILY_CHECKLIST_ITEM", actorFromSession(session), itemId, {
        checklistId: item.checklistId,
        isComplete,
    });

    const allItems = await prisma.cleaningDailyChecklistItem.findMany({
        where: { checklistId: item.checklistId },
    });

    return {
        item: updated,
        derivedStatus: deriveChecklistStatus(allItems),
    };
}

// ─── WIG002: recap (monthly matrix) ──────────────────────────

export async function getRecap(session: SessionPayload, month: string) {
    requireWig002(session);
    const wibToday = captureWibDate();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        throw new CleaningError("Format bulan tidak valid. Gunakan YYYY-MM.", 422);
    }

    const todayMonth = wibToday.substring(0, 7);
    if (month > todayMonth) {
        throw new CleaningError("Tidak dapat melihat rekap bulan mendatang.", 422);
    }

    const rooms = await prisma.cleaningRoom.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
    });

    const checklists = await prisma.cleaningDailyChecklist.findMany({
        where: {
            wibDate: { startsWith: month },
        },
        include: {
            items: { select: { isActive: true, isComplete: true } },
        },
    });

    const daysInMonth = getDaysInMonth(month);
    const dates = Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        return `${month}-${day}`;
    });

    const checklistMap = new Map<string, typeof checklists[number]>();
    for (const cl of checklists) {
        checklistMap.set(`${cl.roomId}_${cl.wibDate}`, cl);
    }

    const matrix = rooms.map((room) => ({
        room,
        days: dates.map((date) => {
            const cl = checklistMap.get(`${room.id}_${date}`);
            const isFuture = date > wibToday;
            if (isFuture) return { date, status: "FUTURE" as const };
            if (!cl) return { date, status: "BELUM" as const };
            return { date, status: deriveChecklistStatus(cl.items) };
        }),
    }));

    return { month, rooms, matrix, dates };
}

// ─── WIG002: read checklist detail for any room/date ──────────

export async function getChecklistDetail(session: SessionPayload, roomId: string, date: string) {
    requireWig002(session);
    const wibToday = captureWibDate();

    const room = await prisma.cleaningRoom.findUnique({
        where: { id: roomId },
        include: { template: { include: { items: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } } },
    });
    if (!room) throw new CleaningError("Ruangan tidak ditemukan.", 404);

    const checklist = await prisma.cleaningDailyChecklist.findUnique({
        where: { roomId_wibDate: { roomId, wibDate: date } },
        include: {
            items: {
                orderBy: { sortOrder: "asc" },
                include: { lastChangedBy: { select: { id: true, displayName: true } } },
            },
        },
    });

    if (checklist) {
        return {
            type: "record" as const,
            checklist: { ...checklist, derivedStatus: deriveChecklistStatus(checklist.items) },
        };
    }

    if (date >= wibToday && room.template?.isActive && room.template.items.length > 0) {
        return {
            type: "preview" as const,
            preview: {
                roomId: room.id,
                roomName: room.name,
                date,
                templateName: room.template.name,
                items: room.template.items.map((ti) => ({ name: ti.name, sortOrder: ti.sortOrder })),
            },
        };
    }

    return {
        type: "no_record" as const,
        message: "Tidak ada catatan checklist digital untuk tanggal ini.",
    };
}

// ─── Helpers ──────────────────────────────────────────────────

async function verifyRoomAssignment(userId: string, roomId: string, wibToday: string) {
    const assignment = await prisma.cleaningWorkerAssignment.findFirst({
        where: {
            userId,
            roomId,
            ...effectiveOnDateWhere(wibToday),
        },
    });
    if (!assignment) {
        throw new CleaningError("Anda tidak ditugaskan ke ruangan ini.", 403);
    }
}

function deriveChecklistStatus(items: { isActive: boolean; isComplete: boolean }[]): "SELESAI" | "BELUM" {
    const activeItems = items.filter((i) => i.isActive);
    if (activeItems.length === 0) return "BELUM";
    return activeItems.every((i) => i.isComplete) ? "SELESAI" : "BELUM";
}

function getDaysInMonth(month: string): number {
    const [year, m] = month.split("-").map(Number);
    return new Date(year, m, 0).getDate();
}

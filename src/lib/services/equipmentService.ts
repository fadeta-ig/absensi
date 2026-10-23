import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { toWIBDateString, isValidCalendarDate, addCalendarDays } from "@/lib/timezone";
import type { SessionPayload } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { actorFromSession } from "@/lib/services/auditService";
import { isWig002, normalizeName } from "@/lib/services/cleaningService";
import { getUploadLimit } from "@/lib/services/appSettingsService";

// ─── Error ────────────────────────────────────────────────────────

export class EquipmentError extends Error {
    constructor(message: string, public statusCode: number = 400) {
        super(message);
        this.name = "EquipmentError";
    }
}

// ─── Konstanta ────────────────────────────────────────────────────

export const EQUIPMENT_QC_MEMBERS_KEY = "equipment.qcMembers" as const;
export const EQUIPMENT_QC_MEMBERS_MAX = 20;
export const EQUIPMENT_TOP_VIEWERS_KEY = "equipment.topViewers" as const;
export const EQUIPMENT_TOP_VIEWERS_MAX = 5;
/** Approver final inspeksi alat (dinamis maks 5, di-set WIG002). */
export const EQUIPMENT_APPROVER_KEY = "equipment.approvers" as const;
export const EQUIPMENT_APPROVERS_MAX = 5;
/** Kunci lama (tunggal). Tetap dibaca sebagai fallback bila kunci baru belum ada. */
const EQUIPMENT_APPROVER_LEGACY_KEY = "equipment.approverId" as const;
const EQUIPMENT_EVIDENCE_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "equipment-evidence");
const EQUIPMENT_QC_EVIDENCE_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "equipment-qc-evidence");
const EQUIPMENT_EVIDENCE_MAX_PHOTOS = 5;
const EQUIPMENT_QC_EVIDENCE_MAX_PHOTOS = 5;
const SETTING_CACHE_TTL_MS = 60_000;

let qcMembersCache: { value: string[]; expiresAt: number } | null = null;

export function invalidateEquipmentQcMembersCache(): void {
    qcMembersCache = null;
}

/** Daftar employee QC (di-set WIG002 dari data HR). Pool: semua anggota melihat semua antrean. */
export async function getEquipmentQcMemberIds(): Promise<string[]> {
    if (qcMembersCache && Date.now() <= qcMembersCache.expiresAt) return qcMembersCache.value;
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: EQUIPMENT_QC_MEMBERS_KEY } });
        if (!row?.value) {
            qcMembersCache = { value: [], expiresAt: Date.now() + SETTING_CACHE_TTL_MS };
            return [];
        }
        const parsed = JSON.parse(row.value) as unknown;
        const value = Array.isArray(parsed)
            ? [...new Set(parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))].slice(0, EQUIPMENT_QC_MEMBERS_MAX)
            : [];
        qcMembersCache = { value, expiresAt: Date.now() + SETTING_CACHE_TTL_MS };
        return value;
    } catch {
        return [];
    }
}

export async function getEquipmentQcMembers(): Promise<Array<{ employeeId: string; name: string | null; isActive: boolean; email: string | null }>> {
    const ids = await getEquipmentQcMemberIds();
    if (ids.length === 0) return [];
    const employees = await prisma.employee.findMany({
        where: { employeeId: { in: ids } },
        select: { employeeId: true, name: true, isActive: true, email: true },
    });
    const order = new Map(ids.map((id, idx) => [id, idx]));
    return employees.sort((a, b) => (order.get(a.employeeId) ?? 0) - (order.get(b.employeeId) ?? 0));
}

export async function setEquipmentQcMembers(
    session: SessionPayload,
    employeeIds: string[],
    actor: { userId?: string | null; username: string }
): Promise<string[]> {
    requireWig002(session);
    const ids = [...new Set(employeeIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length > EQUIPMENT_QC_MEMBERS_MAX) {
        throw new EquipmentError(`Anggota QC maksimal ${EQUIPMENT_QC_MEMBERS_MAX} orang.`, 409);
    }
    const today = toWIBDateString();
    for (const id of ids) await assertActiveInternalEmployee(prisma, id, today);
    await prisma.appSetting.upsert({
        where: { key: EQUIPMENT_QC_MEMBERS_KEY },
        update: { value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
        create: { key: EQUIPMENT_QC_MEMBERS_KEY, value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
    });
    invalidateEquipmentQcMembersCache();
    return ids;
}

/** true bila sesi milik anggota QC aktif (internal + akun aktif). */
export async function isEquipmentQcMember(session: SessionPayload): Promise<boolean> {
    if (!session.employeeId) return false;
    try {
        const ids = await getEquipmentQcMemberIds();
        if (!ids.includes(session.employeeId)) return false;
        const emp = await prisma.employee.findUnique({ where: { employeeId: session.employeeId }, select: { isActive: true } });
        return emp?.isActive === true;
    } catch {
        return false;
    }
}

function requireQc(session: SessionPayload): void {
    // Dipakai sinkron di awal; keanggotaan detail dicek async via isEquipmentQcMember.
    if (!session.employeeId) throw new EquipmentError("Hanya karyawan QC yang dapat memproses antrean.", 403);
}

export async function requireQcMember(session: SessionPayload): Promise<void> {
    requireQc(session);
    if (!(await isEquipmentQcMember(session))) {
        throw new EquipmentError("Hanya karyawan QC yang ditunjuk WIG002 yang dapat memproses antrean.", 403);
    }
}

// ─── Guard internal ───────────────────────────────────────────────

function requireWig002(session: SessionPayload): void {
    if (!isWig002(session)) throw new EquipmentError("Hanya WIG002 yang dapat mengelola master inspeksi alat.", 403);
}

async function isEquipmentTopViewer(session: SessionPayload): Promise<boolean> {
    if (!session.employeeId) return false;
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: EQUIPMENT_TOP_VIEWERS_KEY } });
        if (!row?.value) return false;
        const ids = JSON.parse(row.value) as unknown;
        if (!Array.isArray(ids)) return false;
        if (!ids.includes(session.employeeId)) return false;
        const emp = await prisma.employee.findUnique({ where: { employeeId: session.employeeId }, select: { isActive: true } });
        return emp?.isActive === true;
    } catch {
        return false;
    }
}

export async function requireWig002OrTopViewer(session: SessionPayload): Promise<void> {    if (isWig002(session)) return;
    if (await isEquipmentTopViewer(session)) return;
    throw new EquipmentError("Hanya WIG002 atau atasan yang ditunjuk yang dapat melihat.", 403);
}

export async function getEquipmentTopViewers(): Promise<Array<{ employeeId: string; name: string | null; isActive: boolean; email: string | null }>> {
    let ids: string[] = [];
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: EQUIPMENT_TOP_VIEWERS_KEY } });
        if (row?.value) {
            const parsed = JSON.parse(row.value) as unknown;
            if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === "string").slice(0, EQUIPMENT_TOP_VIEWERS_MAX);
        }
    } catch {
        ids = [];
    }
    if (ids.length === 0) return [];
    const employees = await prisma.employee.findMany({
        where: { employeeId: { in: ids } },
        select: { employeeId: true, name: true, isActive: true, email: true },
    });
    const order = new Map(ids.map((id, idx) => [id, idx]));
    return employees.sort((a, b) => (order.get(a.employeeId) ?? 0) - (order.get(b.employeeId) ?? 0));
}

export async function setEquipmentTopViewers(
    session: SessionPayload,
    employeeIds: string[],
    actor: { userId?: string | null; username: string }
): Promise<string[]> {
    requireWig002(session);
    const ids = [...new Set(employeeIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length > EQUIPMENT_TOP_VIEWERS_MAX) {
        throw new EquipmentError(`Atasan maksimal ${EQUIPMENT_TOP_VIEWERS_MAX} orang.`, 409);
    }
    const today = toWIBDateString();
    for (const id of ids) await assertActiveInternalEmployee(prisma, id, today);
    await prisma.appSetting.upsert({
        where: { key: EQUIPMENT_TOP_VIEWERS_KEY },
        update: { value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
        create: { key: EQUIPMENT_TOP_VIEWERS_KEY, value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
    });
    return ids;
}

/** Daftar approver final (dinamis, di-set WIG002, maks 5). */
export async function getEquipmentApproverIds(): Promise<string[]> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: EQUIPMENT_APPROVER_KEY } });
        if (row?.value) {
            try {
                const parsed = JSON.parse(row.value) as unknown;
                if (Array.isArray(parsed)) {
                    const ids = [...new Set(parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))];
                    if (ids.length > 0) return ids.slice(0, EQUIPMENT_APPROVERS_MAX);
                }
            } catch {
                // Bukan JSON array — lanjut ke fallback kunci lama.
            }
        }
        // Fallback kunci lama (string tunggal).
        const legacy = await prisma.appSetting.findUnique({ where: { key: EQUIPMENT_APPROVER_LEGACY_KEY } });
        const id = legacy?.value?.trim() ?? "";
        return id.length > 0 ? [id] : [];
    } catch {
        return [];
    }
}

export async function getEquipmentApprovers(): Promise<Array<{ employeeId: string; name: string | null; isActive: boolean }>> {
    const ids = await getEquipmentApproverIds();
    if (ids.length === 0) return [];
    const employees = await prisma.employee.findMany({
        where: { employeeId: { in: ids } },
        select: { employeeId: true, name: true, isActive: true },
    });
    const order = new Map(ids.map((id, idx) => [id, idx]));
    return employees.sort((a, b) => (order.get(a.employeeId) ?? 0) - (order.get(b.employeeId) ?? 0));
}

export async function getEquipmentApprover(): Promise<{ employeeId: string; name: string | null; isActive: boolean } | null> {
    const list = await getEquipmentApprovers();
    return list[0] ?? null;
}

export async function setEquipmentApprovers(
    session: SessionPayload,
    employeeIds: string[],
    actor: { userId?: string | null; username: string }
): Promise<string[]> {
    requireWig002(session);
    const ids = [...new Set(employeeIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length > EQUIPMENT_APPROVERS_MAX) {
        throw new EquipmentError(`Approver maksimal ${EQUIPMENT_APPROVERS_MAX} orang.`, 409);
    }
    const today = toWIBDateString();
    for (const id of ids) await assertActiveInternalEmployee(prisma, id, today);
    await prisma.appSetting.upsert({
        where: { key: EQUIPMENT_APPROVER_KEY },
        update: { value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
        create: { key: EQUIPMENT_APPROVER_KEY, value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
    });
    return ids;
}

export async function setEquipmentApprover(
    session: SessionPayload,
    employeeId: string,
    actor: { userId?: string | null; username: string }
): Promise<string> {
    const ids = await setEquipmentApprovers(session, employeeId.trim() ? [employeeId.trim()] : [], actor);
    return ids[0] ?? "";
}

export async function isEquipmentApprover(session: SessionPayload): Promise<boolean> {
    if (!session.employeeId) return false;
    try {
        const ids = await getEquipmentApproverIds();
        if (!ids.includes(session.employeeId)) return false;
        const emp = await prisma.employee.findUnique({ where: { employeeId: session.employeeId }, select: { isActive: true } });
        return emp?.isActive === true;
    } catch {
        return false;
    }
}

export async function requireApprover(session: SessionPayload): Promise<void> {
    if (await isEquipmentApprover(session)) return;
    throw new EquipmentError("Hanya approver yang ditunjuk WIG002 yang dapat menyetujui inspeksi.", 403);
}

/** Karyawan internal aktif + punya akun aktif (outsource selalu ditolak). */
async function assertActiveInternalEmployee(
    db: Prisma.TransactionClient | typeof prisma,
    employeeId: string,
    wibToday: string
): Promise<{ employeeId: string; name: string; userId: string }> {
    const todayDate = new Date(wibToday + "T00:00:00+07:00");
    const employee = await db.employee.findFirst({
        where: {
            employeeId,
            isActive: true,
            userAccount: { isActive: true },
            AND: [
                { OR: [{ employmentStartDate: null }, { employmentStartDate: { lte: todayDate } }] },
                { OR: [{ employmentEndDate: null }, { employmentEndDate: { gte: todayDate } }] },
            ],
        },
        include: { userAccount: { select: { id: true } } },
    });
    if (!employee || !employee.userAccount) {
        throw new EquipmentError(`Karyawan ${employeeId} bukan karyawan internal aktif.`, 422);
    }
    return { employeeId: employee.employeeId, name: employee.name, userId: employee.userAccount.id };
}

/** Penugasan efektif WIB (global unitId=null mencakup semua unit). */
async function assertAssignee(
    db: Prisma.TransactionClient | typeof prisma,
    userId: string,
    unitId: string,
    wibToday: string
): Promise<void> {
    const rows = await db.equipmentAssignment.findMany({
        where: { userId, OR: [{ unitId: null }, { unitId }] },
        orderBy: { startsOnWibDate: "desc" },
    });
    const ok = rows.some((r) => isEffectiveOn(wibToday, r.startsOnWibDate, r.endsOnWibDate));
    if (!ok) throw new EquipmentError("Anda tidak ditugaskan pada unit ini.", 403);
}

function isEffectiveOn(today: string, startsOn: string, endsOn: string | null): boolean {
    return startsOn <= today && (endsOn === null || today < endsOn);
}

/** Syarat dasar karyawan internal aktif; akses checklist per unit dicek terpisah via assertAssignee. */
export async function requireActiveInternalEmployee(
    session: SessionPayload
): Promise<{ employeeId: string; name: string; userId: string }> {
    if (!session.employeeId) throw new EquipmentError("Hanya karyawan yang dapat mengisi inspeksi.", 403);
    return assertActiveInternalEmployee(prisma, session.employeeId, toWIBDateString());
}

// ─── Template ─────────────────────────────────────────────────────

export async function getEquipmentTemplates(session: SessionPayload) {
    requireWig002(session);
    return prisma.equipmentTemplate.findMany({
        orderBy: { name: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } }, _count: { select: { units: true } } },
    });
}

export async function createEquipmentTemplate(session: SessionPayload, name: string) {
    requireWig002(session);
    const clean = normalizeName(name);
    if (!clean) throw new EquipmentError("Nama template wajib diisi.", 400);
    try {
        const created = await prisma.equipmentTemplate.create({ data: { name: name.trim(), nameNormalized: clean } });
        await logCreated("CREATE_EQUIPMENT_TEMPLATE", "EQUIPMENT_TEMPLATE", created.id, session, { name: created.name });
        return created;
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama template sudah dipakai.", 409);
        throw err;
    }
}

export async function updateEquipmentTemplate(session: SessionPayload, id: string, input: { name?: string; isActive?: boolean }) {
    requireWig002(session);
    const existing = await prisma.equipmentTemplate.findUnique({ where: { id }, include: { _count: { select: { units: true } } } });
    if (!existing) throw new EquipmentError("Template tidak ditemukan.", 404);
    if (input.isActive === false && existing._count.units > 0) {
        throw new EquipmentError("Template masih dipakai unit aktif. Nonaktifkan unit dulu.", 409);
    }
    const data: { name?: string; nameNormalized?: string; isActive?: boolean } = {};
    if (input.name !== undefined) {
        const clean = normalizeName(input.name);
        if (!clean) throw new EquipmentError("Nama template wajib diisi.", 400);
        data.name = input.name.trim();
        data.nameNormalized = clean;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;
    try {
        return await prisma.equipmentTemplate.update({ where: { id }, data });
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama template sudah dipakai.", 409);
        throw err;
    }
}

export async function createEquipmentTemplateItem(session: SessionPayload, input: { templateId: string; name: string; requirePhoto?: boolean }) {
    requireWig002(session);
    const template = await prisma.equipmentTemplate.findUnique({ where: { id: input.templateId } });
    if (!template || !template.isActive) throw new EquipmentError("Template tidak ditemukan atau nonaktif.", 422);
    const clean = normalizeName(input.name);
    if (!clean) throw new EquipmentError("Nama item wajib diisi.", 400);
    try {
        return await prisma.$transaction(async (tx) => {
            const count = await tx.equipmentTemplateItem.count({ where: { templateId: input.templateId } });
            return tx.equipmentTemplateItem.create({
                data: { templateId: input.templateId, name: input.name.trim(), nameNormalized: clean, sortOrder: count, requirePhoto: input.requirePhoto ?? true },
            });
        });
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama item sudah ada di template ini.", 409);
        throw err;
    }
}

export async function updateEquipmentTemplateItem(
    session: SessionPayload,
    id: string,
    input: { name?: string; sortOrder?: number; requirePhoto?: boolean; isActive?: boolean }
) {
    requireWig002(session);
    const existing = await prisma.equipmentTemplateItem.findUnique({ where: { id }, include: { template: true } });
    if (!existing) throw new EquipmentError("Item template tidak ditemukan.", 404);
    if (input.isActive === false) {
        const activeSiblings = await prisma.equipmentTemplateItem.count({
            where: { templateId: existing.templateId, isActive: true, id: { not: id } },
        });
        if (activeSiblings === 0) throw new EquipmentError("Template harus punya minimal 1 item aktif.", 409);
    }
    const data: { name?: string; nameNormalized?: string; sortOrder?: number; requirePhoto?: boolean; isActive?: boolean } = {};
    if (input.name !== undefined) {
        const clean = normalizeName(input.name);
        if (!clean) throw new EquipmentError("Nama item wajib diisi.", 400);
        data.name = input.name.trim();
        data.nameNormalized = clean;
    }
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.requirePhoto !== undefined) data.requirePhoto = input.requirePhoto;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    try {
        return await prisma.equipmentTemplateItem.update({ where: { id }, data });
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama item sudah ada di template ini.", 409);
        throw err;
    }
}

export async function deleteEquipmentTemplateItem(session: SessionPayload, id: string) {
    requireWig002(session);
    const existing = await prisma.equipmentTemplateItem.findUnique({ where: { id } });
    if (!existing) throw new EquipmentError("Item template tidak ditemukan.", 404);
    // Snapshot riwayat dipertahankan (templateItemId di-set null otomatis).
    await prisma.equipmentTemplateItem.delete({ where: { id } });
    return { success: true };
}

// ─── Unit ─────────────────────────────────────────────────────────

export async function getEquipmentUnits(session: SessionPayload, activeOnly = false) {
    // Baca master boleh WIG002/top reviewer (dropdown rekap); tulis tetap WIG002 di create/update.
    await requireWig002OrTopViewer(session);
    return prisma.equipmentUnit.findMany({
        where: activeOnly ? { isActive: true } : {},
        orderBy: { name: "asc" },
        include: {
            template: { select: { id: true, name: true } },
            _count: { select: { assignments: true, inspections: true } },
        },
    });
}

export interface EquipmentUnitInput {
    name: string;
    brand?: string | null;
    location?: string | null;
    templateId: string;
}

export async function createEquipmentUnit(session: SessionPayload, input: EquipmentUnitInput) {
    requireWig002(session);
    const clean = normalizeName(input.name);
    if (!clean) throw new EquipmentError("Nama alat wajib diisi.", 400);
    const template = await prisma.equipmentTemplate.findUnique({ where: { id: input.templateId } });
    if (!template || !template.isActive) throw new EquipmentError("Template tidak ditemukan atau nonaktif.", 422);
    try {
        const created = await prisma.equipmentUnit.create({
            data: {
                name: input.name.trim(),
                nameNormalized: clean,
                brand: input.brand?.trim() || null,
                location: input.location?.trim() || null,
                templateId: input.templateId,
            },
        });
        await logCreated("CREATE_EQUIPMENT_UNIT", "EQUIPMENT_UNIT", created.id, session, { name: created.name });
        return created;
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama alat sudah dipakai.", 409);
        throw err;
    }
}

export async function updateEquipmentUnit(session: SessionPayload, id: string, input: Partial<EquipmentUnitInput> & { isActive?: boolean }) {
    requireWig002(session);
    const existing = await prisma.equipmentUnit.findUnique({ where: { id } });
    if (!existing) throw new EquipmentError("Unit alat tidak ditemukan.", 404);
    if (input.isActive === false) {
        const openCount = await prisma.equipmentInspection.count({ where: { unitId: id, status: { in: ["OPEN", "SUBMITTED"] } } });
        if (openCount > 0) throw new EquipmentError("Unit masih punya inspeksi berjalan. Selesaikan dulu.", 409);
    }
    if (input.templateId) {
        const template = await prisma.equipmentTemplate.findUnique({ where: { id: input.templateId } });
        if (!template || !template.isActive) throw new EquipmentError("Template tidak ditemukan atau nonaktif.", 422);
    }
    const data: Prisma.EquipmentUnitUpdateInput = {};
    if (input.name !== undefined) {
        const clean = normalizeName(input.name);
        if (!clean) throw new EquipmentError("Nama alat wajib diisi.", 400);
        data.name = input.name.trim();
        data.nameNormalized = clean;
    }
    if (input.brand !== undefined) data.brand = input.brand?.trim() || null;
    if (input.location !== undefined) data.location = input.location?.trim() || null;
    if (input.templateId !== undefined) data.template = { connect: { id: input.templateId } };
    if (input.isActive !== undefined) data.isActive = input.isActive;
    try {
        return await prisma.equipmentUnit.update({ where: { id }, data });
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama alat sudah dipakai.", 409);
        throw err;
    }
}

// ─── Unit untuk checklist (hanya yang ditugaskan) ────────────────────

export async function getMyEquipmentUnits(session: SessionPayload) {
    if (!session.userId) throw new EquipmentError("Sesi tidak valid.", 401);
    const today = toWIBDateString();
    const rows = await prisma.equipmentAssignment.findMany({
        where: { userId: session.userId },
        orderBy: { startsOnWibDate: "desc" },
    });
    const effective = rows.filter((r) => isEffectiveOn(today, r.startsOnWibDate, r.endsOnWibDate));
    // Penugasan global (unitId null) mencakup semua unit aktif.
    const hasGlobal = effective.some((r) => r.unitId === null);
    const specificIds = [...new Set(effective.filter((r) => r.unitId !== null).map((r) => r.unitId as string))];
    const units = await prisma.equipmentUnit.findMany({
        where: {
            isActive: true,
            ...(hasGlobal ? {} : { id: { in: specificIds.length > 0 ? specificIds : ["__none__"] } }),
        },
        orderBy: { name: "asc" },
        include: {
            template: { select: { id: true, name: true } },
            inspections: {
                orderBy: { createdAt: "desc" },
                take: 1,
                where: { status: { not: "CANCELLED" } },
                select: {
                    id: true,
                    status: true,
                    createdAt: true,
                    submittedAt: true,
                    startedBy: { select: { employeeId: true, name: true } },
                    checkedBy: { select: { employeeId: true, name: true } },
                    approvedBy: { select: { employeeId: true, name: true } },
                },
            },
        },
    });
    return units.map((u) => ({ assignmentId: null, startsOn: null, endsOn: null, unit: u }));
}

// ─── Assignment: WIG002 menentukan siapa dapat modul Inspeksi Alat ───

export async function assignEquipmentUnit(
    session: SessionPayload,
    input: { unitId?: string | null; employeeId: string; startsOnWibDate?: string; endsOnWibDate?: string | null }
) {
    requireWig002(session);
    if (input.unitId) {
        const unit = await prisma.equipmentUnit.findUnique({ where: { id: input.unitId } });
        if (!unit || !unit.isActive) throw new EquipmentError("Unit alat tidak ditemukan atau nonaktif.", 422);
    }
    const today = toWIBDateString();
    const emp = await assertActiveInternalEmployee(prisma, input.employeeId, today);
    const startsOn = input.startsOnWibDate ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) throw new EquipmentError("Tanggal mulai tidak valid (YYYY-MM-DD).", 400);
    if (input.endsOnWibDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.endsOnWibDate)) {
        throw new EquipmentError("Tanggal selesai tidak valid (YYYY-MM-DD).", 400);
    }
    if (input.endsOnWibDate && input.endsOnWibDate <= startsOn) {
        throw new EquipmentError("Tanggal selesai harus setelah tanggal mulai.", 400);
    }
    const periodOr = [{ endsOnWibDate: null }, { endsOnWibDate: { gt: startsOn } }];
    const periodAnd = { startsOnWibDate: { lte: input.endsOnWibDate ?? "9999-12-31" } };
    const overlap = input.unitId
        ? await prisma.equipmentAssignment.findFirst({
            where: { userId: emp.userId, ...periodAnd, AND: [{ OR: [{ unitId: null }, { unitId: input.unitId }] }, { OR: periodOr }] },
        })
        : await prisma.equipmentAssignment.findFirst({ where: { userId: emp.userId, ...periodAnd, OR: periodOr } });
    if (overlap) throw new EquipmentError("Penugasan bertabrakan dengan periode yang sudah ada.", 409);
    return prisma.equipmentAssignment.create({
        data: { unitId: input.unitId ?? null, userId: emp.userId, startsOnWibDate: startsOn, endsOnWibDate: input.endsOnWibDate ?? null },
    });
}

export async function getEquipmentAssignments(session: SessionPayload) {
    requireWig002(session);
    return prisma.equipmentAssignment.findMany({
        orderBy: { startsOnWibDate: "desc" },
        take: 200,
        include: {
            unit: { select: { id: true, name: true } },
            user: { select: { id: true, employeeId: true, displayName: true } },
        },
    });
}

export async function endEquipmentAssignment(session: SessionPayload, assignmentId: string, endsOnWibDate?: string) {
    requireWig002(session);
    const existing = await prisma.equipmentAssignment.findUnique({ where: { id: assignmentId } });
    if (!existing) throw new EquipmentError("Penugasan tidak ditemukan.", 404);
    if (existing.endsOnWibDate) throw new EquipmentError("Penugasan sudah berakhir.", 409);
    const today = toWIBDateString();
    const endsOn = endsOnWibDate ?? today;
    if (endsOn <= existing.startsOnWibDate) throw new EquipmentError("Tanggal selesai harus setelah tanggal mulai.", 400);
    return prisma.equipmentAssignment.update({ where: { id: assignmentId }, data: { endsOnWibDate: endsOn } });
}

export interface EquipmentRecapFilters {
    unitId?: string;
    status?: "OPEN" | "SUBMITTED" | "DONE";
    from?: string;
    to?: string;
}

export async function getEquipmentRecap(session: SessionPayload, filters: EquipmentRecapFilters) {
    await requireWig002OrTopViewer(session);
    return queryEquipmentRecap(filters);
}

/** Query rekap tanpa guard sesi — hanya untuk cron sistem internal. */
export async function queryEquipmentRecap(filters: EquipmentRecapFilters) {
    const where: Prisma.EquipmentInspectionWhereInput = {};
    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.status) where.status = filters.status;
    else where.status = { not: "CANCELLED" };
    if (filters.from || filters.to) {
        where.createdAt = {
            ...(filters.from ? { gte: new Date(filters.from + "T00:00:00+07:00") } : {}),
            ...(filters.to ? { lt: new Date(filters.to + "T00:00:00+07:00") } : {}),
        };
    }
    const [rows, open, submitted, done, approved] = await Promise.all([
        prisma.equipmentInspection.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 200,
            include: {
                unit: { select: { id: true, name: true, brand: true, location: true } },
                startedBy: { select: { employeeId: true, name: true } },
                checkedBy: { select: { employeeId: true, name: true } },
                approvedBy: { select: { employeeId: true, name: true } },
                _count: { select: { items: true } },
            },
        }),
        prisma.equipmentInspection.count({ where: { ...where, status: "OPEN" } }),
        prisma.equipmentInspection.count({ where: { ...where, status: "SUBMITTED" } }),
        prisma.equipmentInspection.count({ where: { ...where, status: "DONE" } }),
        prisma.equipmentInspection.count({ where: { ...where, status: "APPROVED" } }),
    ]);
    return { summary: { open, submitted, done, approved, total: open + submitted + done + approved }, inspections: rows };
}

export async function getEmployeeEquipmentCapabilities(
    session: SessionPayload
): Promise<{ canExecute: boolean; canReview: boolean; canTopView: boolean; canApprove: boolean }> {
    if (!session.employeeId || !session.userId) return { canExecute: false, canReview: false, canTopView: false, canApprove: false };
    const today = toWIBDateString();
    const [assignCount, isQc, isTop, isApprover] = await Promise.all([
        prisma.equipmentAssignment.count({
            where: {
                userId: session.userId,
                startsOnWibDate: { lte: today },
                OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: today } }],
            },
        }),
        isEquipmentQcMember(session).catch(() => false),
        isEquipmentTopViewer(session).catch(() => false),
        isEquipmentApprover(session).catch(() => false),
    ]).catch(() => [0, false, false, false] as [number, boolean, boolean, boolean]);
    return { canExecute: assignCount > 0, canReview: isQc, canTopView: isTop, canApprove: isApprover };
}

// ─── Inspeksi ─────────────────────────────────────────────────────

const inspectionInclude = {
    unit: { select: { id: true, name: true, brand: true, location: true } },
    startedBy: { select: { employeeId: true, name: true } },
    checkedBy: { select: { employeeId: true, name: true } },
    approvedBy: { select: { employeeId: true, name: true } },
    items: {
        orderBy: { sortOrder: "asc" as const },
        select: {
            id: true, itemNameSnapshot: true, sortOrder: true, requirePhoto: true, isActive: true,
            isPass: true, note: true, lastChangedAt: true,
            lastChangedBy: { select: { id: true } },
        },
    },
    // Satu tempat upload per inspeksi (maks 5) — mewakili semua item.
    evidence: {
        orderBy: { capturedAt: "asc" as const },
        select: { id: true, filePath: true, note: true, capturedAt: true },
    },
    qcEvidence: {
        orderBy: { capturedAt: "asc" as const },
        select: { id: true, filePath: true, note: true, capturedAt: true },
    },
} satisfies Prisma.EquipmentInspectionInclude;

type InspectionRow = Prisma.EquipmentInspectionGetPayload<{ include: typeof inspectionInclude }>;

export function toInspectionDto(insp: InspectionRow) {
    const activeItems = insp.items.filter((i) => i.isActive);
    const decided = activeItems.filter((i) => i.isPass !== null).length;
    const allDecided = activeItems.length > 0 && decided === activeItems.length;
    // Foto satu tempat per inspeksi: wajib ≥1 bila ada item aktif bertanda requirePhoto.
    const needsPhoto = activeItems.some((i) => i.requirePhoto);
    const photoOk = !needsPhoto || insp.evidence.length > 0;
    return {
        id: insp.id,
        unit: insp.unit,
        startedBy: insp.startedBy,
        status: insp.status,
        createdAt: insp.createdAt,
        submittedAt: insp.submittedAt,
        checkedBy: insp.checkedBy,
        checkedByNameSnapshot: insp.checkedByNameSnapshot,
        checkedAt: insp.checkedAt,
        qcNote: insp.qcNote,
        approvedBy: insp.approvedBy,
        approvedByNameSnapshot: insp.approvedByNameSnapshot,
        approvedAt: insp.approvedAt,
        items: insp.items,
        evidence: insp.evidence,
        qcEvidence: insp.qcEvidence,
        progress: { total: activeItems.length, decided, allDecided, photoOk },
    };
}

export type EquipmentInspectionDto = ReturnType<typeof toInspectionDto>;

async function loadInspectionOrThrow(id: string): Promise<InspectionRow> {
    const insp = await prisma.equipmentInspection.findUnique({ where: { id }, include: inspectionInclude });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    return insp;
}

export async function startEquipmentInspection(session: SessionPayload, unitId: string): Promise<EquipmentInspectionDto> {
    if (!session.userId || !session.employeeId) throw new EquipmentError("Hanya karyawan yang dapat memulai inspeksi.", 403);
    const unit = await prisma.equipmentUnit.findUnique({
        where: { id: unitId },
        include: { template: { include: { items: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } } },
    });
    if (!unit || !unit.isActive) throw new EquipmentError("Unit alat tidak ditemukan atau nonaktif.", 422);
    if (!unit.template.isActive) throw new EquipmentError("Template unit ini nonaktif.", 422);
    if (unit.template.items.length === 0) throw new EquipmentError("Template belum punya item aktif.", 422);
    const today = toWIBDateString();
    await assertAssignee(prisma, session.userId, unitId, today);
    const created = await prisma.$transaction(async (tx) => {
        const insp = await tx.equipmentInspection.create({
            data: {
                unitId,
                unitNameSnapshot: unit.name,
                startedByEmployeeId: session.employeeId as string,
            },
        });
        await tx.equipmentInspectionItem.createMany({
            data: unit.template.items.map((t, idx) => ({
                inspectionId: insp.id,
                templateItemId: t.id,
                itemNameSnapshot: t.name,
                sortOrder: t.sortOrder ?? idx,
                requirePhoto: t.requirePhoto,
            })),
        });
        await tx.auditLog.create({
            data: {
                action: "START_EQUIPMENT_INSPECTION",
                entity: "EQUIPMENT_INSPECTION",
                entityId: insp.id,
                details: JSON.stringify({ unitId }),
                actorType: "USER",
                actorUserId: session.userId ?? null,
                actorIdentifier: session.username,
            },
        });
        return tx.equipmentInspection.findUniqueOrThrow({ where: { id: insp.id }, include: inspectionInclude });
    });
    return toInspectionDto(created);
}

export async function getEquipmentInspection(session: SessionPayload, id: string): Promise<EquipmentInspectionDto> {
    const insp = await loadInspectionOrThrow(id);
    const isWig = isWig002(session);
    const isTop = !isWig && (await isEquipmentTopViewer(session).catch(() => false));
    if (!isWig && !isTop) {
        if (!session.userId) throw new EquipmentError("Sesi tidak valid.", 401);
        // Yang terlibat = assignee efektif, anggota QC, approver, atau pemulai.
        const today = toWIBDateString();
        const assigned = await prisma.equipmentAssignment.findMany({
            where: { userId: session.userId, OR: [{ unitId: null }, { unitId: insp.unit.id }] },
            orderBy: { startsOnWibDate: "desc" },
        });
        const mine = assigned.some((a) => isEffectiveOn(today, a.startsOnWibDate, a.endsOnWibDate));
        const isQc = session.employeeId !== null && (await isEquipmentQcMember(session).catch(() => false));
        const isApprover = session.employeeId !== null && (await isEquipmentApprover(session).catch(() => false));
        const isStarter = session.employeeId !== null && insp.startedByEmployeeId === session.employeeId;
        if (!mine && !isQc && !isApprover && !isStarter) throw new EquipmentError("Anda tidak terlibat inspeksi ini.", 403);
    }
    return toInspectionDto(insp);
}

export async function getMyEquipmentInspections(session: SessionPayload, status?: string): Promise<EquipmentInspectionDto[]> {
    if (!session.employeeId) throw new EquipmentError("Hanya karyawan yang dapat melihat inspeksi.", 403);
    const rows = await prisma.equipmentInspection.findMany({
        where: {
            startedByEmployeeId: session.employeeId,
            ...(status ? { status: status as "OPEN" | "SUBMITTED" | "DONE" | "APPROVED" } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: inspectionInclude,
    });
    return rows.map(toInspectionDto);
}

/**
 * Riwayat inspeksi per unit untuk karyawan yang ditugaskan di unit itu
 * (melihat kerja employee lain, read-only). QC/topViewer/WIG002 juga boleh.
 * Header ringan — detail penuh via getEquipmentInspection.
 */
export async function getUnitInspectionHistory(session: SessionPayload, unitId: string) {
    if (!session.employeeId || !session.userId) throw new EquipmentError("Hanya karyawan yang dapat melihat riwayat unit.", 403);
    const today = toWIBDateString();
    const [isQc, isTop] = await Promise.all([
        isEquipmentQcMember(session).catch(() => false),
        isEquipmentTopViewer(session).catch(() => false),
    ]);
    const assignments = await prisma.equipmentAssignment.findMany({
        where: { userId: session.userId },
        select: { unitId: true, startsOnWibDate: true, endsOnWibDate: true },
    });
    const assigned = assignments.some(
        (a) => (a.unitId === null || a.unitId === unitId) && isEffectiveOn(today, a.startsOnWibDate, a.endsOnWibDate)
    );
    if (!isWig002(session) && !isTop && !isQc && !assigned) {
        throw new EquipmentError("Anda tidak ditugaskan pada unit ini.", 403);
    }
    const rows = await prisma.equipmentInspection.findMany({
        where: { unitId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
            id: true,
            status: true,
            createdAt: true,
            submittedAt: true,
            checkedAt: true,
            approvedAt: true,
            unit: { select: { id: true, name: true, brand: true, location: true } },
            startedBy: { select: { employeeId: true, name: true } },
            checkedByNameSnapshot: true,
            approvedByNameSnapshot: true,
        },
    });
    return rows;
}

export async function getPendingEquipmentApprovals(session: SessionPayload): Promise<EquipmentInspectionDto[]> {
    // Wadah QC: semua anggota QC melihat semua inspeksi SUBMITTED, terbaru di atas.
    // QC tak perlu melihat 64 alat — hanya yang disubmit produksi.
    await requireQcMember(session);
    const rows = await prisma.equipmentInspection.findMany({
        where: { status: "SUBMITTED" },
        orderBy: { submittedAt: "desc" },
        take: 100,
        include: inspectionInclude,
    });
    return rows.map(toInspectionDto);
}

/**
 * Antrean approval final: DONE terbaru di atas, khusus approver.
 * Kuorum 1 — siapa pun di daftar yang menyetujui lebih dulu mengunci.
 * Mendukung filter riwayat agar approver bisa melihat hari sebelumnya:
 * - status DONE (default): tanggal = checkedAt (masuk antrean)
 * - status APPROVED: tanggal = approvedAt (riwayat disetujui)
 * - status ALL: tanggal = checkedAt ATAU approvedAt (digabung via OR)
 * from/to inklusif YYYY-MM-DD WIB; tanpa filter tanggal = semua backlog.
 */
export interface ApprovalQueueFilters {
    from?: string;
    to?: string;
    status?: "DONE" | "APPROVED" | "ALL";
}

export async function getApprovalQueue(session: SessionPayload, filters: ApprovalQueueFilters = {}): Promise<EquipmentInspectionDto[]> {
    await requireApprover(session);
    const status = filters.status ?? "DONE";
    if (status !== "DONE" && status !== "APPROVED" && status !== "ALL") {
        throw new EquipmentError("Status antrean tidak valid.", 400);
    }
    const from = filters.from?.trim() ? filters.from.trim() : undefined;
    const to = filters.to?.trim() ? filters.to.trim() : undefined;
    if (from !== undefined && !isValidCalendarDate(from)) {
        throw new EquipmentError("Tanggal mulai tidak valid (YYYY-MM-DD).", 400);
    }
    if (to !== undefined && !isValidCalendarDate(to)) {
        throw new EquipmentError("Tanggal sampai tidak valid (YYYY-MM-DD).", 400);
    }
    if (from !== undefined && to !== undefined && to < from) {
        throw new EquipmentError("Tanggal sampai harus setelah tanggal mulai.", 400);
    }
    const toExclusive = to !== undefined ? addCalendarDays(to, 1) : undefined;
    const dateRange = (field: "checkedAt" | "approvedAt") =>
        from !== undefined || toExclusive !== undefined
            ? {
                  [field]: {
                      ...(from !== undefined ? { gte: new Date(`${from}T00:00:00+07:00`) } : {}),
                      ...(toExclusive !== undefined ? { lt: new Date(`${toExclusive}T00:00:00+07:00`) } : {}),
                  },
              }
            : {};

    let where: Prisma.EquipmentInspectionWhereInput;
    if (status === "DONE") {
        where = { status: "DONE", ...dateRange("checkedAt") };
    } else if (status === "APPROVED") {
        where = { status: "APPROVED", ...dateRange("approvedAt") };
    } else {
        const rangeActive = from !== undefined || toExclusive !== undefined;
        where = rangeActive
            ? {
                  status: { in: ["DONE", "APPROVED"] },
                  OR: [
                      { status: "DONE", ...dateRange("checkedAt") },
                      { status: "APPROVED", ...dateRange("approvedAt") },
                  ],
              }
            : { status: { in: ["DONE", "APPROVED"] } };
    }
    const orderBy =
        status === "APPROVED"
            ? [{ approvedAt: "desc" as const }, { checkedAt: "desc" as const }]
            : [{ checkedAt: "desc" as const }, { approvedAt: "desc" as const }];
    const rows = await prisma.equipmentInspection.findMany({
        where,
        orderBy,
        take: 100,
        include: inspectionInclude,
    });
    return rows.map(toInspectionDto);
}

export async function updateEquipmentInspectionItem(
    session: SessionPayload,
    itemId: string,
    input: { isPass: boolean; note?: string | null }
): Promise<EquipmentInspectionDto> {
    if (!session.userId || !session.employeeId) throw new EquipmentError("Hanya karyawan yang dapat mengisi.", 403);
    const item = await prisma.equipmentInspectionItem.findUnique({
        where: { id: itemId },
        include: { inspection: { select: { id: true, status: true, unitId: true } } },
    });
    if (!item || !item.isActive) throw new EquipmentError("Item inspeksi tidak ditemukan.", 404);
    if (item.inspection.status !== "OPEN") throw new EquipmentError("Inspeksi sudah dikirim, tidak dapat diubah.", 409);
    const today = toWIBDateString();
    await assertAssignee(prisma, session.userId, item.inspection.unitId, today);
    await prisma.equipmentInspectionItem.update({
        where: { id: itemId },
        data: { isPass: input.isPass, note: input.note?.trim().slice(0, 2000) || null, lastChangedByUserId: session.userId, lastChangedAt: new Date() },
    });
    const insp = await loadInspectionOrThrow(item.inspection.id);
    return toInspectionDto(insp);
}

export async function submitEquipmentInspection(session: SessionPayload, inspectionId: string): Promise<EquipmentInspectionDto> {
    if (!session.userId || !session.employeeId) throw new EquipmentError("Hanya karyawan yang dapat mengirim.", 403);
    const insp = await loadInspectionOrThrow(inspectionId);
    if (insp.status !== "OPEN") throw new EquipmentError("Inspeksi sudah dikirim.", 409);
    const today = toWIBDateString();
    await assertAssignee(prisma, session.userId, insp.unit.id, today);
    const activeItems = insp.items.filter((i) => i.isActive);
    if (activeItems.length === 0) throw new EquipmentError("Inspeksi tidak punya item aktif.", 422);
    const undecided = activeItems.filter((i) => i.isPass === null);
    if (undecided.length > 0) throw new EquipmentError(`${undecided.length} item belum dinilai.`, 422);
    const needsPhoto = activeItems.some((i) => i.requirePhoto);
    if (needsPhoto && insp.evidence.length === 0) {
        throw new EquipmentError("Tambahkan minimal 1 foto dokumentasi dulu.", 422);
    }
    await prisma.$transaction(async (tx) => {
        await tx.equipmentInspection.update({ where: { id: inspectionId }, data: { status: "SUBMITTED", submittedAt: new Date() } });
        await tx.auditLog.create({
            data: {
                action: "SUBMIT_EQUIPMENT_INSPECTION",
                entity: "EQUIPMENT_INSPECTION",
                entityId: inspectionId,
                details: JSON.stringify({ unitId: insp.unit.id }),
                actorType: "USER",
                actorUserId: session.userId ?? null,
                actorIdentifier: session.username,
            },
        });
    });
    return toInspectionDto(await loadInspectionOrThrow(inspectionId));
}

/**
 * QC menandai inspeksi SELESAI (DONE). Tanpa paraf/tanda tangan — cukup klik +
 * catatan opsional. Riwayat mencatat "checked by QC - [nama]".
 */
export async function checkEquipmentDone(
    session: SessionPayload,
    inspectionId: string,
    note?: string | null
): Promise<EquipmentInspectionDto> {
    if (!session.employeeId) throw new EquipmentError("Hanya karyawan QC yang dapat menyelesaikan inspeksi.", 403);
    if (!session.permissions.includes("employee.self")) throw new EquipmentError("Akses ditolak.", 403);
    await requireQcMember(session);
    const insp = await loadInspectionOrThrow(inspectionId);
    if (insp.status !== "SUBMITTED") throw new EquipmentError("Hanya inspeksi yang sudah dikirim yang dapat diselesaikan QC.", 409);
    const today = toWIBDateString();
    const qc = await assertActiveInternalEmployee(prisma, session.employeeId, today);
    const cleanNote = note?.trim().slice(0, 1000) || null;
    await prisma.$transaction(async (tx) => {
        await tx.equipmentInspection.update({
            where: { id: inspectionId },
            data: {
                status: "DONE",
                checkedByEmployeeId: qc.employeeId,
                checkedByNameSnapshot: qc.name,
                checkedAt: new Date(),
                qcNote: cleanNote,
            },
        });
        await tx.auditLog.create({
            data: {
                action: "QC_DONE_EQUIPMENT_INSPECTION",
                entity: "EQUIPMENT_INSPECTION",
                entityId: inspectionId,
                details: JSON.stringify({ unitId: insp.unit.id, checkedBy: qc.employeeId }),
                actorType: "USER",
                actorUserId: session.userId ?? null,
                actorIdentifier: session.username,
            },
        });
    });
    return toInspectionDto(await loadInspectionOrThrow(inspectionId));
}

/**
 * Approver final (atasan lapangan, tunggal, dinamis via setting WIG002)
 * menyetujui inspeksi: DONE → APPROVED. Satu arah, tanpa reject.
 * DONE lama (periode sebelum approval) di-grandfather sebagai final.
 */
export async function approveEquipmentInspection(
    session: SessionPayload,
    inspectionId: string
): Promise<EquipmentInspectionDto> {
    if (!session.employeeId) throw new EquipmentError("Hanya approver yang dapat menyetujui inspeksi.", 403);
    if (!session.permissions.includes("employee.self")) throw new EquipmentError("Akses ditolak.", 403);
    await requireApprover(session);
    const insp = await loadInspectionOrThrow(inspectionId);
    if (insp.status !== "DONE") throw new EquipmentError("Hanya inspeksi yang sudah diperiksa QC yang dapat disetujui.", 409);
    const today = toWIBDateString();
    const approver = await assertActiveInternalEmployee(prisma, session.employeeId, today);
    await prisma.$transaction(async (tx) => {
        await tx.equipmentInspection.update({
            where: { id: inspectionId },
            data: {
                status: "APPROVED",
                approvedByEmployeeId: approver.employeeId,
                approvedByNameSnapshot: approver.name,
                approvedAt: new Date(),
            },
        });
        await tx.auditLog.create({
            data: {
                action: "APPROVE_EQUIPMENT_INSPECTION",
                entity: "EQUIPMENT_INSPECTION",
                entityId: inspectionId,
                details: JSON.stringify({ unitId: insp.unit.id, approvedBy: approver.employeeId }),
                actorType: "USER",
                actorUserId: session.userId ?? null,
                actorIdentifier: session.username,
            },
        });
    });
    return toInspectionDto(await loadInspectionOrThrow(inspectionId));
}

/**
 * Pemulai membatalkan checklist yang masih Berjalan (OPEN → CANCELLED).
 * Baris riwayat dipertahankan (bukan delete) agar audit utuh; yang
 * dibatalkan disembunyikan dari antrean, rekap, dan "terakhir dicek".
 * Foto di disk tidak dihapus (out of scope).
 */
export async function cancelEquipmentInspection(
    session: SessionPayload,
    inspectionId: string
): Promise<EquipmentInspectionDto> {
    if (!session.employeeId) throw new EquipmentError("Hanya pemulai yang dapat membatalkan checklist.", 403);
    const insp = await loadInspectionOrThrow(inspectionId);
    if (insp.startedByEmployeeId !== session.employeeId) {
        throw new EquipmentError("Hanya yang memulai checklist ini yang dapat membatalkannya.", 403);
    }
    if (insp.status !== "OPEN") throw new EquipmentError("Hanya checklist yang masih berjalan yang dapat dibatalkan.", 409);
    await prisma.$transaction(async (tx) => {
        await tx.equipmentInspection.update({
            where: { id: inspectionId },
            data: { status: "CANCELLED" },
        });
        await tx.auditLog.create({
            data: {
                action: "CANCEL_EQUIPMENT_INSPECTION",
                entity: "EQUIPMENT_INSPECTION",
                entityId: inspectionId,
                details: JSON.stringify({ unitId: insp.unit.id }),
                actorType: "USER",
                actorUserId: session.userId ?? null,
                actorIdentifier: session.username,
            },
        });
    });
    return toInspectionDto(await loadInspectionOrThrow(inspectionId));
}

// ─── Evidence foto (satu tempat per inspeksi, maks 5) ──────────────

function resolveEquipmentEvidencePath(filePath: string): string {
    const resolved = path.resolve(EQUIPMENT_EVIDENCE_STORAGE_ROOT, path.normalize(filePath));
    if (!resolved.startsWith(EQUIPMENT_EVIDENCE_STORAGE_ROOT + path.sep)) {
        throw new EquipmentError("Path berkas tidak valid.", 403);
    }
    return resolved;
}

function isJpegBytes(buffer: Buffer): boolean {
    return buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
}

export async function saveEquipmentEvidence(input: {
    inspectionId: string;
    buffer: Buffer;
    mime: string;
    uploaderUserId: string;
    note?: string | null;
}): Promise<{ id: string; filePath: string }> {
    if (input.mime !== "image/jpeg" || !isJpegBytes(input.buffer)) {
        throw new EquipmentError("Foto harus JPEG valid dari kamera.", 400);
    }
    const maxMb = await getUploadLimit("upload.equipmentEvidence.maxMb");
    if (input.buffer.length > maxMb * 1024 * 1024) {
        throw new EquipmentError(`Ukuran foto maksimal ${maxMb} MB.`, 400);
    }
    const insp = await prisma.equipmentInspection.findUnique({
        where: { id: input.inspectionId },
        select: { id: true, status: true, unitId: true },
    });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    if (insp.status !== "OPEN") throw new EquipmentError("Inspeksi sudah dikirim, foto tidak dapat ditambah.", 409);
    await assertAssignee(prisma, input.uploaderUserId, insp.unitId, toWIBDateString());
    const created = await prisma.$transaction(async (tx) => {
        const count = await tx.equipmentInspectionEvidence.count({ where: { inspectionId: input.inspectionId } });
        if (count >= EQUIPMENT_EVIDENCE_MAX_PHOTOS) {
            throw new EquipmentError(`Maksimal ${EQUIPMENT_EVIDENCE_MAX_PHOTOS} foto per inspeksi.`, 409);
        }
        const fileName = `${randomUUID()}.jpg`;
        const dir = path.join(EQUIPMENT_EVIDENCE_STORAGE_ROOT, input.inspectionId);
        await mkdir(dir, { recursive: true });
        const filePath = path.join(dir, fileName);
        await writeFile(filePath, input.buffer, { flag: "wx" });
        const hash = createHash("sha256").update(input.buffer).digest("hex");
        try {
            return await tx.equipmentInspectionEvidence.create({
                data: {
                    inspectionId: input.inspectionId,
                    filePath: path.join(input.inspectionId, fileName),
                    mimeType: "image/jpeg",
                    size: input.buffer.length,
                    sha256: hash,
                    capturedAt: new Date(),
                    uploadedByUserId: input.uploaderUserId,
                    note: input.note?.trim().slice(0, 500) || null,
                },
            });
        } catch (err) {
            await import("node:fs/promises").then((fs) => fs.unlink(filePath).catch(() => undefined));
            throw err;
        }
    });
    return { id: created.id, filePath: created.filePath };
}

export async function hasEquipmentEvidenceAccess(
    session: SessionPayload,
    evidence: { inspectionId: string }
): Promise<boolean> {
    if (isWig002(session)) return true;
    if (!session.userId) return false;
    const insp = await prisma.equipmentInspection.findUnique({
        where: { id: evidence.inspectionId },
        select: { id: true, unitId: true, startedByEmployeeId: true },
    });
    if (!insp) return false;
    if (await isEquipmentTopViewer(session).catch(() => false)) return true;
    if (session.employeeId && (await isEquipmentQcMember(session).catch(() => false))) return true;
    // Mode bebas: pemulai atau karyawan internal aktif mana pun boleh lihat.
    if (session.employeeId && insp.startedByEmployeeId === session.employeeId) return true;
    const today = toWIBDateString();
    try {
        await assertAssignee(prisma, session.userId, insp.unitId, today);
        return true;
    } catch {
        return false;
    }
}

export async function listEquipmentEvidenceForGA(inspectionId: string) {
    const insp = await prisma.equipmentInspection.findUnique({ where: { id: inspectionId }, select: { id: true } });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    return prisma.equipmentInspectionEvidence.findMany({
        where: { inspectionId },
        orderBy: { capturedAt: "asc" },
        select: { id: true, filePath: true, note: true, capturedAt: true, size: true },
    });
}

export async function listEquipmentEvidenceByInspection(session: SessionPayload, inspectionId: string) {
    const insp = await prisma.equipmentInspection.findUnique({
        where: { id: inspectionId },
        select: { id: true, startedByEmployeeId: true },
    });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    const isWig = isWig002(session);
    const isTop = !isWig && (await isEquipmentTopViewer(session).catch(() => false));
    if (!isWig && !isTop) {
        if (!session.userId) throw new EquipmentError("Sesi tidak valid.", 401);
        // Terlibat = anggota QC, pemulai, atau karyawan internal aktif.
        const isStarter = !!session.employeeId && insp.startedByEmployeeId === session.employeeId;
        const isQc = await isEquipmentQcMember(session).catch(() => false);
        const isActive = await requireActiveInternalEmployee(session).then(() => true).catch(() => false);
        if (!isStarter && !isQc && !isActive) {
            throw new EquipmentError("Anda tidak terlibat inspeksi ini.", 403);
        }
    }
    return prisma.equipmentInspectionEvidence.findMany({
        where: { inspectionId },
        orderBy: { capturedAt: "asc" },
        select: { id: true, filePath: true, note: true, capturedAt: true, size: true },
    });
}

export async function readEquipmentEvidenceFile(session: SessionPayload, evidenceId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const row = await prisma.equipmentInspectionEvidence.findUnique({ where: { id: evidenceId } });
    if (!row) throw new EquipmentError("Bukti foto tidak ditemukan.", 404);
    const allowed = await hasEquipmentEvidenceAccess(session, { inspectionId: row.inspectionId });
    if (!allowed) throw new EquipmentError("Anda tidak memiliki akses ke bukti ini.", 403);
    const buffer = await readFile(resolveEquipmentEvidencePath(row.filePath));
    return { buffer, mimeType: row.mimeType };
}

// ─── Foto QC (opsional, per inspeksi) ───────────────────────────────

function resolveQcEvidencePath(filePath: string): string {
    const resolved = path.resolve(EQUIPMENT_QC_EVIDENCE_STORAGE_ROOT, path.normalize(filePath));
    if (!resolved.startsWith(EQUIPMENT_QC_EVIDENCE_STORAGE_ROOT + path.sep)) {
        throw new EquipmentError("Path berkas tidak valid.", 403);
    }
    return resolved;
}

export async function saveQcEvidence(input: {
    inspectionId: string;
    buffer: Buffer;
    mime: string;
    uploaderUserId: string;
    note?: string | null;
}): Promise<{ id: string; filePath: string }> {
    if (input.mime !== "image/jpeg" || !isJpegBytes(input.buffer)) {
        throw new EquipmentError("Foto harus JPEG valid dari kamera.", 400);
    }
    const maxMb = await getUploadLimit("upload.equipmentEvidence.maxMb");
    if (input.buffer.length > maxMb * 1024 * 1024) {
        throw new EquipmentError(`Ukuran foto maksimal ${maxMb} MB.`, 400);
    }
    const insp = await prisma.equipmentInspection.findUnique({ where: { id: input.inspectionId }, select: { id: true, status: true } });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    if (insp.status !== "SUBMITTED") throw new EquipmentError("Foto QC hanya dapat ditambah saat inspeksi menunggu QC.", 409);
    const created = await prisma.$transaction(async (tx) => {
        const count = await tx.equipmentQcEvidence.count({ where: { inspectionId: input.inspectionId } });
        if (count >= EQUIPMENT_QC_EVIDENCE_MAX_PHOTOS) {
            throw new EquipmentError(`Maksimal ${EQUIPMENT_QC_EVIDENCE_MAX_PHOTOS} foto QC per inspeksi.`, 409);
        }
        const fileName = `${randomUUID()}.jpg`;
        const dir = path.join(EQUIPMENT_QC_EVIDENCE_STORAGE_ROOT, input.inspectionId);
        await mkdir(dir, { recursive: true });
        const filePath = path.join(dir, fileName);
        await writeFile(filePath, input.buffer, { flag: "wx" });
        const hash = createHash("sha256").update(input.buffer).digest("hex");
        try {
            return await tx.equipmentQcEvidence.create({
                data: {
                    inspectionId: input.inspectionId,
                    filePath: path.join(input.inspectionId, fileName),
                    mimeType: "image/jpeg",
                    size: input.buffer.length,
                    sha256: hash,
                    capturedAt: new Date(),
                    uploadedByUserId: input.uploaderUserId,
                    note: input.note?.trim().slice(0, 500) || null,
                },
            });
        } catch (err) {
            await import("node:fs/promises").then((fs) => fs.unlink(filePath).catch(() => undefined));
            throw err;
        }
    });
    return { id: created.id, filePath: created.filePath };
}

export async function hasQcEvidenceAccess(session: SessionPayload, inspectionId: string): Promise<boolean> {
    if (isWig002(session)) return true;
    if (!session.userId) return false;
    if (await isEquipmentTopViewer(session).catch(() => false)) return true;
    if (await isEquipmentQcMember(session).catch(() => false)) return true;
    const insp = await prisma.equipmentInspection.findUnique({
        where: { id: inspectionId },
        select: { unitId: true, startedByEmployeeId: true },
    });
    if (!insp) return false;
    if (session.employeeId && insp.startedByEmployeeId === session.employeeId) return true;
    try {
        await requireActiveInternalEmployee(session);
        return true;
    } catch {
        return false;
    }
}

export async function listQcEvidence(inspectionId: string) {
    const insp = await prisma.equipmentInspection.findUnique({ where: { id: inspectionId }, select: { id: true } });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    return prisma.equipmentQcEvidence.findMany({
        where: { inspectionId },
        orderBy: { capturedAt: "asc" },
        select: { id: true, filePath: true, note: true, capturedAt: true, size: true },
    });
}

export async function listQcEvidenceFor(session: SessionPayload, inspectionId: string) {
    if (!(await hasQcEvidenceAccess(session, inspectionId))) {
        throw new EquipmentError("Anda tidak terlibat inspeksi ini.", 403);
    }
    return listQcEvidence(inspectionId);
}

export async function readQcEvidenceFile(session: SessionPayload, evidenceId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const row = await prisma.equipmentQcEvidence.findUnique({ where: { id: evidenceId } });
    if (!row) throw new EquipmentError("Foto QC tidak ditemukan.", 404);
    if (!(await hasQcEvidenceAccess(session, row.inspectionId))) {
        throw new EquipmentError("Anda tidak memiliki akses ke foto ini.", 403);
    }
    const buffer = await readFile(resolveQcEvidencePath(row.filePath));
    return { buffer, mimeType: row.mimeType };
}

// ─── Util ─────────────────────────────────────────────────────────

function isPrismaUniqueViolation(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002";
}

async function logCreated(
    action: string,
    entity: string,
    entityId: string,
    session: SessionPayload,
    details: Record<string, unknown>
): Promise<void> {
    const actor = actorFromSession(session);
    await prisma.auditLog
        .create({
            data: {
                action,
                entity,
                entityId,
                details: JSON.stringify(details),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.identifier,
                actorName: actor.name ?? null,
                actorRole: actor.role ?? null,
            },
        })
        .catch((err) => logger.error("equipment audit gagal", { err }));
}

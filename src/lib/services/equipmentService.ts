import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { toWIBDateString, isValidCalendarDate, addCalendarDays } from "@/lib/timezone";
import type { SessionPayload } from "@/lib/auth";
import type { Prisma, EquipmentCompany } from "@prisma/client";
import { actorFromSession } from "@/lib/services/auditService";
import { PERMISSIONS } from "@/lib/permissions";
import {
    EQUIPMENT_SETTINGS_DELEGATES_KEY,
    EQUIPMENT_SETTINGS_DELEGATES_MAX,
    EQUIPMENT_SETTINGS_SCOPES,
    extractOsUserIdFromToken,
    hasEmployeePortalAccess,
    hasEquipmentPortalAccess,
    isEquipmentMasterAdmin as isWig002,
    isEquipmentSettingsScope,
    normalizeEquipmentName as normalizeName,
    toOsActorToken,
    type EquipmentSettingsScope,
} from "@/lib/services/equipmentAuth";
import {
    OutsourceUserError,
    assertActiveOutsourceWithPermission,
} from "@/lib/services/outsourceUserService";
import { getUploadLimit } from "@/lib/services/appSettingsService";

// ─── Error ────────────────────────────────────────────────────────

export class EquipmentError extends Error {
    constructor(message: string, public statusCode: number = 400) {
        super(message);
        this.name = "EquipmentError";
    }
}

// ─── Konstanta ────────────────────────────────────────────────────

export const EQUIPMENT_QC_MEMBERS_MAX = 20;
export const EQUIPMENT_TOP_VIEWERS_KEY = "equipment.topViewers" as const;
export const EQUIPMENT_TOP_VIEWERS_MAX = 5;
/** Approver final inspeksi alat (dinamis maks 5 per perusahaan, di-set WIG002). */
export const EQUIPMENT_APPROVERS_MAX = 5;
/** Perusahaan yang dikenal modul equipment (sama dengan enum EquipmentCompany). */
export const EQUIPMENT_COMPANIES: EquipmentCompany[] = ["WIG", "MKI"];

/**
 * Kembalikan daftar perusahaan yang memiliki/memakai unit alat:
 * - `[]` bila belum dikategorikan (`company === null`)
 * - `["WIG", "MKI"]` bila dipakai kedua perusahaan (`isSharedBoth === true` dan `company !== null`)
 * - `[unit.company]` bila hanya 1 perusahaan (`WIG` atau `MKI`)
 */
export function getUnitCompanies(
    unit: { company?: EquipmentCompany | null; isSharedBoth?: boolean | null; companies?: EquipmentCompany[] | null } | null | undefined
): EquipmentCompany[] {
    if (!unit) return [];
    if (Array.isArray(unit.companies) && unit.companies.length > 0) {
        return EQUIPMENT_COMPANIES.filter((c) => unit.companies!.includes(c));
    }
    if (!unit.company) return [];
    if (unit.isSharedBoth) return [...EQUIPMENT_COMPANIES];
    return [unit.company];
}

export function withUnitCompanies<T extends { company?: EquipmentCompany | null; isSharedBoth?: boolean | null }>(
    unit: T
): T & { companies: EquipmentCompany[] } {
    return {
        ...unit,
        companies: getUnitCompanies(unit),
    };
}

/** Filter Prisma EquipmentUnit untuk 1 perusahaan (mencakup unit eksklusif maupun unit WIG+MKI). */
export function unitWhereForCompany(company: EquipmentCompany): Prisma.EquipmentUnitWhereInput {
    return {
        OR: [
            { company },
            { company: { not: null }, isSharedBoth: true },
        ],
    };
}

/** Filter Prisma EquipmentUnit untuk daftar perusahaan dalam cakupan sesi. */
export function unitWhereForCompanies(companies: EquipmentCompany[]): Prisma.EquipmentUnitWhereInput {
    const unique = EQUIPMENT_COMPANIES.filter((c) => companies.includes(c));
    if (unique.length === 0) return { id: { in: [] } };
    if (unique.length >= EQUIPMENT_COMPANIES.length) {
        return { company: { in: [...EQUIPMENT_COMPANIES] } };
    }
    return unitWhereForCompany(unique[0]);
}

/** Key AppSetting daftar QC per perusahaan (migrasi eksplisit, tanpa fallback). */
function qcMembersKey(company: EquipmentCompany): string {
    return `equipment.qcMembers.${company}`;
}

/** Key AppSetting daftar approver per perusahaan (migrasi eksplisit, tanpa fallback). */
function approversKey(company: EquipmentCompany): string {
    return `equipment.approvers.${company}`;
}
const EQUIPMENT_EVIDENCE_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "equipment-evidence");
const EQUIPMENT_QC_EVIDENCE_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "equipment-qc-evidence");
const EQUIPMENT_EVIDENCE_MAX_PHOTOS = 5;
const EQUIPMENT_QC_EVIDENCE_MAX_PHOTOS = 5;
const SETTING_CACHE_TTL_MS = 60_000;

const qcMembersCache = new Map<EquipmentCompany, { value: string[]; expiresAt: number }>();

export function invalidateEquipmentQcMembersCache(company?: EquipmentCompany): void {
    if (company) qcMembersCache.delete(company);
    else qcMembersCache.clear();
}

/** Daftar employee QC per perusahaan (di-set WIG002 dari data HR). Pool per perusahaan: semua anggota melihat semua antrean perusahaannya. */
export async function getEquipmentQcMemberIds(company: EquipmentCompany): Promise<string[]> {
    const cached = qcMembersCache.get(company);
    if (cached && Date.now() <= cached.expiresAt) return cached.value;
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: qcMembersKey(company) } });
        if (!row?.value) {
            qcMembersCache.set(company, { value: [], expiresAt: Date.now() + SETTING_CACHE_TTL_MS });
            return [];
        }
        const parsed = JSON.parse(row.value) as unknown;
        const value = Array.isArray(parsed)
            ? [...new Set(parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))].slice(0, EQUIPMENT_QC_MEMBERS_MAX)
            : [];
        qcMembersCache.set(company, { value, expiresAt: Date.now() + SETTING_CACHE_TTL_MS });
        return value;
    } catch {
        return [];
    }
}

export interface EquipmentRosterActor {
    employeeId: string;
    name: string | null;
    isActive: boolean;
    email: string | null;
    isOutsource?: boolean;
    username?: string | null;
}

async function hydrateEquipmentRosterActors(ids: string[]): Promise<EquipmentRosterActor[]> {
    if (ids.length === 0) return [];
    const empIds: string[] = [];
    const osUserIds: string[] = [];
    for (const id of ids) {
        const osId = extractOsUserIdFromToken(id);
        if (osId) osUserIds.push(osId);
        else empIds.push(id);
    }

    const [employees, osUsers] = await Promise.all([
        empIds.length > 0
            ? prisma.employee.findMany({
                  where: { employeeId: { in: empIds } },
                  select: { employeeId: true, name: true, isActive: true, email: true },
              })
            : Promise.resolve([]),
        osUserIds.length > 0
            ? prisma.userAccount.findMany({
                  where: { id: { in: osUserIds } },
                  select: { id: true, username: true, displayName: true, isActive: true, email: true },
              })
            : Promise.resolve([]),
    ]);

    const byToken = new Map<string, EquipmentRosterActor>();
    for (const emp of employees) {
        byToken.set(emp.employeeId, {
            employeeId: emp.employeeId,
            name: emp.name,
            isActive: emp.isActive,
            email: emp.email,
            isOutsource: false,
            username: null,
        });
    }
    for (const user of osUsers) {
        const token = toOsActorToken(user.id);
        byToken.set(token, {
            employeeId: token,
            name: user.displayName,
            isActive: user.isActive,
            email: user.email,
            isOutsource: true,
            username: user.username,
        });
    }

    return ids.map((id) => byToken.get(id)).filter((item): item is EquipmentRosterActor => Boolean(item));
}

async function assertEquipmentRosterActor(
    id: string,
    today: string,
    osPermission: typeof PERMISSIONS.EQUIPMENT_QC | typeof PERMISSIONS.EQUIPMENT_APPROVE,
    osLabel: string
): Promise<void> {
    const osUserId = extractOsUserIdFromToken(id);
    if (osUserId) {
        try {
            await assertActiveOutsourceWithPermission(prisma, osUserId, osPermission, osLabel);
            return;
        } catch (err) {
            if (err instanceof OutsourceUserError) {
                throw new EquipmentError(err.message, err.statusCode);
            }
            throw err;
        }
    }
    await assertActiveInternalEmployee(prisma, id, today);
}

export async function getEquipmentQcMembers(company: EquipmentCompany): Promise<EquipmentRosterActor[]> {
    const ids = await getEquipmentQcMemberIds(company);
    return hydrateEquipmentRosterActors(ids);
}

export async function getEquipmentQcMembersForAdmin(
    session: SessionPayload,
    company: EquipmentCompany
): Promise<EquipmentRosterActor[]> {
    await requireEquipmentSettingsScope(session, "assignments");
    return getEquipmentQcMembers(company);
}

/** Gabungan anggota QC semua perusahaan (untuk roster email rekap global). */
export async function getAllEquipmentQcMembers(): Promise<EquipmentRosterActor[]> {
    const [wig, mki] = await Promise.all([getEquipmentQcMembers("WIG"), getEquipmentQcMembers("MKI")]);
    const seen = new Set<string>();
    return [...wig, ...mki].filter((m) => (seen.has(m.employeeId) ? false : (seen.add(m.employeeId), true)));
}

export async function setEquipmentQcMembers(
    session: SessionPayload,
    company: EquipmentCompany,
    employeeIds: string[],
    actor: { userId?: string | null; username: string }
): Promise<string[]> {
    await requireEquipmentSettingsScope(session, "assignments");
    const ids = [...new Set(employeeIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length > EQUIPMENT_QC_MEMBERS_MAX) {
        throw new EquipmentError(`Anggota QC ${company} maksimal ${EQUIPMENT_QC_MEMBERS_MAX} orang.`, 409);
    }
    if (!isWig002(session) && session.employeeId && ids.includes(session.employeeId)) {
        const existingIds = await getEquipmentQcMemberIds(company);
        if (!existingIds.includes(session.employeeId)) {
            throw new EquipmentError("PIC delegasi tidak dapat menambahkan dirinya sendiri sebagai anggota QC.", 403);
        }
    }
    const today = toWIBDateString();
    for (const id of ids) {
        await assertEquipmentRosterActor(id, today, PERMISSIONS.EQUIPMENT_QC, "QC Inspeksi Alat");
    }
    await prisma.appSetting.upsert({
        where: { key: qcMembersKey(company) },
        update: { value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
        create: { key: qcMembersKey(company), value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
    });
    invalidateEquipmentQcMembersCache(company);
    await logCreated("SET_EQUIPMENT_QC_MEMBERS", "EQUIPMENT_SETTINGS", qcMembersKey(company), session, {
        company,
        count: ids.length,
    });
    return ids;
}

/** true bila sesi milik anggota QC aktif perusahaan tersebut (karyawan internal ATAU akun OS ber-izin equipment.qc). */
export async function isEquipmentQcMember(session: SessionPayload, company: EquipmentCompany): Promise<boolean> {
    try {
        const ids = await getEquipmentQcMemberIds(company);
        if (session.employeeId) {
            if (!ids.includes(session.employeeId)) return false;
            const emp = await prisma.employee.findUnique({ where: { employeeId: session.employeeId }, select: { isActive: true } });
            return emp?.isActive === true;
        }
        if (
            session.userId &&
            session.permissions.includes(PERMISSIONS.OUTSOURCE_PORTAL) &&
            session.permissions.includes(PERMISSIONS.EQUIPMENT_QC)
        ) {
            const token = toOsActorToken(session.userId);
            if (!ids.includes(token)) return false;
            const user = await prisma.userAccount.findUnique({ where: { id: session.userId }, select: { isActive: true } });
            return user?.isActive === true;
        }
        return false;
    } catch {
        return false;
    }
}

/** Perusahaan-perusahaan di mana sesi menjadi anggota QC aktif. */
export async function getEquipmentQcCompanies(session: SessionPayload): Promise<EquipmentCompany[]> {
    if (!session.employeeId && !session.userId) return [];
    const flags = await Promise.all(EQUIPMENT_COMPANIES.map((c) => isEquipmentQcMember(session, c).catch(() => false)));
    return EQUIPMENT_COMPANIES.filter((_, i) => flags[i]);
}

function requireQc(session: SessionPayload): void {
    // Dipakai sinkron di awal; keanggotaan detail dicek async via isEquipmentQcMember.
    if (!session.employeeId && !hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_QC)) {
        throw new EquipmentError("Hanya petugas QC yang dapat memproses antrean.", 403);
    }
}

export async function requireQcMember(session: SessionPayload, company: EquipmentCompany): Promise<void> {
    requireQc(session);
    if (!(await isEquipmentQcMember(session, company))) {
        throw new EquipmentError(`Hanya karyawan QC ${company} yang ditunjuk WIG002 yang dapat memproses antrean.`, 403);
    }
}

export async function requireQcMemberForUnit(
    session: SessionPayload,
    unit: { company?: EquipmentCompany | null; isSharedBoth?: boolean | null; companies?: EquipmentCompany[] | null } | null | undefined
): Promise<void> {
    requireQc(session);
    const unitCompanies = getUnitCompanies(unit);
    if (unitCompanies.length === 0) {
        throw new EquipmentError("Alat belum dikategorikan perusahaan (WIG/MKI).", 422);
    }
    if (unitCompanies.length === 1) {
        await requireQcMember(session, unitCompanies[0]);
        return;
    }
    const flags = await Promise.all(unitCompanies.map((c) => isEquipmentQcMember(session, c).catch(() => false)));
    if (!flags.some(Boolean)) {
        throw new EquipmentError(
            `Hanya karyawan QC (${unitCompanies.join("/")}) yang ditunjuk WIG002 yang dapat memproses antrean.`,
            403
        );
    }
}

/** QC berhak atas inspeksi tertentu: muat perusahaan unitnya lalu cek keanggotaan QC perusahaan itu. */
export async function requireQcMemberForInspection(session: SessionPayload, inspectionId: string): Promise<void> {
    requireQc(session);
    const insp = await prisma.equipmentInspection.findUnique({
        where: { id: inspectionId },
        select: { id: true, unit: { select: { company: true, isSharedBoth: true } } },
    });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    await requireQcMemberForUnit(session, insp.unit);
}

// ─── Guard internal & Delegasi PIC Settings ──────────────────────

export interface EquipmentSettingsDelegateConfig {
    employeeId: string;
    scopes: EquipmentSettingsScope[];
    expiresOnWibDate: string | null;
}

export interface EquipmentSettingsDelegateView extends EquipmentSettingsDelegateConfig {
    name: string | null;
    isActive: boolean;
    isExpired: boolean;
}

function parseDelegateEntries(raw: string | null | undefined): EquipmentSettingsDelegateConfig[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        const seen = new Set<string>();
        const out: EquipmentSettingsDelegateConfig[] = [];
        for (const item of parsed) {
            if (!item || typeof item !== "object") continue;
            const rec = item as Record<string, unknown>;
            const employeeId = typeof rec.employeeId === "string" ? rec.employeeId.trim() : "";
            if (!employeeId || seen.has(employeeId)) continue;
            const rawScopes = Array.isArray(rec.scopes) ? rec.scopes : [];
            const scopes = EQUIPMENT_SETTINGS_SCOPES.filter((s) => rawScopes.includes(s));
            if (scopes.length === 0) continue;
            const rawExp = typeof rec.expiresOnWibDate === "string" ? rec.expiresOnWibDate.trim() : "";
            const expiresOnWibDate = rawExp && isValidCalendarDate(rawExp) ? rawExp : null;
            seen.add(employeeId);
            out.push({ employeeId, scopes, expiresOnWibDate });
            if (out.length >= EQUIPMENT_SETTINGS_DELEGATES_MAX) break;
        }
        return out;
    } catch {
        return [];
    }
}

async function readDelegateConfigs(): Promise<EquipmentSettingsDelegateConfig[]> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: EQUIPMENT_SETTINGS_DELEGATES_KEY } });
        return parseDelegateEntries(row?.value);
    } catch {
        return [];
    }
}

export function requireWig002(session: SessionPayload): void {
    if (!isWig002(session)) throw new EquipmentError("Hanya WIG002 yang dapat mengelola master inspeksi alat.", 403);
}

/**
 * Daftar scope pengaturan Equipment yang aktif untuk sesi saat ini:
 * - WIG002: semua 5 scope (tanpa query DB).
 * - Karyawan PIC delegasi: scope yang ditetapkan WIG002 bila belum kedaluwarsa (inklusif)
 *   DAN karyawan masih internal aktif dengan akun aktif (live check, tanpa cache).
 */
export async function getActiveEquipmentSettingsScopes(session: SessionPayload): Promise<EquipmentSettingsScope[]> {
    if (isWig002(session)) return [...EQUIPMENT_SETTINGS_SCOPES];
    if (!hasEmployeePortalAccess(session) || !session.employeeId) return [];
    const configs = await readDelegateConfigs();
    const entry = configs.find((c) => c.employeeId === session.employeeId);
    if (!entry) return [];
    const today = toWIBDateString();
    if (entry.expiresOnWibDate && today > entry.expiresOnWibDate) return [];
    try {
        await assertActiveInternalEmployee(prisma, session.employeeId, today);
        return entry.scopes;
    } catch {
        return [];
    }
}

export async function hasAnyEquipmentSettingsScope(
    session: SessionPayload,
    requiredAnyOf: EquipmentSettingsScope | readonly EquipmentSettingsScope[]
): Promise<boolean> {
    if (isWig002(session)) return true;
    const needed = typeof requiredAnyOf === "string" ? [requiredAnyOf] : requiredAnyOf;
    if (needed.length === 0) return false;
    const active = await getActiveEquipmentSettingsScopes(session);
    return needed.some((scope) => active.includes(scope));
}

export async function requireEquipmentSettingsScope(
    session: SessionPayload,
    requiredAnyOf: EquipmentSettingsScope | readonly EquipmentSettingsScope[]
): Promise<void> {
    if (await hasAnyEquipmentSettingsScope(session, requiredAnyOf)) return;
    throw new EquipmentError("Anda tidak memiliki akses ke pengaturan peralatan ini.", 403);
}

/** Baca daftar PIC delegasi — ketat WIG002-only (mencegah delegasi transitif). */
export async function getEquipmentSettingsDelegatesForAdmin(
    session: SessionPayload
): Promise<EquipmentSettingsDelegateView[]> {
    requireWig002(session);
    const configs = await readDelegateConfigs();
    if (configs.length === 0) return [];
    const ids = configs.map((c) => c.employeeId);
    const employees = await prisma.employee.findMany({
        where: { employeeId: { in: ids } },
        select: { employeeId: true, name: true, isActive: true },
    });
    const byId = new Map(employees.map((e) => [e.employeeId, e]));
    const today = toWIBDateString();
    return configs.map((c) => {
        const emp = byId.get(c.employeeId);
        return {
            ...c,
            name: emp?.name ?? null,
            isActive: emp?.isActive === true,
            isExpired: Boolean(c.expiresOnWibDate && today > c.expiresOnWibDate),
        };
    });
}

/** Simpan daftar penuh PIC delegasi — ketat WIG002-only. */
export async function setEquipmentSettingsDelegates(
    session: SessionPayload,
    delegates: Array<{ employeeId: string; scopes: EquipmentSettingsScope[]; expiresOnWibDate?: string | null }>,
    actor: { userId?: string | null; username: string }
): Promise<EquipmentSettingsDelegateView[]> {
    requireWig002(session);
    if (delegates.length > EQUIPMENT_SETTINGS_DELEGATES_MAX) {
        throw new EquipmentError(`PIC delegasi maksimal ${EQUIPMENT_SETTINGS_DELEGATES_MAX} orang.`, 409);
    }
    const today = toWIBDateString();
    const seen = new Set<string>();
    const normalized: EquipmentSettingsDelegateConfig[] = [];
    for (const item of delegates) {
        const employeeId = item.employeeId.trim();
        if (!employeeId) throw new EquipmentError("ID karyawan wajib diisi.", 400);
        if (seen.has(employeeId)) throw new EquipmentError(`Karyawan ${employeeId} terduplikasi di daftar PIC.`, 400);
        seen.add(employeeId);

        const scopes = EQUIPMENT_SETTINGS_SCOPES.filter(
            (s) => item.scopes.includes(s) && isEquipmentSettingsScope(s)
        );
        if (scopes.length === 0) {
            throw new EquipmentError(`Pilih minimal satu area pengaturan untuk ${employeeId}.`, 400);
        }

        const rawExp = item.expiresOnWibDate?.trim() || "";
        if (rawExp && !isValidCalendarDate(rawExp)) {
            throw new EquipmentError(`Tanggal kedaluwarsa tidak valid untuk ${employeeId} (YYYY-MM-DD).`, 400);
        }

        await assertActiveInternalEmployee(prisma, employeeId, today);
        normalized.push({ employeeId, scopes, expiresOnWibDate: rawExp || null });
    }

    await prisma.appSetting.upsert({
        where: { key: EQUIPMENT_SETTINGS_DELEGATES_KEY },
        update: { value: JSON.stringify(normalized), updatedByUserId: actor.userId ?? null },
        create: { key: EQUIPMENT_SETTINGS_DELEGATES_KEY, value: JSON.stringify(normalized), updatedByUserId: actor.userId ?? null },
    });
    await logCreated("SET_EQUIPMENT_SETTINGS_DELEGATES", "EQUIPMENT_SETTINGS", EQUIPMENT_SETTINGS_DELEGATES_KEY, session, {
        count: normalized.length,
        delegates: normalized.map((d) => ({ employeeId: d.employeeId, scopes: d.scopes, expiresOnWibDate: d.expiresOnWibDate })),
    });
    return getEquipmentSettingsDelegatesForAdmin(session);
}

async function getEquipmentTopViewerIds(): Promise<string[]> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: EQUIPMENT_TOP_VIEWERS_KEY } });
        if (!row?.value) return [];
        const parsed = JSON.parse(row.value) as unknown;
        if (!Array.isArray(parsed)) return [];
        return [...new Set(parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))].slice(0, EQUIPMENT_TOP_VIEWERS_MAX);
    } catch {
        return [];
    }
}

async function isEquipmentTopViewer(session: SessionPayload): Promise<boolean> {
    if (
        session.permissions.includes(PERMISSIONS.OUTSOURCE_PORTAL) &&
        session.permissions.includes(PERMISSIONS.EQUIPMENT_OVERVIEW)
    ) {
        return true;
    }
    if (!session.employeeId) return false;
    try {
        const ids = await getEquipmentTopViewerIds();
        if (!ids.includes(session.employeeId)) return false;
        const emp = await prisma.employee.findUnique({ where: { employeeId: session.employeeId }, select: { isActive: true } });
        return emp?.isActive === true;
    } catch {
        return false;
    }
}

export async function requireWig002OrTopViewer(session: SessionPayload): Promise<void> {
    if (isWig002(session)) return;
    if (await isEquipmentTopViewer(session)) return;
    throw new EquipmentError("Hanya WIG002 atau atasan yang ditunjuk yang dapat melihat.", 403);
}

/** Baca daftar master unit: WIG002, Top Viewer (rekap), atau PIC delegasi tab unit/produk/penugasan. */
export async function requireEquipmentUnitsReadAccess(session: SessionPayload): Promise<void> {
    if (isWig002(session)) return;
    if (await isEquipmentTopViewer(session)) return;
    if (await hasAnyEquipmentSettingsScope(session, ["units", "products", "assignments"])) return;
    throw new EquipmentError("Anda tidak memiliki akses membaca daftar unit alat.", 403);
}

export async function getEquipmentTopViewers(): Promise<Array<{ employeeId: string; name: string | null; isActive: boolean; email: string | null }>> {
    const ids = await getEquipmentTopViewerIds();
    if (ids.length === 0) return [];
    const employees = await prisma.employee.findMany({
        where: { employeeId: { in: ids } },
        select: { employeeId: true, name: true, isActive: true, email: true },
    });
    const order = new Map(ids.map((id, idx) => [id, idx]));
    return employees.sort((a, b) => (order.get(a.employeeId) ?? 0) - (order.get(b.employeeId) ?? 0));
}

export async function getEquipmentTopViewersForAdmin(
    session: SessionPayload
): Promise<Array<{ employeeId: string; name: string | null; isActive: boolean; email: string | null }>> {
    await requireEquipmentSettingsScope(session, "atasan");
    return getEquipmentTopViewers();
}

export async function setEquipmentTopViewers(
    session: SessionPayload,
    employeeIds: string[],
    actor: { userId?: string | null; username: string }
): Promise<string[]> {
    await requireEquipmentSettingsScope(session, "atasan");
    const ids = [...new Set(employeeIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length > EQUIPMENT_TOP_VIEWERS_MAX) {
        throw new EquipmentError(`Atasan maksimal ${EQUIPMENT_TOP_VIEWERS_MAX} orang.`, 409);
    }
    if (!isWig002(session) && session.employeeId && ids.includes(session.employeeId)) {
        const existingIds = await getEquipmentTopViewerIds();
        if (!existingIds.includes(session.employeeId)) {
            throw new EquipmentError("PIC delegasi tidak dapat menambahkan dirinya sendiri sebagai top reviewer.", 403);
        }
    }
    const today = toWIBDateString();
    for (const id of ids) await assertActiveInternalEmployee(prisma, id, today);
    await prisma.appSetting.upsert({
        where: { key: EQUIPMENT_TOP_VIEWERS_KEY },
        update: { value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
        create: { key: EQUIPMENT_TOP_VIEWERS_KEY, value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
    });
    await logCreated("SET_EQUIPMENT_TOP_VIEWERS", "EQUIPMENT_SETTINGS", EQUIPMENT_TOP_VIEWERS_KEY, session, {
        count: ids.length,
    });
    return ids;
}

/** Daftar approver final per perusahaan (dinamis, di-set WIG002, maks 5). */
export async function getEquipmentApproverIds(company: EquipmentCompany): Promise<string[]> {
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: approversKey(company) } });
        if (!row?.value) return [];
        const parsed = JSON.parse(row.value) as unknown;
        if (!Array.isArray(parsed)) return [];
        return [...new Set(parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))].slice(0, EQUIPMENT_APPROVERS_MAX);
    } catch {
        return [];
    }
}

export async function getEquipmentApprovers(company: EquipmentCompany): Promise<EquipmentRosterActor[]> {
    const ids = await getEquipmentApproverIds(company);
    return hydrateEquipmentRosterActors(ids);
}

export async function getEquipmentApproversForAdmin(
    session: SessionPayload,
    company: EquipmentCompany
): Promise<EquipmentRosterActor[]> {
    await requireEquipmentSettingsScope(session, "atasan");
    return getEquipmentApprovers(company);
}

/** Gabungan approver semua perusahaan (untuk roster email rekap global). */
export async function getAllEquipmentApprovers(): Promise<EquipmentRosterActor[]> {
    const [wig, mki] = await Promise.all([getEquipmentApprovers("WIG"), getEquipmentApprovers("MKI")]);
    const seen = new Set<string>();
    return [...wig, ...mki].filter((m) => (seen.has(m.employeeId) ? false : (seen.add(m.employeeId), true)));
}

export async function getEquipmentApprover(company: EquipmentCompany): Promise<EquipmentRosterActor | null> {
    const list = await getEquipmentApprovers(company);
    return list[0] ?? null;
}

export async function setEquipmentApprovers(
    session: SessionPayload,
    company: EquipmentCompany,
    employeeIds: string[],
    actor: { userId?: string | null; username: string }
): Promise<string[]> {
    await requireEquipmentSettingsScope(session, "atasan");
    const ids = [...new Set(employeeIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length > EQUIPMENT_APPROVERS_MAX) {
        throw new EquipmentError(`Approver ${company} maksimal ${EQUIPMENT_APPROVERS_MAX} orang.`, 409);
    }
    if (!isWig002(session) && session.employeeId && ids.includes(session.employeeId)) {
        const existingIds = await getEquipmentApproverIds(company);
        if (!existingIds.includes(session.employeeId)) {
            throw new EquipmentError("PIC delegasi tidak dapat menambahkan dirinya sendiri sebagai approver final.", 403);
        }
    }
    const today = toWIBDateString();
    for (const id of ids) {
        await assertEquipmentRosterActor(id, today, PERMISSIONS.EQUIPMENT_APPROVE, "Approver Final Alat");
    }
    await prisma.appSetting.upsert({
        where: { key: approversKey(company) },
        update: { value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
        create: { key: approversKey(company), value: JSON.stringify(ids), updatedByUserId: actor.userId ?? null },
    });
    await logCreated("SET_EQUIPMENT_APPROVERS", "EQUIPMENT_SETTINGS", approversKey(company), session, {
        company,
        count: ids.length,
    });
    return ids;
}

export async function setEquipmentApprover(
    session: SessionPayload,
    company: EquipmentCompany,
    employeeId: string,
    actor: { userId?: string | null; username: string }
): Promise<string> {
    const ids = await setEquipmentApprovers(session, company, employeeId.trim() ? [employeeId.trim()] : [], actor);
    return ids[0] ?? "";
}

export async function isEquipmentApprover(session: SessionPayload, company: EquipmentCompany): Promise<boolean> {
    try {
        const ids = await getEquipmentApproverIds(company);
        if (session.employeeId) {
            if (!ids.includes(session.employeeId)) return false;
            const emp = await prisma.employee.findUnique({ where: { employeeId: session.employeeId }, select: { isActive: true } });
            return emp?.isActive === true;
        }
        if (
            session.userId &&
            session.permissions.includes(PERMISSIONS.OUTSOURCE_PORTAL) &&
            session.permissions.includes(PERMISSIONS.EQUIPMENT_APPROVE)
        ) {
            const token = toOsActorToken(session.userId);
            if (!ids.includes(token)) return false;
            const user = await prisma.userAccount.findUnique({ where: { id: session.userId }, select: { isActive: true } });
            return user?.isActive === true;
        }
        return false;
    } catch {
        return false;
    }
}

/** Perusahaan-perusahaan di mana sesi menjadi approver aktif. */
export async function getEquipmentApproverCompanies(session: SessionPayload): Promise<EquipmentCompany[]> {
    if (!session.employeeId && !session.userId) return [];
    const flags = await Promise.all(EQUIPMENT_COMPANIES.map((c) => isEquipmentApprover(session, c).catch(() => false)));
    return EQUIPMENT_COMPANIES.filter((_, i) => flags[i]);
}

export async function requireApprover(session: SessionPayload, company: EquipmentCompany): Promise<void> {
    if (await isEquipmentApprover(session, company)) return;
    throw new EquipmentError(`Hanya approver ${company} yang ditunjuk WIG002 yang dapat menyetujui inspeksi.`, 403);
}

export async function requireApproverForUnit(
    session: SessionPayload,
    unit: { company?: EquipmentCompany | null; isSharedBoth?: boolean | null; companies?: EquipmentCompany[] | null } | null | undefined
): Promise<void> {
    const unitCompanies = getUnitCompanies(unit);
    if (unitCompanies.length === 0) {
        throw new EquipmentError("Alat belum dikategorikan perusahaan (WIG/MKI).", 422);
    }
    if (unitCompanies.length === 1) {
        await requireApprover(session, unitCompanies[0]);
        return;
    }
    const flags = await Promise.all(unitCompanies.map((c) => isEquipmentApprover(session, c).catch(() => false)));
    if (!flags.some(Boolean)) {
        throw new EquipmentError(
            `Hanya approver (${unitCompanies.join("/")}) yang ditunjuk WIG002 yang dapat menyetujui inspeksi.`,
            403
        );
    }
}

async function isQcOrApproverForUnit(
    session: SessionPayload,
    unit: { company?: EquipmentCompany | null; isSharedBoth?: boolean | null; companies?: EquipmentCompany[] | null } | null | undefined
): Promise<{ isQc: boolean; isApprover: boolean }> {
    if (!session.employeeId && !session.userId) return { isQc: false, isApprover: false };
    const unitCompanies = getUnitCompanies(unit);
    if (unitCompanies.length === 0) return { isQc: false, isApprover: false };
    const [qcFlags, approverFlags] = await Promise.all([
        Promise.all(unitCompanies.map((c) => isEquipmentQcMember(session, c).catch(() => false))),
        Promise.all(unitCompanies.map((c) => isEquipmentApprover(session, c).catch(() => false))),
    ]);
    return {
        isQc: qcFlags.some(Boolean),
        isApprover: approverFlags.some(Boolean),
    };
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

export function isEffectiveOn(today: string, startsOn: string, endsOn: string | null): boolean {
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
    await requireEquipmentSettingsScope(session, ["templates", "units"]);
    return prisma.equipmentTemplate.findMany({
        orderBy: { name: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } }, _count: { select: { units: true } } },
    });
}

export async function createEquipmentTemplate(session: SessionPayload, name: string) {
    await requireEquipmentSettingsScope(session, "templates");
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
    await requireEquipmentSettingsScope(session, "templates");
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
    await requireEquipmentSettingsScope(session, "templates");
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
    await requireEquipmentSettingsScope(session, "templates");
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
    await requireEquipmentSettingsScope(session, "templates");
    const existing = await prisma.equipmentTemplateItem.findUnique({ where: { id } });
    if (!existing) throw new EquipmentError("Item template tidak ditemukan.", 404);
    // Snapshot riwayat dipertahankan (templateItemId di-set null otomatis).
    await prisma.equipmentTemplateItem.delete({ where: { id } });
    return { success: true };
}

// ─── Unit ─────────────────────────────────────────────────────────

export async function getEquipmentUnits(session: SessionPayload, activeOnly = false) {
    // Baca master boleh WIG002, top reviewer (rekap), atau PIC delegasi unit/produk/penugasan.
    await requireEquipmentUnitsReadAccess(session);
    const rows = await prisma.equipmentUnit.findMany({
        where: activeOnly ? { isActive: true } : {},
        orderBy: { name: "asc" },
        include: {
            template: { select: { id: true, name: true } },
            _count: { select: { assignments: true, inspections: true } },
        },
    });
    return rows.map((u) => withUnitCompanies(u));
}

export interface EquipmentUnitInput {
    name: string;
    brand?: string | null;
    location?: string | null;
    templateId: string;
    company?: EquipmentCompany | null;
    companies?: EquipmentCompany[] | null;
}

function normalizeInputCompanies(input: {
    company?: EquipmentCompany | null;
    companies?: EquipmentCompany[] | null;
}): { defined: boolean; companies: EquipmentCompany[]; company: EquipmentCompany | null; isSharedBoth: boolean } {
    if (input.companies !== undefined) {
        const raw = Array.isArray(input.companies) ? input.companies : [];
        const companies = EQUIPMENT_COMPANIES.filter((c) => raw.includes(c));
        if (companies.length === 0) {
            return { defined: true, companies: [], company: null, isSharedBoth: false };
        }
        if (companies.length >= 2) {
            return { defined: true, companies: ["WIG", "MKI"], company: "WIG", isSharedBoth: true };
        }
        return { defined: true, companies: [companies[0]], company: companies[0], isSharedBoth: false };
    }
    if (input.company !== undefined) {
        if (input.company === null) {
            return { defined: true, companies: [], company: null, isSharedBoth: false };
        }
        return { defined: true, companies: [input.company], company: input.company, isSharedBoth: false };
    }
    return { defined: false, companies: [], company: null, isSharedBoth: false };
}

export async function createEquipmentUnit(session: SessionPayload, input: EquipmentUnitInput) {
    await requireEquipmentSettingsScope(session, "units");
    const clean = normalizeName(input.name);
    if (!clean) throw new EquipmentError("Nama alat wajib diisi.", 400);
    const template = await prisma.equipmentTemplate.findUnique({ where: { id: input.templateId } });
    if (!template || !template.isActive) throw new EquipmentError("Template tidak ditemukan atau nonaktif.", 422);
    const norm = normalizeInputCompanies(input);
    try {
        const created = await prisma.equipmentUnit.create({
            data: {
                name: input.name.trim(),
                nameNormalized: clean,
                brand: input.brand?.trim() || null,
                location: input.location?.trim() || null,
                templateId: input.templateId,
                company: norm.defined ? norm.company : (input.company ?? null),
                ...(norm.isSharedBoth ? { isSharedBoth: true } : {}),
            },
        });
        await logCreated("CREATE_EQUIPMENT_UNIT", "EQUIPMENT_UNIT", created.id, session, {
            name: created.name,
            companies: getUnitCompanies(created),
        });
        return withUnitCompanies(created);
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama alat sudah dipakai.", 409);
        throw err;
    }
}

export async function updateEquipmentUnit(session: SessionPayload, id: string, input: Partial<EquipmentUnitInput> & { isActive?: boolean }) {
    await requireEquipmentSettingsScope(session, "units");
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

    const prevCompanies = getUnitCompanies(existing);
    const norm = normalizeInputCompanies(input);
    const isCompanyChanged =
        norm.defined &&
        (prevCompanies.length !== norm.companies.length || prevCompanies.some((c, idx) => c !== norm.companies[idx]));

    if (isCompanyChanged) {
        const nextCompanies = norm.companies;
        const removedCompanies = prevCompanies.filter((c) => !nextCompanies.includes(c));
        // Menambah perusahaan (mis. NULL → WIG, atau WIG → WIG+MKI) selalu boleh tanpa ganggu inspeksi/produk yang ada.
        // Menghapus semua perusahaan / pindah penuh ke perusahaan lain ditolak bila masih ada inspeksi berjalan.
        const lostAllPrevious = prevCompanies.length > 0 && !prevCompanies.some((c) => nextCompanies.includes(c));
        if (lostAllPrevious) {
            const running = await prisma.equipmentInspection.count({
                where: { unitId: id, status: { in: ["OPEN", "SUBMITTED"] } },
            });
            if (running > 0) {
                throw new EquipmentError("Unit masih punya inspeksi berjalan. Selesaikan dulu sebelum pindah perusahaan.", 409);
            }
        }
        // Bila ada perusahaan yang dilepas dari unit, pastikan unit tidak masih terpetakan ke produk milik perusahaan yang dilepas tersebut.
        if (removedCompanies.length > 0) {
            const conflict = nextCompanies.length === 0
                ? await prisma.equipmentProductTool.findFirst({ where: { equipmentUnitId: id }, select: { id: true } })
                : await prisma.equipmentProductTool.findFirst({
                      where: {
                          equipmentUnitId: id,
                          product: nextCompanies.length === 1
                              ? { company: { not: nextCompanies[0] } }
                              : { company: { in: removedCompanies } },
                      },
                      select: { id: true },
                  });
            if (conflict) {
                throw new EquipmentError(
                    nextCompanies.length === 0
                        ? "Alat masih terpetakan ke produk. Lepas dulu pemetaannya sebelum mengosongkan perusahaan."
                        : `Alat masih terpetakan ke produk perusahaan lain (${removedCompanies.join("/")}). Lepas dulu pemetaannya sebelum mengubah cakupan perusahaan.`,
                    409
                );
            }
        }
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
    if (norm.defined) {
        data.company = norm.company;
        if (norm.isSharedBoth || Boolean((existing as { isSharedBoth?: boolean }).isSharedBoth) || input.companies !== undefined) {
            data.isSharedBoth = norm.isSharedBoth;
        }
    }
    try {
        const updated = await prisma.equipmentUnit.update({ where: { id }, data });
        return withUnitCompanies(updated);
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama alat sudah dipakai.", 409);
        throw err;
    }
}

// ─── Unit untuk checklist (hanya yang ditugaskan) ────────────────────

function normalizeStartedBy(row: {
    startedBy?: { employeeId: string; name: string } | null;
    startedByUser?: { username: string; displayName: string } | null;
    startedByEmployeeId?: string | null;
    startedByUserId?: string | null;
    startedByNameSnapshot?: string | null;
}): { employeeId: string; name: string; isOutsource: boolean } {
    if (row.startedBy) {
        return { employeeId: row.startedBy.employeeId, name: row.startedBy.name, isOutsource: false };
    }
    return {
        employeeId: row.startedByEmployeeId ?? row.startedByUser?.username ?? row.startedByUserId ?? "OS",
        name: row.startedByNameSnapshot ?? row.startedByUser?.displayName ?? "Petugas Outsource",
        isOutsource: !row.startedByEmployeeId,
    };
}

function isStarterOfInspection(
    session: SessionPayload,
    insp: { startedByEmployeeId?: string | null; startedByUserId?: string | null }
): boolean {
    if (session.userId && insp.startedByUserId && insp.startedByUserId === session.userId) return true;
    if (session.employeeId && insp.startedByEmployeeId && insp.startedByEmployeeId === session.employeeId) return true;
    return false;
}

async function resolveAssigneeUserId(
    input: { employeeId?: string; userId?: string },
    today: string
): Promise<string> {
    if (input.userId && !input.employeeId) {
        try {
            const os = await assertActiveOutsourceWithPermission(
                prisma,
                input.userId,
                PERMISSIONS.EQUIPMENT_EXECUTE,
                "Eksekusi Inspeksi Alat"
            );
            return os.userId;
        } catch (err) {
            if (err instanceof OutsourceUserError) throw new EquipmentError(err.message, err.statusCode);
            throw err;
        }
    }
    if (input.employeeId) {
        const osUserId = extractOsUserIdFromToken(input.employeeId);
        if (osUserId) {
            try {
                const os = await assertActiveOutsourceWithPermission(
                    prisma,
                    osUserId,
                    PERMISSIONS.EQUIPMENT_EXECUTE,
                    "Eksekusi Inspeksi Alat"
                );
                return os.userId;
            } catch (err) {
                if (err instanceof OutsourceUserError) throw new EquipmentError(err.message, err.statusCode);
                throw err;
            }
        }
        const emp = await assertActiveInternalEmployee(prisma, input.employeeId, today);
        return emp.userId;
    }
    throw new EquipmentError("Pilih karyawan atau akun outsource.", 400);
}

export async function getMyEquipmentUnits(session: SessionPayload, filters: { productId?: string } = {}) {
    if (!session.userId) throw new EquipmentError("Sesi tidak valid.", 401);
    if (!hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_EXECUTE)) {
        throw new EquipmentError("Anda tidak memiliki akses eksekusi inspeksi alat.", 403);
    }
    const today = toWIBDateString();
    const rows = await prisma.equipmentAssignment.findMany({
        where: { userId: session.userId },
        orderBy: { startsOnWibDate: "desc" },
    });
    const effective = rows.filter((r) => isEffectiveOn(today, r.startsOnWibDate, r.endsOnWibDate));
    // Penugasan global (unitId null) mencakup semua unit aktif kedua perusahaan.
    const hasGlobal = effective.some((r) => r.unitId === null);
    const specificIds = [...new Set(effective.filter((r) => r.unitId !== null).map((r) => r.unitId as string))];
    // Cakupan perusahaan: global = WIG+MKI; per unit = perusahaan unitnya (termasuk WIG+MKI bila shared).
    // Unit belum berkategori (NULL) tidak tampil sampai WIG002 mengategorikannya.
    let scope: EquipmentCompany[];
    if (hasGlobal) {
        scope = [...EQUIPMENT_COMPANIES];
    } else if (specificIds.length === 0) {
        return [];
    } else {
        const scoped = await prisma.equipmentUnit.findMany({
            where: { id: { in: specificIds } },
            select: { company: true, isSharedBoth: true },
        });
        scope = [...new Set(scoped.flatMap((u) => getUnitCompanies(u)))];
        if (scope.length === 0) return [];
    }
    const units = await prisma.equipmentUnit.findMany({
        where: {
            isActive: true,
            ...unitWhereForCompanies(scope),
            ...(hasGlobal ? {} : { id: { in: specificIds } }),
            ...(filters.productId ? { productTools: { some: { productId: filters.productId } } } : {}),
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
                    startedByEmployeeId: true,
                    startedByUserId: true,
                    startedByNameSnapshot: true,
                    startedBy: { select: { employeeId: true, name: true } },
                    startedByUser: { select: { username: true, displayName: true } },
                    checkedBy: { select: { employeeId: true, name: true } },
                    approvedBy: { select: { employeeId: true, name: true } },
                },
            },
            productTools: { select: { product: { select: { id: true, name: true, company: true } } } },
        },
    });
    return units.map((u) => ({
        assignmentId: null,
        startsOn: null,
        endsOn: null,
        unit: withUnitCompanies({
            ...u,
            inspections: u.inspections.map((insp) => ({
                ...insp,
                startedBy: normalizeStartedBy(insp),
            })),
        }),
    }));
}

// ─── Assignment: WIG002 menentukan siapa dapat modul Inspeksi Alat ───

/** Validasi periode WIB; kembalikan startsOn final (default hari ini). */
function resolveAssignmentPeriod(today: string, startsOnInput?: string, endsOnInput?: string | null): { startsOn: string; endsOn: string | null } {
    const startsOn = startsOnInput ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) throw new EquipmentError("Tanggal mulai tidak valid (YYYY-MM-DD).", 400);
    if (endsOnInput && !/^\d{4}-\d{2}-\d{2}$/.test(endsOnInput)) {
        throw new EquipmentError("Tanggal selesai tidak valid (YYYY-MM-DD).", 400);
    }
    if (endsOnInput && endsOnInput <= startsOn) {
        throw new EquipmentError("Tanggal selesai harus setelah tanggal mulai.", 400);
    }
    return { startsOn, endsOn: endsOnInput ?? null };
}

/** Unit harus aktif + sudah berkategori WIG/MKI sebelum bisa ditugaskan. */
async function assertAssignableUnit(unitId: string) {
    const unit = await prisma.equipmentUnit.findUnique({ where: { id: unitId } });
    if (!unit || !unit.isActive) throw new EquipmentError("Unit alat tidak ditemukan atau nonaktif.", 422);
    if (!unit.company) throw new EquipmentError("Kategorikan dulu alat ke WIG/MKI sebelum menugaskan.", 422);
    return unit;
}

/** Baris penugasan yang bertabrakan periode + cakupan unit (global menabrak semua). */
async function findOverlappingAssignment(
    userId: string,
    unitId: string | null,
    startsOn: string,
    endsOn: string | null,
    excludeId?: string
) {
    const periodOr = [{ endsOnWibDate: null }, { endsOnWibDate: { gt: startsOn } }];
    const periodAnd = { startsOnWibDate: { lte: endsOn ?? "9999-12-31" } };
    const notSelf = excludeId ? { id: { not: excludeId } } : {};
    if (unitId) {
        return prisma.equipmentAssignment.findFirst({
            where: { userId, ...notSelf, ...periodAnd, AND: [{ OR: [{ unitId: null }, { unitId }] }, { OR: periodOr }] },
        });
    }
    return prisma.equipmentAssignment.findFirst({ where: { userId, ...notSelf, ...periodAnd, OR: periodOr } });
}

export async function assignEquipmentUnit(
    session: SessionPayload,
    input: { unitId?: string | null; employeeId?: string; userId?: string; startsOnWibDate?: string; endsOnWibDate?: string | null }
) {
    await requireEquipmentSettingsScope(session, "assignments");
    if (input.unitId) await assertAssignableUnit(input.unitId);
    const today = toWIBDateString();
    const targetUserId = await resolveAssigneeUserId(input, today);
    const { startsOn, endsOn } = resolveAssignmentPeriod(today, input.startsOnWibDate, input.endsOnWibDate);
    const overlap = await findOverlappingAssignment(targetUserId, input.unitId ?? null, startsOn, endsOn);
    if (overlap) throw new EquipmentError("Penugasan bertabrakan dengan periode yang sudah ada.", 409);
    return prisma.equipmentAssignment.create({
        data: { unitId: input.unitId ?? null, userId: targetUserId, startsOnWibDate: startsOn, endsOnWibDate: endsOn },
    });
}

export interface EquipmentAssignBulkResult {
    created: Array<{ id: string; unitId: string | null }>;
    skipped: Array<{ unitId: string; unitName: string; reason: string }>;
}

/** Penugasan bulk: satu karyawan/OS × banyak alat. Per item divalidasi; yang gagal di-skip dengan alasan (bukan gagal semua). */
export async function assignEquipmentUnitsBulk(
    session: SessionPayload,
    input: { unitIds: string[]; employeeId?: string; userId?: string; startsOnWibDate?: string; endsOnWibDate?: string | null }
): Promise<EquipmentAssignBulkResult> {
    await requireEquipmentSettingsScope(session, "assignments");
    const ids = [...new Set(input.unitIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length === 0) throw new EquipmentError("Pilih minimal satu alat.", 400);
    if (ids.length > 200) throw new EquipmentError("Maksimal 200 alat per penugasan bulk.", 400);
    const today = toWIBDateString();
    const targetUserId = await resolveAssigneeUserId(input, today);
    const { startsOn, endsOn } = resolveAssignmentPeriod(today, input.startsOnWibDate, input.endsOnWibDate);
    const created: EquipmentAssignBulkResult["created"] = [];
    const skipped: EquipmentAssignBulkResult["skipped"] = [];
    for (const unitId of ids) {
        const unit = await prisma.equipmentUnit.findUnique({ where: { id: unitId } });
        if (!unit || !unit.isActive) {
            skipped.push({ unitId, unitName: unit?.name ?? unitId, reason: "Alat tidak ditemukan atau nonaktif." });
            continue;
        }
        if (!unit.company) {
            skipped.push({ unitId, unitName: unit.name, reason: "Belum berkategori WIG/MKI." });
            continue;
        }
        const overlap = await findOverlappingAssignment(targetUserId, unitId, startsOn, endsOn);
        if (overlap) {
            skipped.push({ unitId, unitName: unit.name, reason: "Bertabrakan dengan periode yang sudah ada." });
            continue;
        }
        const row = await prisma.equipmentAssignment.create({
            data: { unitId, userId: targetUserId, startsOnWibDate: startsOn, endsOnWibDate: endsOn },
        });
        created.push({ id: row.id, unitId });
    }
    return { created, skipped };
}

export async function getEquipmentAssignments(session: SessionPayload) {
    await requireEquipmentSettingsScope(session, "assignments");
    const rows = await prisma.equipmentAssignment.findMany({
        orderBy: { startsOnWibDate: "desc" },
        take: 200,
        include: {
            unit: { select: { id: true, name: true, company: true, isSharedBoth: true } },
            user: { select: { id: true, username: true, employeeId: true, displayName: true } },
        },
    });
    return rows.map((r) => ({
        ...r,
        unit: r.unit ? withUnitCompanies(r.unit) : null,
    }));
}

export async function endEquipmentAssignment(session: SessionPayload, assignmentId: string, endsOnWibDate?: string) {
    await requireEquipmentSettingsScope(session, "assignments");
    const existing = await prisma.equipmentAssignment.findUnique({ where: { id: assignmentId } });
    if (!existing) throw new EquipmentError("Penugasan tidak ditemukan.", 404);
    if (existing.endsOnWibDate) throw new EquipmentError("Penugasan sudah berakhir.", 409);
    const today = toWIBDateString();
    const endsOn = endsOnWibDate ?? today;
    if (endsOn <= existing.startsOnWibDate) throw new EquipmentError("Tanggal selesai harus setelah tanggal mulai.", 400);
    return prisma.equipmentAssignment.update({ where: { id: assignmentId }, data: { endsOnWibDate: endsOn } });
}

/** Akhiri banyak penugasan sekaligus (hari ini). Parsial: yang gagal di-skip dengan alasan. */
export interface EquipmentEndBulkResult {
    ended: string[];
    skipped: Array<{ assignmentId: string; reason: string }>;
}

export async function endEquipmentAssignmentsBulk(session: SessionPayload, assignmentIds: string[]): Promise<EquipmentEndBulkResult> {
    await requireEquipmentSettingsScope(session, "assignments");
    const ids = [...new Set(assignmentIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length === 0) throw new EquipmentError("Pilih minimal satu penugasan.", 400);
    if (ids.length > 200) throw new EquipmentError("Maksimal 200 penugasan per aksi bulk.", 400);
    const today = toWIBDateString();
    const ended: string[] = [];
    const skipped: EquipmentEndBulkResult["skipped"] = [];
    for (const id of ids) {
        const existing = await prisma.equipmentAssignment.findUnique({ where: { id } });
        if (!existing) {
            skipped.push({ assignmentId: id, reason: "Penugasan tidak ditemukan." });
            continue;
        }
        if (existing.endsOnWibDate) {
            skipped.push({ assignmentId: id, reason: "Penugasan sudah berakhir." });
            continue;
        }
        if (today <= existing.startsOnWibDate) {
            skipped.push({ assignmentId: id, reason: "Belum mulai (akhir harus setelah mulai)." });
            continue;
        }
        await prisma.equipmentAssignment.update({ where: { id }, data: { endsOnWibDate: today } });
        ended.push(id);
    }
    return { ended, skipped };
}

/** Ubah baris penugasan aktif (unit/karyawan/OS/tanggal). Riwayat yang sudah berakhir terkunci. */
export async function updateEquipmentAssignment(
    session: SessionPayload,
    assignmentId: string,
    input: { unitId?: string | null; employeeId?: string; userId?: string; startsOnWibDate?: string; endsOnWibDate?: string | null }
) {
    await requireEquipmentSettingsScope(session, "assignments");
    const existing = await prisma.equipmentAssignment.findUnique({ where: { id: assignmentId } });
    if (!existing) throw new EquipmentError("Penugasan tidak ditemukan.", 404);
    const today = toWIBDateString();
    if (existing.endsOnWibDate && existing.endsOnWibDate <= today) {
        throw new EquipmentError("Penugasan yang sudah berakhir tidak dapat diubah (riwayat terkunci).", 409);
    }
    // unitId: undefined = tidak berubah; null = jadikan global.
    const nextUnitId = input.unitId === undefined ? existing.unitId : input.unitId;
    if (nextUnitId) await assertAssignableUnit(nextUnitId);
    let nextUserId = existing.userId;
    if (input.employeeId !== undefined || input.userId !== undefined) {
        nextUserId = await resolveAssigneeUserId(input, today);
    }
    const nextStartsOn = input.startsOnWibDate ?? existing.startsOnWibDate;
    const nextEndsOn = input.endsOnWibDate === undefined ? existing.endsOnWibDate : input.endsOnWibDate;
    const { startsOn, endsOn } = resolveAssignmentPeriod(today, nextStartsOn, nextEndsOn);
    const overlap = await findOverlappingAssignment(nextUserId, nextUnitId, startsOn, endsOn, assignmentId);
    if (overlap) throw new EquipmentError("Penugasan bertabrakan dengan periode yang sudah ada.", 409);
    return prisma.equipmentAssignment.update({
        where: { id: assignmentId },
        data: { unitId: nextUnitId, userId: nextUserId, startsOnWibDate: startsOn, endsOnWibDate: endsOn },
    });
}

export interface EquipmentRecapFilters {
    unitId?: string;
    status?: "OPEN" | "SUBMITTED" | "DONE" | "APPROVED";
    from?: string;
    to?: string;
    company?: EquipmentCompany;
    productId?: string;
}

export async function getEquipmentRecap(session: SessionPayload, filters: EquipmentRecapFilters) {
    await requireWig002OrTopViewer(session);
    return queryEquipmentRecap(filters);
}

/** Query rekap tanpa guard sesi — hanya untuk cron sistem internal. */
export async function queryEquipmentRecap(filters: EquipmentRecapFilters) {
    const where: Prisma.EquipmentInspectionWhereInput = {};
    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.company || filters.productId) {
        where.unit = {
            ...(filters.company ? unitWhereForCompany(filters.company) : {}),
            ...(filters.productId ? { productTools: { some: { productId: filters.productId } } } : {}),
        };
    }
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
                unit: { select: { id: true, name: true, brand: true, location: true, company: true, isSharedBoth: true } },
                startedBy: { select: { employeeId: true, name: true } },
                startedByUser: { select: { username: true, displayName: true } },
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
    return {
        summary: { open, submitted, done, approved, total: open + submitted + done + approved },
        inspections: rows.map((r) => ({
            ...r,
            startedBy: normalizeStartedBy(r),
            unit: withUnitCompanies(r.unit),
        })),
    };
}

/** Perusahaan cakupan eksekusi: global = kedua perusahaan, per unit = perusahaan unitnya (kecuali NULL). */
export async function getExecuteCompanies(session: SessionPayload): Promise<EquipmentCompany[]> {
    if (!session.userId) return [];
    const today = toWIBDateString();
    const rows = await prisma.equipmentAssignment.findMany({
        where: { userId: session.userId },
        select: { unitId: true, startsOnWibDate: true, endsOnWibDate: true },
    });
    const effective = rows.filter((r) => isEffectiveOn(today, r.startsOnWibDate, r.endsOnWibDate));
    if (effective.some((r) => r.unitId === null)) return [...EQUIPMENT_COMPANIES];
    const ids = [...new Set(effective.map((r) => r.unitId as string))];
    if (ids.length === 0) return [];
    const units = await prisma.equipmentUnit.findMany({
        where: { id: { in: ids } },
        select: { company: true, isSharedBoth: true },
    });
    return [...new Set(units.flatMap((u) => getUnitCompanies(u)))];
}

/** Gabungan cakupan perusahaan sesi (eksekusi + QC + approver). */
export async function getEmployeeEquipmentCompanies(session: SessionPayload): Promise<EquipmentCompany[]> {
    const [exec, review, approve] = await Promise.all([
        getExecuteCompanies(session).catch(() => [] as EquipmentCompany[]),
        getEquipmentQcCompanies(session).catch(() => [] as EquipmentCompany[]),
        getEquipmentApproverCompanies(session).catch(() => [] as EquipmentCompany[]),
    ]);
    return [...new Set([...exec, ...review, ...approve])];
}

export async function getEmployeeEquipmentCapabilities(
    session: SessionPayload
): Promise<{
    canExecute: boolean;
    canReview: boolean;
    canTopView: boolean;
    canApprove: boolean;
    canManageSettings: boolean;
    manageScopes: EquipmentSettingsScope[];
    executeCompanies: EquipmentCompany[];
    reviewCompanies: EquipmentCompany[];
    approveCompanies: EquipmentCompany[];
}> {
    const none = {
        canExecute: false,
        canReview: false,
        canTopView: false,
        canApprove: false,
        canManageSettings: false,
        manageScopes: [] as EquipmentSettingsScope[],
        executeCompanies: [] as EquipmentCompany[],
        reviewCompanies: [] as EquipmentCompany[],
        approveCompanies: [] as EquipmentCompany[],
    };
    if (!session.userId) return none;
    const isInternal = Boolean(session.employeeId) && session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF);
    const isOsPortal = !isInternal && session.permissions.includes(PERMISSIONS.OUTSOURCE_PORTAL);
    if (!isInternal && !isOsPortal) return none;
    const canExecPerm = isInternal || session.permissions.includes(PERMISSIONS.EQUIPMENT_EXECUTE);
    const today = toWIBDateString();
    const [assignCount, reviewCompanies, isTop, approveCompanies, executeCompanies, manageScopes] = await Promise.all([
        canExecPerm
            ? prisma.equipmentAssignment.count({
                  where: {
                      userId: session.userId,
                      startsOnWibDate: { lte: today },
                      OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: today } }],
                  },
              })
            : Promise.resolve(0),
        getEquipmentQcCompanies(session).catch(() => [] as EquipmentCompany[]),
        isEquipmentTopViewer(session).catch(() => false),
        getEquipmentApproverCompanies(session).catch(() => [] as EquipmentCompany[]),
        canExecPerm ? getExecuteCompanies(session).catch(() => [] as EquipmentCompany[]) : Promise.resolve([] as EquipmentCompany[]),
        isInternal ? getActiveEquipmentSettingsScopes(session).catch(() => [] as EquipmentSettingsScope[]) : Promise.resolve([] as EquipmentSettingsScope[]),
    ]).catch(
        () =>
            [0, [], false, [], [], []] as [
                number,
                EquipmentCompany[],
                boolean,
                EquipmentCompany[],
                EquipmentCompany[],
                EquipmentSettingsScope[],
            ]
    );
    return {
        canExecute: canExecPerm && assignCount > 0,
        canReview: reviewCompanies.length > 0,
        canTopView: isTop,
        canApprove: approveCompanies.length > 0,
        canManageSettings: manageScopes.length > 0,
        manageScopes,
        executeCompanies,
        reviewCompanies,
        approveCompanies,
    };
}

// ─── Inspeksi ─────────────────────────────────────────────────────

const inspectionInclude = {
    unit: { select: { id: true, name: true, brand: true, location: true, company: true, isSharedBoth: true } },
    startedBy: { select: { employeeId: true, name: true } },
    startedByUser: { select: { username: true, displayName: true } },
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
        unit: withUnitCompanies(insp.unit),
        startedBy: normalizeStartedBy(insp),
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
    if (!session.userId || !hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_EXECUTE)) {
        throw new EquipmentError("Anda tidak memiliki akses memulai inspeksi.", 403);
    }
    const unit = await prisma.equipmentUnit.findUnique({
        where: { id: unitId },
        include: { template: { include: { items: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } } },
    });
    if (!unit || !unit.isActive) throw new EquipmentError("Unit alat tidak ditemukan atau nonaktif.", 422);
    if (!unit.template.isActive) throw new EquipmentError("Template unit ini nonaktif.", 422);
    if (!unit.company) throw new EquipmentError("Alat belum dikategorikan perusahaan (WIG/MKI).", 422);
    if (unit.template.items.length === 0) throw new EquipmentError("Template belum punya item aktif.", 422);
    const today = toWIBDateString();
    await assertAssignee(prisma, session.userId, unitId, today);
    const created = await prisma.$transaction(async (tx) => {
        const insp = await tx.equipmentInspection.create({
            data: {
                unitId,
                unitNameSnapshot: unit.name,
                startedByEmployeeId: session.employeeId ?? null,
                startedByUserId: session.userId,
                startedByNameSnapshot: session.name,
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
        const { isQc, isApprover } = await isQcOrApproverForUnit(session, insp.unit);
        const isStarter = isStarterOfInspection(session, insp);
        if (!mine && !isQc && !isApprover && !isStarter) throw new EquipmentError("Anda tidak terlibat inspeksi ini.", 403);
    }
    return toInspectionDto(insp);
}

export async function getMyEquipmentInspections(session: SessionPayload, status?: string): Promise<EquipmentInspectionDto[]> {
    if (!hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_EXECUTE)) {
        throw new EquipmentError("Anda tidak memiliki akses melihat inspeksi.", 403);
    }
    const starterOr: Prisma.EquipmentInspectionWhereInput[] = [];
    if (session.employeeId) starterOr.push({ startedByEmployeeId: session.employeeId });
    if (session.userId) starterOr.push({ startedByUserId: session.userId });
    if (starterOr.length === 0) return [];
    const rows = await prisma.equipmentInspection.findMany({
        where: {
            OR: starterOr,
            ...(status ? { status: status as "OPEN" | "SUBMITTED" | "DONE" | "APPROVED" } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: inspectionInclude,
    });
    return rows.map(toInspectionDto);
}

/**
 * Riwayat inspeksi per unit untuk pelaksana yang ditugaskan di unit itu
 * (melihat kerja pelaksana lain, read-only). QC/approver/topViewer/WIG002 juga boleh.
 * Header ringan — detail penuh via getEquipmentInspection.
 */
export async function getUnitInspectionHistory(session: SessionPayload, unitId: string) {
    if (!session.userId || !hasEquipmentPortalAccess(session)) {
        throw new EquipmentError("Anda tidak memiliki akses melihat riwayat unit.", 403);
    }
    const today = toWIBDateString();
    const unit = await prisma.equipmentUnit.findUnique({ where: { id: unitId }, select: { company: true, isSharedBoth: true } });
    const [{ isQc, isApprover }, isTop] = await Promise.all([
        isQcOrApproverForUnit(session, unit),
        isEquipmentTopViewer(session).catch(() => false),
    ]);
    const assignments = await prisma.equipmentAssignment.findMany({
        where: { userId: session.userId },
        select: { unitId: true, startsOnWibDate: true, endsOnWibDate: true },
    });
    const assigned = assignments.some(
        (a) => (a.unitId === null || a.unitId === unitId) && isEffectiveOn(today, a.startsOnWibDate, a.endsOnWibDate)
    );
    if (!isWig002(session) && !isTop && !isQc && !isApprover && !assigned) {
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
            startedByEmployeeId: true,
            startedByUserId: true,
            startedByNameSnapshot: true,
            unit: { select: { id: true, name: true, brand: true, location: true, company: true, isSharedBoth: true } },
            startedBy: { select: { employeeId: true, name: true } },
            startedByUser: { select: { username: true, displayName: true } },
            checkedByNameSnapshot: true,
            approvedByNameSnapshot: true,
        },
    });
    return rows.map((r) => ({
        ...r,
        startedBy: normalizeStartedBy(r),
        unit: withUnitCompanies(r.unit),
    }));
}

export async function getPendingEquipmentApprovals(session: SessionPayload): Promise<EquipmentInspectionDto[]> {
    if (!hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_QC)) {
        throw new EquipmentError("Hanya petugas QC yang ditunjuk WIG002 yang dapat memproses antrean.", 403);
    }
    // Wadah QC per perusahaan: anggota QC melihat SUBMITTED perusahaannya (termasuk alat shared WIG+MKI), terbaru di atas.
    const companies = await getEquipmentQcCompanies(session);
    if (companies.length === 0) throw new EquipmentError("Hanya petugas QC yang ditunjuk WIG002 yang dapat memproses antrean.", 403);
    const rows = await prisma.equipmentInspection.findMany({
        where: { status: "SUBMITTED", unit: unitWhereForCompanies(companies) },
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
    if (!hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_APPROVE)) {
        throw new EquipmentError("Hanya approver yang ditunjuk WIG002 yang dapat menyetujui inspeksi.", 403);
    }
    const companies = await getEquipmentApproverCompanies(session);
    if (companies.length === 0) throw new EquipmentError("Hanya approver yang ditunjuk WIG002 yang dapat menyetujui inspeksi.", 403);
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
    const scope = { unit: unitWhereForCompanies(companies) };
    if (status === "DONE") {
        where = { status: "DONE", ...scope, ...dateRange("checkedAt") };
    } else if (status === "APPROVED") {
        where = { status: "APPROVED", ...scope, ...dateRange("approvedAt") };
    } else {
        const rangeActive = from !== undefined || toExclusive !== undefined;
        where = rangeActive
            ? {
                  status: { in: ["DONE", "APPROVED"] },
                  ...scope,
                  OR: [
                      { status: "DONE", ...dateRange("checkedAt") },
                      { status: "APPROVED", ...dateRange("approvedAt") },
                  ],
              }
            : { status: { in: ["DONE", "APPROVED"] }, ...scope };
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
    if (!session.userId || !hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_EXECUTE)) {
        throw new EquipmentError("Anda tidak memiliki akses mengisi inspeksi.", 403);
    }
    const item = await prisma.equipmentInspectionItem.findUnique({
        where: { id: itemId },
        include: { inspection: { select: { id: true, status: true, unitId: true, unit: { select: { company: true } } } } },
    });
    if (!item || !item.isActive) throw new EquipmentError("Item inspeksi tidak ditemukan.", 404);
    if (item.inspection.status !== "OPEN") throw new EquipmentError("Inspeksi sudah dikirim, tidak dapat diubah.", 409);
    if (!item.inspection.unit.company) throw new EquipmentError("Alat belum dikategorikan perusahaan (WIG/MKI).", 422);
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
    if (!session.userId || !hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_EXECUTE)) {
        throw new EquipmentError("Anda tidak memiliki akses mengirim inspeksi.", 403);
    }
    const insp = await loadInspectionOrThrow(inspectionId);
    if (insp.status !== "OPEN") throw new EquipmentError("Inspeksi sudah dikirim.", 409);
    if (!insp.unit.company) throw new EquipmentError("Alat belum dikategorikan perusahaan (WIG/MKI).", 422);
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
        const updated = await tx.equipmentInspection.updateMany({
            where: { id: inspectionId, status: "OPEN" },
            data: { status: "SUBMITTED", submittedAt: new Date() },
        });
        if (updated.count === 0) throw new EquipmentError("Inspeksi sudah dikirim.", 409);
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
    if (!hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_QC)) {
        throw new EquipmentError("Hanya petugas QC yang dapat menyelesaikan inspeksi.", 403);
    }
    const insp = await loadInspectionOrThrow(inspectionId);
    if (insp.status !== "SUBMITTED") throw new EquipmentError("Hanya inspeksi yang sudah dikirim yang dapat diselesaikan QC.", 409);
    await requireQcMemberForUnit(session, insp.unit);
    const today = toWIBDateString();
    let checkedByEmployeeId: string | null = null;
    let checkedByUserId: string | null = session.userId ?? null;
    let checkedByName: string;
    if (session.employeeId) {
        const qc = await assertActiveInternalEmployee(prisma, session.employeeId, today);
        checkedByEmployeeId = qc.employeeId;
        checkedByUserId = qc.userId;
        checkedByName = qc.name;
    } else {
        try {
            const os = await assertActiveOutsourceWithPermission(
                prisma,
                session.userId,
                PERMISSIONS.EQUIPMENT_QC,
                "QC Inspeksi Alat"
            );
            checkedByUserId = os.userId;
            checkedByName = os.displayName;
        } catch (err) {
            if (err instanceof OutsourceUserError) throw new EquipmentError(err.message, err.statusCode);
            throw err;
        }
    }
    const cleanNote = note?.trim().slice(0, 1000) || null;
    await prisma.$transaction(async (tx) => {
        const updated = await tx.equipmentInspection.updateMany({
            where: { id: inspectionId, status: "SUBMITTED" },
            data: {
                status: "DONE",
                checkedByEmployeeId,
                checkedByUserId,
                checkedByNameSnapshot: checkedByName,
                checkedAt: new Date(),
                qcNote: cleanNote,
            },
        });
        if (updated.count === 0) {
            throw new EquipmentError("Hanya inspeksi yang sudah dikirim yang dapat diselesaikan QC.", 409);
        }
        await tx.auditLog.create({
            data: {
                action: "QC_DONE_EQUIPMENT_INSPECTION",
                entity: "EQUIPMENT_INSPECTION",
                entityId: inspectionId,
                details: JSON.stringify({ unitId: insp.unit.id, checkedBy: checkedByEmployeeId ?? checkedByUserId }),
                actorType: "USER",
                actorUserId: session.userId ?? null,
                actorIdentifier: session.username,
            },
        });
    });
    return toInspectionDto(await loadInspectionOrThrow(inspectionId));
}

/**
 * Approver final (dinamis maks 5 per perusahaan via setting WIG002, kuorum 1)
 * menyetujui inspeksi: DONE → APPROVED. Satu arah, tanpa reject.
 * DONE lama (periode sebelum approval) di-grandfather sebagai final.
 */
export async function approveEquipmentInspection(
    session: SessionPayload,
    inspectionId: string
): Promise<EquipmentInspectionDto> {
    if (!hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_APPROVE)) {
        throw new EquipmentError("Hanya approver yang dapat menyetujui inspeksi.", 403);
    }
    const insp = await loadInspectionOrThrow(inspectionId);
    if (insp.status !== "DONE") throw new EquipmentError("Hanya inspeksi yang sudah diperiksa QC yang dapat disetujui.", 409);
    await requireApproverForUnit(session, insp.unit);
    const today = toWIBDateString();
    let approvedByEmployeeId: string | null = null;
    let approvedByUserId: string | null = session.userId ?? null;
    let approvedByName: string;
    if (session.employeeId) {
        const approver = await assertActiveInternalEmployee(prisma, session.employeeId, today);
        approvedByEmployeeId = approver.employeeId;
        approvedByUserId = approver.userId;
        approvedByName = approver.name;
    } else {
        try {
            const os = await assertActiveOutsourceWithPermission(
                prisma,
                session.userId,
                PERMISSIONS.EQUIPMENT_APPROVE,
                "Approver Final Alat"
            );
            approvedByUserId = os.userId;
            approvedByName = os.displayName;
        } catch (err) {
            if (err instanceof OutsourceUserError) throw new EquipmentError(err.message, err.statusCode);
            throw err;
        }
    }
    await prisma.$transaction(async (tx) => {
        const updated = await tx.equipmentInspection.updateMany({
            where: { id: inspectionId, status: "DONE" },
            data: {
                status: "APPROVED",
                approvedByEmployeeId,
                approvedByUserId,
                approvedByNameSnapshot: approvedByName,
                approvedAt: new Date(),
            },
        });
        if (updated.count === 0) {
            throw new EquipmentError("Hanya inspeksi yang sudah diperiksa QC yang dapat disetujui.", 409);
        }
        await tx.auditLog.create({
            data: {
                action: "APPROVE_EQUIPMENT_INSPECTION",
                entity: "EQUIPMENT_INSPECTION",
                entityId: inspectionId,
                details: JSON.stringify({ unitId: insp.unit.id, approvedBy: approvedByEmployeeId ?? approvedByUserId }),
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
    if (!hasEquipmentPortalAccess(session, PERMISSIONS.EQUIPMENT_EXECUTE)) {
        throw new EquipmentError("Hanya pemulai yang dapat membatalkan checklist.", 403);
    }
    const insp = await loadInspectionOrThrow(inspectionId);
    if (!isStarterOfInspection(session, insp)) {
        throw new EquipmentError("Hanya yang memulai checklist ini yang dapat membatalkannya.", 403);
    }
    if (insp.status !== "OPEN") throw new EquipmentError("Hanya checklist yang masih berjalan yang dapat dibatalkan.", 409);
    await prisma.$transaction(async (tx) => {
        const updated = await tx.equipmentInspection.updateMany({
            where: { id: inspectionId, status: "OPEN" },
            data: { status: "CANCELLED" },
        });
        if (updated.count === 0) {
            throw new EquipmentError("Hanya checklist yang masih berjalan yang dapat dibatalkan.", 409);
        }
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
        select: { id: true, status: true, unitId: true, unit: { select: { company: true } } },
    });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    if (insp.status !== "OPEN") throw new EquipmentError("Inspeksi sudah dikirim, foto tidak dapat ditambah.", 409);
    if (!insp.unit.company) throw new EquipmentError("Alat belum dikategorikan perusahaan (WIG/MKI).", 422);
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
        select: { id: true, unitId: true, startedByEmployeeId: true, startedByUserId: true, unit: { select: { company: true, isSharedBoth: true } } },
    });
    if (!insp) return false;
    if (await isEquipmentTopViewer(session).catch(() => false)) return true;
    // Terlibat = QC/approver perusahaan inspeksi (termasuk alat shared WIG+MKI), pemulai, atau assignee efektif.
    const { isQc, isApprover } = await isQcOrApproverForUnit(session, insp.unit);
    if (isQc || isApprover) return true;
    if (isStarterOfInspection(session, insp)) return true;
    const today = toWIBDateString();
    try {
        await assertAssignee(prisma, session.userId, insp.unitId, today);
        return true;
    } catch {
        return false;
    }
}

function isFileNotFoundError(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "ENOENT";
}

export async function listEquipmentEvidenceForGA(session: SessionPayload, inspectionId: string) {
    await requireWig002OrTopViewer(session);
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
        select: { id: true },
    });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    if (!isWig002(session) && !(await isEquipmentTopViewer(session).catch(() => false))) {
        if (!session.userId) throw new EquipmentError("Sesi tidak valid.", 401);
        const allowed = await hasEquipmentEvidenceAccess(session, { inspectionId });
        if (!allowed) throw new EquipmentError("Anda tidak terlibat inspeksi ini.", 403);
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
    try {
        const buffer = await readFile(resolveEquipmentEvidencePath(row.filePath));
        return { buffer, mimeType: row.mimeType };
    } catch (err) {
        if (isFileNotFoundError(err)) {
            throw new EquipmentError("Berkas bukti foto tidak ditemukan di storage.", 404);
        }
        throw err;
    }
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
    session: SessionPayload;
    inspectionId: string;
    buffer: Buffer;
    mime: string;
    uploaderUserId: string;
    note?: string | null;
}): Promise<{ id: string; filePath: string }> {
    if (!hasEquipmentPortalAccess(input.session, PERMISSIONS.EQUIPMENT_QC)) {
        throw new EquipmentError("Hanya petugas QC yang dapat mengunggah foto QC.", 403);
    }
    await requireQcMemberForInspection(input.session, input.inspectionId);
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
    const insp = await prisma.equipmentInspection.findUnique({
        where: { id: inspectionId },
        select: { unitId: true, startedByEmployeeId: true, startedByUserId: true, unit: { select: { company: true, isSharedBoth: true } } },
    });
    if (!insp) return false;
    // Terlibat = QC/approver perusahaan inspeksi (termasuk alat shared WIG+MKI), pemulai, atau assignee efektif.
    const { isQc, isApprover } = await isQcOrApproverForUnit(session, insp.unit);
    if (isQc || isApprover) return true;
    if (isStarterOfInspection(session, insp)) return true;
    const today = toWIBDateString();
    try {
        await assertAssignee(prisma, session.userId, insp.unitId, today);
        return true;
    } catch {
        return false;
    }
}

async function listQcEvidenceInternal(inspectionId: string) {
    const insp = await prisma.equipmentInspection.findUnique({ where: { id: inspectionId }, select: { id: true } });
    if (!insp) throw new EquipmentError("Inspeksi tidak ditemukan.", 404);
    return prisma.equipmentQcEvidence.findMany({
        where: { inspectionId },
        orderBy: { capturedAt: "asc" },
        select: { id: true, filePath: true, note: true, capturedAt: true, size: true },
    });
}

export async function listQcEvidenceForGA(session: SessionPayload, inspectionId: string) {
    await requireWig002OrTopViewer(session);
    return listQcEvidenceInternal(inspectionId);
}

export async function listQcEvidenceFor(session: SessionPayload, inspectionId: string) {
    if (!(await hasQcEvidenceAccess(session, inspectionId))) {
        throw new EquipmentError("Anda tidak terlibat inspeksi ini.", 403);
    }
    return listQcEvidenceInternal(inspectionId);
}

export async function readQcEvidenceFile(session: SessionPayload, evidenceId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const row = await prisma.equipmentQcEvidence.findUnique({ where: { id: evidenceId } });
    if (!row) throw new EquipmentError("Foto QC tidak ditemukan.", 404);
    if (!(await hasQcEvidenceAccess(session, row.inspectionId))) {
        throw new EquipmentError("Anda tidak memiliki akses ke foto ini.", 403);
    }
    try {
        const buffer = await readFile(resolveQcEvidencePath(row.filePath));
        return { buffer, mimeType: row.mimeType };
    } catch (err) {
        if (isFileNotFoundError(err)) {
            throw new EquipmentError("Berkas foto QC tidak ditemukan di storage.", 404);
        }
        throw err;
    }
}

// ─── Util ─────────────────────────────────────────────────────────

export function isPrismaUniqueViolation(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002";
}

export async function logCreated(
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

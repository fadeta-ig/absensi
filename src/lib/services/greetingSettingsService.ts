import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/auth";
import { AppSettingsError } from "@/lib/services/appSettingsService";
import {
    MAX_GREETING_LENGTH,
    MAX_GREETING_NAME_LENGTH,
    MAX_GREETING_PRIORITY,
    MAX_SUB_GREETING_LENGTH,
    parseTimeToMinutes,
    type GreetingRuleInput,
    type GreetingRuleLike,
    type GreetingRuleView,
} from "@/lib/greeting";

/** Cache baca 60 detik, pola yang sama dengan pengaturan cleaning/meeting. */
const CACHE_TTL_MS = 60_000;

export const GREETING_EDITOR_KEY = "greeting.editorEmployeeId" as const;

export interface GreetingEditorInfo {
    employeeId: string;
    name: string | null;
    isActive: boolean;
}

export interface GreetingEditorCandidate {
    employeeId: string;
    name: string;
}

interface GreetingRuleRow {
    id: string;
    name: string;
    greeting: string;
    subGreeting: string;
    startTime: string;
    endTime: string;
    repeatWeekly: boolean;
    daysOfWeek: string;
    specificDate: string | null;
    priority: number;
    isActive: boolean;
}

let greetingRulesCache: { value: GreetingRuleView[]; expiresAt: number } | null = null;
let greetingEditorCache: { value: string | null; expiresAt: number } | null = null;

export function invalidateGreetingRulesCache(): void {
    greetingRulesCache = null;
}

export function invalidateGreetingEditorCache(): void {
    greetingEditorCache = null;
}

export function invalidateGreetingSettingsCache(): void {
    invalidateGreetingRulesCache();
    invalidateGreetingEditorCache();
}

/**
 * WIG002 adalah akun admin GA tanpa relasi employee. Aturan ini menyalin
 * guard kanonik di `cleaningService.isWig002` tanpa menarik modul cleaning.
 */
export function isWig002Session(session: Pick<SessionPayload, "username" | "permissions">): boolean {
    return session.username === "WIG002" && session.permissions.includes(PERMISSIONS.GA_MANAGE);
}

function parseDaysOfWeek(raw: string): number[] {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return [...new Set(parsed.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 6))]
            .sort((a, b) => a - b);
    } catch {
        return [];
    }
}

function toRuleView(row: GreetingRuleRow): GreetingRuleView {
    return {
        id: row.id,
        name: row.name,
        greeting: row.greeting,
        subGreeting: row.subGreeting,
        startTime: row.startTime,
        endTime: row.endTime,
        repeatWeekly: row.repeatWeekly,
        daysOfWeek: parseDaysOfWeek(row.daysOfWeek),
        specificDate: row.specificDate,
        priority: row.priority,
        isActive: row.isActive,
    };
}

function cloneRule(rule: GreetingRuleView): GreetingRuleView {
    return { ...rule, daysOfWeek: [...rule.daysOfWeek] };
}

/** Semua aturan (termasuk nonaktif) untuk GUI pengelola. */
export async function listGreetingRules(): Promise<GreetingRuleView[]> {
    const cached = greetingRulesCache;
    if (cached && Date.now() <= cached.expiresAt) return cached.value.map(cloneRule);

    const rows = await prisma.greetingRule.findMany({
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });
    const value = rows.map(toRuleView);
    greetingRulesCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value.map(cloneRule);
}

/**
 * Aturan aktif yang dikirim ke client employee. Kegagalan baca tidak boleh
 * mematahkan beranda; pemanggil akan memakai teks bawaan.
 */
export async function listActiveGreetingRules(): Promise<GreetingRuleLike[]> {
    try {
        const rules = await listGreetingRules();
        return rules
            .filter((rule) => rule.isActive)
            .map((rule) => ({
                greeting: rule.greeting,
                subGreeting: rule.subGreeting,
                startTime: rule.startTime,
                endTime: rule.endTime,
                repeatWeekly: rule.repeatWeekly,
                daysOfWeek: [...rule.daysOfWeek],
                specificDate: rule.specificDate,
                priority: rule.priority,
            }));
    } catch {
        return [];
    }
}

function normalizeText(raw: unknown, maxLength: number, label: string): string {
    if (typeof raw !== "string") throw new AppSettingsError(`${label} wajib diisi.`, 400);
    const value = raw.trim();
    if (!value || value.length > maxLength) {
        throw new AppSettingsError(`${label} wajib diisi dan maksimal ${maxLength} karakter.`, 400);
    }
    return value;
}

function isValidDateString(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

/** Validasi penuh satu aturan; melempar AppSettingsError 400 bila tidak valid. */
export function validateGreetingRuleInput(input: GreetingRuleInput): GreetingRuleInput {
    const name = normalizeText(input.name, MAX_GREETING_NAME_LENGTH, "Nama sapaan");
    const greeting = normalizeText(input.greeting, MAX_GREETING_LENGTH, "Teks sapaan");
    const subGreeting = normalizeText(input.subGreeting, MAX_SUB_GREETING_LENGTH, "Teks pendukung");

    if (parseTimeToMinutes(input.startTime) === null || parseTimeToMinutes(input.endTime) === null) {
        throw new AppSettingsError("Format jam harus HH:MM (00:00–23:59).", 400);
    }
    if (input.startTime === input.endTime) {
        throw new AppSettingsError("Jam mulai dan jam selesai tidak boleh sama.", 400);
    }

    const repeatWeekly = Boolean(input.repeatWeekly);
    let daysOfWeek: number[] = [];
    let specificDate: string | null = null;

    if (repeatWeekly) {
        daysOfWeek = [...new Set(input.daysOfWeek)]
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
            .sort((a, b) => a - b);
        if (daysOfWeek.length === 0) {
            throw new AppSettingsError("Pilih minimal satu hari untuk sapaan mingguan.", 400);
        }
    } else {
        if (!input.specificDate || !isValidDateString(input.specificDate)) {
            throw new AppSettingsError("Tanggal khusus wajib diisi dengan format YYYY-MM-DD.", 400);
        }
        specificDate = input.specificDate;
    }

    const priority = Number(input.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > MAX_GREETING_PRIORITY) {
        throw new AppSettingsError(`Prioritas harus bilangan bulat 0–${MAX_GREETING_PRIORITY}.`, 400);
    }

    return {
        name,
        greeting,
        subGreeting,
        startTime: input.startTime,
        endTime: input.endTime,
        repeatWeekly,
        daysOfWeek,
        specificDate,
        priority,
        isActive: Boolean(input.isActive),
    };
}

function isPrismaNotFound(err: unknown): boolean {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2025"
    );
}

export async function createGreetingRule(
    input: GreetingRuleInput,
    actorUserId?: string | null
): Promise<GreetingRuleView> {
    const data = validateGreetingRuleInput(input);
    const row = await prisma.greetingRule.create({
        data: {
            ...data,
            daysOfWeek: JSON.stringify(data.daysOfWeek),
            createdByUserId: actorUserId ?? null,
            updatedByUserId: actorUserId ?? null,
        },
    });
    invalidateGreetingRulesCache();
    return toRuleView(row);
}

export async function updateGreetingRule(
    id: string,
    input: GreetingRuleInput,
    actorUserId?: string | null
): Promise<GreetingRuleView> {
    const data = validateGreetingRuleInput(input);
    try {
        const row = await prisma.greetingRule.update({
            where: { id },
            data: {
                ...data,
                daysOfWeek: JSON.stringify(data.daysOfWeek),
                updatedByUserId: actorUserId ?? null,
            },
        });
        invalidateGreetingRulesCache();
        return toRuleView(row);
    } catch (err) {
        if (isPrismaNotFound(err)) throw new AppSettingsError("Sapaan tidak ditemukan.", 404);
        throw err;
    }
}

export async function deleteGreetingRule(id: string): Promise<void> {
    try {
        await prisma.greetingRule.delete({ where: { id } });
        invalidateGreetingRulesCache();
    } catch (err) {
        if (isPrismaNotFound(err)) throw new AppSettingsError("Sapaan tidak ditemukan.", 404);
        throw err;
    }
}

/** employeeId karyawan yang boleh ikut mengelola, atau null bila belum ditunjuk. */
export async function getGreetingEditorEmployeeId(): Promise<string | null> {
    const cached = greetingEditorCache;
    if (cached && Date.now() <= cached.expiresAt) return cached.value;

    try {
        const row = await prisma.appSetting.findUnique({ where: { key: GREETING_EDITOR_KEY } });
        const value = row?.value?.trim() ? row.value.trim() : null;
        greetingEditorCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value;
    } catch {
        greetingEditorCache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
        return null;
    }
}

/** Info editor untuk UI (nama + status aktif). */
export async function getGreetingEditorInfo(): Promise<GreetingEditorInfo | null> {
    const employeeId = await getGreetingEditorEmployeeId();
    if (!employeeId) return null;

    const employee = await prisma.employee.findUnique({
        where: { employeeId },
        select: { employeeId: true, name: true, isActive: true },
    });
    if (!employee) return { employeeId, name: null, isActive: false };
    return { employeeId: employee.employeeId, name: employee.name, isActive: employee.isActive };
}

/**
 * True bila sesi adalah karyawan yang ditunjuk DAN masih aktif. Pengecekan
 * aktif membuat penunjukan basi langsung mati.
 */
export async function isGreetingEditor(
    session: Pick<SessionPayload, "employeeId"> | null
): Promise<boolean> {
    if (!session?.employeeId) return false;
    const editorId = await getGreetingEditorEmployeeId();
    if (!editorId || editorId !== session.employeeId) return false;

    try {
        const employee = await prisma.employee.findUnique({
            where: { employeeId: session.employeeId },
            select: { isActive: true },
        });
        return employee?.isActive === true;
    } catch {
        return false;
    }
}

/** WIG002 atau karyawan terpilih boleh mengelola aturan sapaan. */
export async function canManageGreeting(
    session: Pick<SessionPayload, "username" | "permissions" | "employeeId">
): Promise<boolean> {
    if (isWig002Session(session)) return true;
    return isGreetingEditor(session);
}

async function assertActiveInternalEmployee(employeeId: string): Promise<string> {
    const id = employeeId.trim();
    if (!id) throw new AppSettingsError("ID karyawan editor sapaan wajib diisi.", 400);
    if (id.length > 100) throw new AppSettingsError("ID karyawan editor sapaan terlalu panjang.", 400);

    const employee = await prisma.employee.findUnique({
        where: { employeeId: id },
        select: {
            employeeId: true,
            isActive: true,
            userAccount: { select: { id: true, isActive: true } },
        },
    });
    if (!employee || !employee.isActive || !employee.userAccount || !employee.userAccount.isActive) {
        throw new AppSettingsError(
            "Karyawan editor sapaan tidak ditemukan, tidak aktif, atau bukan karyawan internal (outsource tidak boleh).",
            422
        );
    }
    return employee.employeeId;
}

/** Set/ganti/kosongkan editor. String kosong atau null mengosongkan penunjukan. */
export async function updateGreetingEditor(
    rawEmployeeId: string | null,
    actorUserId?: string | null
): Promise<string | null> {
    const trimmed = rawEmployeeId?.trim() ?? "";
    const employeeId = trimmed ? await assertActiveInternalEmployee(trimmed) : null;
    const value = employeeId ?? "";

    await prisma.appSetting.upsert({
        where: { key: GREETING_EDITOR_KEY },
        update: { value, updatedByUserId: actorUserId ?? null },
        create: { key: GREETING_EDITOR_KEY, value, updatedByUserId: actorUserId ?? null },
    });
    invalidateGreetingEditorCache();
    return employeeId;
}

/** Kandidat editor: karyawan internal aktif yang punya akun user aktif. */
export async function listGreetingEditorCandidates(): Promise<GreetingEditorCandidate[]> {
    const rows = await prisma.employee.findMany({
        where: {
            isActive: true,
            userAccount: { isActive: true },
        },
        select: { employeeId: true, name: true },
        orderBy: { name: "asc" },
        take: 500,
    });
    return rows.map((row) => ({ employeeId: row.employeeId, name: row.name }));
}

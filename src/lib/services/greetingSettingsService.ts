import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/auth";
import { AppSettingsError } from "@/lib/services/appSettingsService";
import { isValidCalendarDate, toUTCDateKey } from "@/lib/timezone";
import { stripGelar } from "@/lib/utils/formatters";
import {
    MAX_GREETING_AUTHOR_LENGTH,
    MAX_GREETING_LENGTH,
    MAX_GREETING_NAME_LENGTH,
    MAX_GREETING_PRIORITY,
    MAX_GREETING_QUOTE_LENGTH,
    MAX_SUB_GREETING_LENGTH,
    parseTimeToMinutes,
    type EmployeeGreetingQuoteView,
    type GreetingQuoteLike,
    type GreetingQuoteSlotValue,
    type GreetingQuoteStatusValue,
    type GreetingQuoteUpdateInput,
    type GreetingRuleInput,
    type GreetingRuleLike,
    type GreetingRuleView,
} from "@/lib/greeting";

/** Cache baca 60 detik, pola yang sama dengan pengaturan cleaning/meeting. */
const CACHE_TTL_MS = 60_000;

export const GREETING_EDITOR_KEY = "greeting.editorEmployeeId" as const;

const VALID_QUOTE_SLOTS = new Set<GreetingQuoteSlotValue>(["ALL", "PAGI", "SIANG", "SORE", "MALAM"]);
const VALID_QUOTE_STATUSES = new Set<GreetingQuoteStatusValue>(["PENDING", "APPROVED", "REJECTED"]);

export interface GreetingEditorInfo {
    employeeId: string;
    name: string | null;
    isActive: boolean;
}

export interface GreetingEditorCandidate {
    employeeId: string;
    name: string;
}

export interface ListEmployeeGreetingQuotesParams {
    status?: string | null;
    slot?: string | null;
    search?: string | null;
    page?: number;
    limit?: number;
}

export interface ListEmployeeGreetingQuotesResult {
    items: EmployeeGreetingQuoteView[];
    counts: Record<"ALL" | GreetingQuoteStatusValue, number>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

interface GreetingRuleRow {
    id: string;
    name: string;
    greeting: string;
    subGreeting: string;
    authorName?: string | null;
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
let approvedQuotesCache: { value: GreetingQuoteLike[]; expiresAt: number } | null = null;

export function invalidateGreetingRulesCache(): void {
    greetingRulesCache = null;
}

export function invalidateGreetingEditorCache(): void {
    greetingEditorCache = null;
}

export function invalidateGreetingQuotesCache(): void {
    approvedQuotesCache = null;
}

export function invalidateGreetingSettingsCache(): void {
    invalidateGreetingRulesCache();
    invalidateGreetingEditorCache();
    invalidateGreetingQuotesCache();
}

/**
 * WIG001 adalah akun Super Admin HR tanpa relasi employee.
 * Boleh melihat & mengkurasi quotes karyawan serta mengelola aturan sapaan,
 * namun penunjukan karyawan editor tetap khusus WIG002.
 */
export function isWig001Session(session: Pick<SessionPayload, "username" | "permissions">): boolean {
    return session.username === "WIG001" && session.permissions.includes(PERMISSIONS.HR_MANAGE);
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
        authorName: row.authorName ?? null,
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

function formatUtcDateKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
                authorName: rule.authorName ?? null,
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

/**
 * Quotes karyawan yang telah disetujui (`APPROVED`) untuk rotasi beranda.
 * Hanya mengirim field tampilan (tanpa employeeId/NIP/data pribadi selain
 * `authorName` yang memang disetujui untuk tampil).
 */
export async function listActiveGreetingQuotes(): Promise<GreetingQuoteLike[]> {
    const cached = approvedQuotesCache;
    if (cached && Date.now() <= cached.expiresAt) {
        return cached.value.map((item) => ({ ...item }));
    }

    try {
        const rows = await prisma.employeeGreetingQuote.findMany({
            where: { status: "APPROVED" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
                id: true,
                greeting: true,
                quote: true,
                authorName: true,
                slot: true,
            },
        });
        const value: GreetingQuoteLike[] = rows.map((row) => ({
            id: row.id,
            greeting: row.greeting ?? null,
            quote: row.quote,
            authorName: row.authorName ?? null,
            slot: row.slot as GreetingQuoteSlotValue,
        }));
        approvedQuotesCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value.map((item) => ({ ...item }));
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

function normalizeOptionalText(raw: unknown, maxLength: number, label: string): string | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") throw new AppSettingsError(`${label} tidak valid.`, 400);
    const value = raw.trim();
    if (!value) return null;
    if (value.length > maxLength) {
        throw new AppSettingsError(`${label} maksimal ${maxLength} karakter.`, 400);
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
    const authorName = normalizeOptionalText(
        input.authorName,
        MAX_GREETING_AUTHOR_LENGTH,
        "Nama pengirim"
    );

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
        authorName,
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

function isPrismaUniqueViolation(err: unknown): boolean {
    return (
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") ||
        (typeof err === "object" &&
            err !== null &&
            "code" in err &&
            (err as { code: string }).code === "P2002")
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
            authorName: data.authorName ?? null,
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
                authorName: data.authorName ?? null,
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

// ─── Quotes Kiriman Karyawan (Kurasi) ───────────────────────────

/**
 * Menyimpan quotes opsional kiriman karyawan dari langkah Stressmeter.
 * Berstatus awal `PENDING` (tidak langsung tampil di beranda) dan otomatis
 * mengisi `authorName` dari nama karyawan (tanpa gelar akademik).
 */
export async function submitEmployeeGreetingQuoteFromCheckin(
    employeeId: string,
    shiftDate: string,
    rawQuote: string
): Promise<boolean> {
    const quote = rawQuote.trim();
    if (!quote) return false;
    if (quote.length > MAX_GREETING_QUOTE_LENGTH) {
        throw new AppSettingsError(
            `Quotes maksimal ${MAX_GREETING_QUOTE_LENGTH} karakter.`,
            400
        );
    }
    if (!isValidCalendarDate(shiftDate)) {
        throw new AppSettingsError("Tanggal shift tidak valid.", 400);
    }

    const employee = await prisma.employee.findUnique({
        where: { employeeId },
        select: { name: true },
    });
    const cleanName = (stripGelar(employee?.name) || employee?.name?.trim() || "")
        .slice(0, MAX_GREETING_AUTHOR_LENGTH) || null;

    try {
        await prisma.employeeGreetingQuote.create({
            data: {
                employeeId,
                shiftDate: toUTCDateKey(shiftDate),
                greeting: null,
                quote,
                authorName: cleanName,
                slot: "ALL",
                status: "PENDING",
            },
        });
        return true;
    } catch (err) {
        if (isPrismaUniqueViolation(err)) {
            return false;
        }
        throw err;
    }
}

/**
 * Daftar quotes karyawan untuk sub-menu kurasi WIG001, WIG002, dan editor.
 * Sengaja TIDAK pernah menarik data rating Stressmeter agar privasi HR terjaga.
 */
export async function listEmployeeGreetingQuotes(
    params: ListEmployeeGreetingQuotesParams = {}
): Promise<ListEmployeeGreetingQuotesResult> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const limit = Math.min(50, Math.max(5, Math.floor(params.limit ?? 15)));

    const statusFilter =
        params.status && VALID_QUOTE_STATUSES.has(params.status as GreetingQuoteStatusValue)
            ? (params.status as GreetingQuoteStatusValue)
            : null;
    const slotFilter =
        params.slot && VALID_QUOTE_SLOTS.has(params.slot as GreetingQuoteSlotValue)
            ? (params.slot as GreetingQuoteSlotValue)
            : null;
    const search = params.search?.trim() ?? "";

    const baseWhere: Prisma.EmployeeGreetingQuoteWhereInput = {};
    if (slotFilter) {
        baseWhere.slot = slotFilter;
    }
    if (search) {
        baseWhere.OR = [
            { quote: { contains: search } },
            { greeting: { contains: search } },
            { authorName: { contains: search } },
            { employeeId: { contains: search } },
            { employee: { name: { contains: search } } },
            { employee: { departmentRel: { name: { contains: search } } } },
        ];
    }

    const listWhere: Prisma.EmployeeGreetingQuoteWhereInput = {
        ...baseWhere,
        ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [total, grouped] = await Promise.all([
        prisma.employeeGreetingQuote.count({ where: listWhere }),
        prisma.employeeGreetingQuote.groupBy({
            by: ["status"],
            where: baseWhere,
            _count: { _all: true },
        }),
    ]);

    const counts: Record<"ALL" | GreetingQuoteStatusValue, number> = {
        ALL: 0,
        PENDING: 0,
        APPROVED: 0,
        REJECTED: 0,
    };
    for (const g of grouped) {
        const key = g.status as GreetingQuoteStatusValue;
        counts[key] = g._count._all;
        counts.ALL += g._count._all;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);

    const rows =
        total === 0
            ? []
            : await prisma.employeeGreetingQuote.findMany({
                  where: listWhere,
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  skip: (safePage - 1) * limit,
                  take: limit,
                  select: {
                      id: true,
                      employeeId: true,
                      shiftDate: true,
                      greeting: true,
                      quote: true,
                      authorName: true,
                      slot: true,
                      status: true,
                      reviewedAt: true,
                      createdAt: true,
                      employee: {
                          select: {
                              name: true,
                              departmentRel: { select: { name: true } },
                          },
                      },
                  },
              });

    const items: EmployeeGreetingQuoteView[] = rows.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        submitterName: row.employee?.name ?? row.employeeId,
        departmentName: row.employee?.departmentRel?.name ?? "-",
        shiftDate: formatUtcDateKey(row.shiftDate),
        greeting: row.greeting ?? null,
        quote: row.quote,
        authorName: row.authorName ?? null,
        slot: row.slot as GreetingQuoteSlotValue,
        status: row.status as GreetingQuoteStatusValue,
        reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
    }));

    return {
        items,
        counts,
        pagination: {
            page: safePage,
            limit,
            total,
            totalPages,
        },
    };
}

export function validateGreetingQuoteUpdateInput(
    input: GreetingQuoteUpdateInput
): GreetingQuoteUpdateInput {
    const quote = normalizeText(input.quote, MAX_GREETING_QUOTE_LENGTH, "Teks quotes");
    const greeting = normalizeOptionalText(input.greeting, MAX_GREETING_LENGTH, "Judul sapaan");
    const authorName = normalizeOptionalText(
        input.authorName,
        MAX_GREETING_AUTHOR_LENGTH,
        "Nama pengirim"
    );

    if (!VALID_QUOTE_SLOTS.has(input.slot)) {
        throw new AppSettingsError("Slot waktu quotes tidak valid.", 400);
    }
    if (!VALID_QUOTE_STATUSES.has(input.status)) {
        throw new AppSettingsError("Status kurasi quotes tidak valid.", 400);
    }

    return {
        quote,
        greeting,
        authorName,
        slot: input.slot,
        status: input.status,
    };
}

export async function updateEmployeeGreetingQuote(
    id: string,
    input: GreetingQuoteUpdateInput,
    actorUserId?: string | null
): Promise<EmployeeGreetingQuoteView> {
    const data = validateGreetingQuoteUpdateInput(input);
    try {
        const row = await prisma.employeeGreetingQuote.update({
            where: { id },
            data: {
                quote: data.quote,
                greeting: data.greeting ?? null,
                authorName: data.authorName ?? null,
                slot: data.slot,
                status: data.status,
                reviewedByUserId: actorUserId ?? null,
                reviewedAt: new Date(),
            },
            select: {
                id: true,
                employeeId: true,
                shiftDate: true,
                greeting: true,
                quote: true,
                authorName: true,
                slot: true,
                status: true,
                reviewedAt: true,
                createdAt: true,
                employee: {
                    select: {
                        name: true,
                        departmentRel: { select: { name: true } },
                    },
                },
            },
        });
        invalidateGreetingQuotesCache();
        return {
            id: row.id,
            employeeId: row.employeeId,
            submitterName: row.employee?.name ?? row.employeeId,
            departmentName: row.employee?.departmentRel?.name ?? "-",
            shiftDate: formatUtcDateKey(row.shiftDate),
            greeting: row.greeting ?? null,
            quote: row.quote,
            authorName: row.authorName ?? null,
            slot: row.slot as GreetingQuoteSlotValue,
            status: row.status as GreetingQuoteStatusValue,
            reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
            createdAt: row.createdAt.toISOString(),
        };
    } catch (err) {
        if (isPrismaNotFound(err)) throw new AppSettingsError("Quotes karyawan tidak ditemukan.", 404);
        throw err;
    }
}

export async function deleteEmployeeGreetingQuote(id: string): Promise<void> {
    try {
        await prisma.employeeGreetingQuote.delete({ where: { id } });
        invalidateGreetingQuotesCache();
    } catch (err) {
        if (isPrismaNotFound(err)) throw new AppSettingsError("Quotes karyawan tidak ditemukan.", 404);
        throw err;
    }
}

// ─── Delegasi Karyawan Editor ───────────────────────────────────

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

/** WIG001, WIG002, atau karyawan editor terpilih boleh mengelola sapaan & kurasi quotes. */
export async function canManageGreeting(
    session: Pick<SessionPayload, "username" | "permissions" | "employeeId">
): Promise<boolean> {
    if (isWig002Session(session) || isWig001Session(session)) return true;
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

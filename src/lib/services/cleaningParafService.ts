import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { addCalendarDays, getWIBDayOfWeek, isValidCalendarDate, toWIBDateString } from "@/lib/timezone";
import { CleaningError } from "@/lib/services/cleaningService";
import { getCleaningWeeklyOffDays } from "@/lib/services/appSettingsService";
import type { SessionPayload } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export const CLEANING_DAILY_PARAF_SCOPE = "cleaning_daily_paraf";

export type CleaningParafRole = "INSPECTED_BY" | "KNOWN_BY";
export type CleaningParafStatus = "TEPAT" | "TERLAMBAT";

const WIB_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PARAF_ROLES: readonly CleaningParafRole[] = ["INSPECTED_BY", "KNOWN_BY"] as const;

export interface ParafChecklistSummary {
    exists: boolean;
    activeCount: number;
    completedCount: number;
    percent: number;
    isComplete: boolean;
}

export interface ParafRecordSummary {
    id: string;
    role: CleaningParafRole;
    signerEmployeeId: string;
    signerName: string;
    signedAt: Date;
    status: CleaningParafStatus;
}

export interface ParafReviewers {
    inspectedByEmployeeId: string;
    inspectedByName: string;
    knownByEmployeeId: string;
    knownByName: string;
}

export interface GetParafStatusResult {
    roomId: string;
    roomName: string;
    wibDate: string;
    monthWib: string;
    /** Kompat: kini mencerminkan pola mingguan dinamis (alias isWeeklyOff). */
    isWeekend: boolean;
    /** True bila day-of-week tanggal ada di setting `cleaning.weeklyOffDays`. */
    isWeeklyOff: boolean;
    weeklyOffDays: number[];
    isHoliday: boolean;
    isFree: boolean;
    holidayDescription: string | null;
    checklist: ParafChecklistSummary;
    reviewers: ParafReviewers | null;
    parafs: ParafRecordSummary[];
    missingRoles: CleaningParafRole[];
}

export interface SignDailyParafInput {
    roomId: string;
    wibDate: string;
    signerEmployeeId: string;
    idempotencyKey?: string;
    /** Diisi route bila paraf dibuatkan oleh operator (WIG002) untuk reviewer lain. */
    operator?: { userId: string; username: string; name: string } | null;
}

export interface SignDailyParafResult {
    success: boolean;
    parafId: string;
    roomId: string;
    wibDate: string;
    role: CleaningParafRole;
    status: CleaningParafStatus;
    isLate: boolean;
    signedAt: Date;
}

export interface CleaningHolidayRecord {
    id: string;
    wibDate: string;
    description: string;
    createdByUserId: string | null;
    createdAt: Date;
}

export function validateParafWibDate(wibDate: string): void {
    if (!WIB_DATE_PATTERN.test(wibDate) || !isValidCalendarDate(wibDate)) {
        throw new CleaningError("Format tanggal tidak valid. Gunakan YYYY-MM-DD.", 400);
    }
}

export function validateHolidayDescription(description: string): string {
    const trimmed = description.trim();
    if (trimmed.length < 3) {
        throw new CleaningError("Deskripsi libur wajib diisi minimal 3 karakter.", 400);
    }
    if (trimmed.length > 500) {
        throw new CleaningError("Deskripsi libur maksimal 500 karakter.", 400);
    }
    return trimmed;
}

/**
 * @deprecated Pola Sab–Min hardcoded. Gunakan `isCleaningOffDay` /
 * `isWibDateInWeeklyOffDays` dengan setting dinamis `cleaning.weeklyOffDays`.
 * Dipertahankan untuk kompatibilitas tes/UI lama.
 */
export function isWeekendWibDate(wibDate: string): boolean {
    return isWibDateInWeeklyOffDays(wibDate, [0, 6]);
}

/** Batas maksimal expand rentang libur (inklusif, hari kalender). */
export const CLEANING_HOLIDAY_RANGE_MAX_DAYS = 62;

/** True bila day-of-week tanggal WIB ada di daftar off mingguan (0=Min..6=Sab). */
export function isWibDateInWeeklyOffDays(wibDate: string, weeklyOffDays: number[]): boolean {
    const asWibMidnight = new Date(`${wibDate}T00:00:00+07:00`);
    const dayOfWeek = getWIBDayOfWeek(asWibMidnight);
    return weeklyOffDays.includes(dayOfWeek);
}

/**
 * Expand rentang tanggal libur inklusif [startDate..endDate] menjadi daftar
 * YYYY-MM-DD. endDate kosong → single. Maks 62 hari, tolak end < start.
 */
export function expandHolidayDateRange(startDate: string, endDate?: string): string[] {
    validateParafWibDate(startDate);
    const rawEnd = typeof endDate === "string" ? endDate.trim() : "";
    const end = rawEnd === "" ? startDate : rawEnd;
    validateParafWibDate(end);
    if (end < startDate) {
        throw new CleaningError("Tanggal akhir rentang libur tidak boleh sebelum tanggal mulai.", 400);
    }
    const dates: string[] = [];
    let cursor = startDate;
    while (cursor <= end) {
        dates.push(cursor);
        if (dates.length > CLEANING_HOLIDAY_RANGE_MAX_DAYS) {
            throw new CleaningError(
                `Rentang libur maksimal ${CLEANING_HOLIDAY_RANGE_MAX_DAYS} hari.`,
                400
            );
        }
        if (cursor === end) break;
        cursor = addCalendarDays(cursor, 1);
    }
    return dates;
}

export interface CleaningOffDayStatus {
    isOff: boolean;
    isWeeklyOff: boolean;
    isHoliday: boolean;
    holidayDescription: string | null;
    weeklyOffDays: number[];
}

type HolidayLookup = {
    findUnique: (args: { where: { wibDate: string }; select?: Record<string, boolean> }) => Promise<{ description: string } | null>;
};

/**
 * Helper off-day gabungan: true bila day-of-week ada di setting
 * `cleaning.weeklyOffDays` ATAU wibDate terdaftar di `cleaning_holidays`.
 * Terima transaksi Prisma opsional untuk pemakaian di dalam $transaction.
 */
export async function getCleaningOffDayStatus(
    wibDate: string,
    tx?: { cleaningHoliday?: HolidayLookup },
    opts?: { strict?: boolean }
): Promise<CleaningOffDayStatus> {
    validateParafWibDate(wibDate);
    let weeklyOffDays: number[];
    try {
        weeklyOffDays = await getCleaningWeeklyOffDays();
    } catch {
        // Mode ketat (mutasi paraf): gagal-tutup daripada menganggap hari kerja.
        if (opts?.strict) {
            throw new CleaningError("Pengaturan hari libur tidak dapat dimuat. Coba lagi sesaat.", 503);
        }
        weeklyOffDays = [0, 6];
    }
    const isWeeklyOff = isWibDateInWeeklyOffDays(wibDate, weeklyOffDays);
    const lookup: HolidayLookup | undefined =
        tx?.cleaningHoliday ?? (prisma as unknown as { cleaningHoliday?: HolidayLookup }).cleaningHoliday;
    let holiday: { description: string } | null = null;
    try {
        holiday = (await lookup?.findUnique({ where: { wibDate }, select: { description: true } })) ?? null;
    } catch {
        if (opts?.strict) {
            throw new CleaningError("Data hari libur tidak dapat dimuat. Coba lagi sesaat.", 503);
        }
        holiday = null;
    }
    const isHoliday = holiday !== null;
    return {
        isOff: isWeeklyOff || isHoliday,
        isWeeklyOff,
        isHoliday,
        holidayDescription: holiday?.description ?? null,
        weeklyOffDays: [...weeklyOffDays],
    };
}

/** True bila tanggal WIB bebas paraf (libur mingguan dinamis ATAU libur khusus). */
export async function isCleaningOffDay(
    wibDate: string,
    tx?: { cleaningHoliday?: HolidayLookup }
): Promise<boolean> {
    return (await getCleaningOffDayStatus(wibDate, tx)).isOff;
}

function toParafRole(value: string): CleaningParafRole | null {
    return value === "INSPECTED_BY" || value === "KNOWN_BY" ? value : null;
}

function buildRequestHash(input: { roomId: string; wibDate: string; signerEmployeeId: string }): string {
    return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function isPrismaUniqueViolation(err: unknown): boolean {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
    );
}

function summarizeChecklist(items: Array<{ isActive: boolean; isComplete: boolean }>): ParafChecklistSummary {
    const activeItems = items.filter((item) => item.isActive);
    const completedItems = activeItems.filter((item) => item.isComplete);
    const activeCount = activeItems.length;
    const completedCount = completedItems.length;
    const percent = activeCount === 0 ? 0 : Math.round((completedCount / activeCount) * 100);
    return {
        exists: true,
        activeCount,
        completedCount,
        percent,
        isComplete: activeCount > 0 && activeCount === completedCount,
    };
}

/**
 * Status paraf harian per ruangan-tanggal.
 * Mengembalikan siapa yang butuh paraf, persentase checklist, dan status bebas libur.
 */
export async function getParafStatus(roomId: string, wibDate: string): Promise<GetParafStatusResult> {
    validateParafWibDate(wibDate);
    if (!roomId || roomId.trim().length === 0) {
        throw new CleaningError("roomId wajib diisi.", 400);
    }

    const room = await prisma.cleaningRoom.findUnique({
        where: { id: roomId },
        select: { id: true, name: true },
    });
    if (!room) {
        throw new CleaningError("Ruangan tidak ditemukan.", 404);
    }

    const offDay = await getCleaningOffDayStatus(wibDate);
    const isWeeklyOff = offDay.isWeeklyOff;
    // Kompat: isWeekend kini = pola mingguan dinamis.
    const isWeekend = isWeeklyOff;
    const isHoliday = offDay.isHoliday;
    const isFree = offDay.isOff;
    const holiday = offDay.holidayDescription ? { description: offDay.holidayDescription } : null;

    const checklist = await prisma.cleaningDailyChecklist.findUnique({
        where: { roomId_wibDate: { roomId, wibDate } },
        include: { items: { select: { isActive: true, isComplete: true } } },
    });

    const checklistSummary: ParafChecklistSummary = checklist
        ? summarizeChecklist(checklist.items)
        : { exists: false, activeCount: 0, completedCount: 0, percent: 0, isComplete: false };

    const monthWib = wibDate.slice(0, 7);
    const approval = await prisma.cleaningMonthlyApproval.findUnique({
        where: { roomId_monthWib: { roomId, monthWib } },
        select: { inspectedByEmployeeId: true, knownByEmployeeId: true },
    });

    let reviewers: ParafReviewers | null = null;
    if (approval) {
        const reviewerRows = await prisma.employee.findMany({
            where: { employeeId: { in: [approval.inspectedByEmployeeId, approval.knownByEmployeeId] } },
            select: { employeeId: true, name: true },
        });
        const nameById = new Map(reviewerRows.map((row) => [row.employeeId, row.name]));
        reviewers = {
            inspectedByEmployeeId: approval.inspectedByEmployeeId,
            inspectedByName: nameById.get(approval.inspectedByEmployeeId) ?? approval.inspectedByEmployeeId,
            knownByEmployeeId: approval.knownByEmployeeId,
            knownByName: nameById.get(approval.knownByEmployeeId) ?? approval.knownByEmployeeId,
        };
    }

    const parafs = await prisma.cleaningDailyParaf.findMany({
        where: { roomId, wibDate },
        orderBy: { createdAt: "asc" },
    });

    const parafSummaries: ParafRecordSummary[] = parafs.flatMap((paraf) => {
        const role = toParafRole(paraf.signerRole);
        if (!role) return [];
        const status: CleaningParafStatus = paraf.status === "TERLAMBAT" ? "TERLAMBAT" : "TEPAT";
        return [
            {
                id: paraf.id,
                role,
                signerEmployeeId: paraf.signerEmployeeId,
                signerName: paraf.signerNameSnapshot,
                signedAt: paraf.signedAt,
                status,
            },
        ];
    });

    const missingRoles = PARAF_ROLES.filter((role) => !parafSummaries.some((paraf) => paraf.role === role));

    return {
        roomId: room.id,
        roomName: room.name,
        wibDate,
        monthWib,
        isWeekend,
        isWeeklyOff,
        weeklyOffDays: offDay.weeklyOffDays,
        isHoliday,
        isFree,
        holidayDescription: holiday?.description ?? null,
        checklist: checklistSummary,
        reviewers,
        parafs: parafSummaries,
        missingRoles,
    };
}

/**
 * Paraf harian oleh reviewer bulan berjalan.
 * Guard: reviewer 403, libur/weekend 422, checklist belum 100% 409, duplikat 409.
 * Status TERLAMBAT bila WIB hari ini melewati wibDate (tengah malam WIB).
 */
export async function signDailyParaf(input: SignDailyParafInput): Promise<SignDailyParafResult> {
    validateParafWibDate(input.wibDate);
    if (!input.roomId || input.roomId.trim().length === 0) {
        throw new CleaningError("roomId wajib diisi.", 400);
    }
    // Paraf tanggal depan tidak boleh: hanya hari ini atau tanggal lampau.
    if (input.wibDate > toWIBDateString(new Date())) {
        throw new CleaningError("Tanggal paraf belum tiba. Paraf hanya dapat dilakukan untuk hari ini atau tanggal lampau.", 422);
    }
    const signerEmployeeId = input.signerEmployeeId.trim();
    if (signerEmployeeId.length === 0) {
        throw new CleaningError("ID karyawan penandatangan wajib diisi.", 400);
    }
    // Namespace per operator asli (bukan per signer) agar dua operator WIG002
    // dengan kunci sama tidak saling memakai ulang respons satu sama lain.
    const idempotencyActorId = input.operator?.userId ?? signerEmployeeId;

    const requestHash = buildRequestHash({
        roomId: input.roomId,
        wibDate: input.wibDate,
        signerEmployeeId,
    });

    if (input.idempotencyKey) {
        const existing = await prisma.cleaningApprovalIdempotency.findUnique({
            where: {
                actorId_endpointScope_idempotencyKey: {
                    actorId: idempotencyActorId,
                    endpointScope: CLEANING_DAILY_PARAF_SCOPE,
                    idempotencyKey: input.idempotencyKey,
                },
            },
        });
        if (existing) {
            if (existing.requestHash === requestHash) {
                return JSON.parse(existing.responsePayload) as SignDailyParafResult;
            }
            throw new CleaningError("Idempotency key telah digunakan untuk payload berbeda.", 409);
        }
    }

    try {
        return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const room = await tx.cleaningRoom.findUnique({
                where: { id: input.roomId },
                select: { id: true, name: true },
            });
            if (!room) {
                throw new CleaningError("Ruangan tidak ditemukan.", 404);
            }

            const offDay = await getCleaningOffDayStatus(
                input.wibDate,
                tx as unknown as { cleaningHoliday?: HolidayLookup },
                { strict: true }
            );
            if (offDay.isWeeklyOff) {
                throw new CleaningError("Hari libur, tidak perlu paraf.", 422);
            }
            if (offDay.isHoliday) {
                throw new CleaningError(
                    offDay.holidayDescription
                        ? `Paraf tidak diperlukan pada hari libur: ${offDay.holidayDescription}.`
                        : "Hari libur, tidak perlu paraf.",
                    422
                );
            }

            const monthWib = input.wibDate.slice(0, 7);
            let approval = await tx.cleaningMonthlyApproval.findUnique({
                where: { roomId_monthWib: { roomId: input.roomId, monthWib } },
            });
            if (!approval) {
                // Tanpa fallback-baca: baris dibuat otomatis dari default global
                // bila penandatangan adalah pasangan default; selain itu tetap 403.
                const { getCleaningDefaultReviewers } = await import("@/lib/services/appSettingsService");
                const defaults = await getCleaningDefaultReviewers();
                if (signerEmployeeId !== defaults.inspectedByEmployeeId && signerEmployeeId !== defaults.knownByEmployeeId) {
                    throw new CleaningError("Anda tidak ditugaskan sebagai reviewer pada ruangan dan bulan ini.", 403);
                }
                const { ensureMonthlyApproval } = await import("@/lib/services/cleaningApprovalService");
                const ensured = await ensureMonthlyApproval(tx, input.roomId, monthWib, {
                    userId: input.operator?.userId ?? null,
                    identifier: input.operator
                        ? `${input.operator.username} untuk ${signerEmployeeId}`
                        : signerEmployeeId,
                    name: input.operator?.name ?? null,
                    role: null,
                });
                approval = ensured.approval;
            }
            if (!approval) {
                throw new CleaningError("Anda tidak ditugaskan sebagai reviewer pada ruangan dan bulan ini.", 403);
            }

            let role: CleaningParafRole | null = null;
            if (approval.inspectedByEmployeeId === signerEmployeeId) {
                role = "INSPECTED_BY";
            } else if (approval.knownByEmployeeId === signerEmployeeId) {
                role = "KNOWN_BY";
            }
            if (!role) {
                throw new CleaningError("Anda tidak ditugaskan sebagai reviewer pada ruangan dan bulan ini.", 403);
            }

            const checklist = await tx.cleaningDailyChecklist.findUnique({
                where: { roomId_wibDate: { roomId: input.roomId, wibDate: input.wibDate } },
                include: { items: { select: { isActive: true, isComplete: true } } },
            });
            if (!checklist) {
                throw new CleaningError("Checklist belum 100% selesai sehingga belum dapat diparaf.", 409);
            }
            const activeItems = checklist.items.filter((item) => item.isActive);
            const completedItems = activeItems.filter((item) => item.isComplete);
            if (activeItems.length === 0 || activeItems.length !== completedItems.length) {
                throw new CleaningError("Checklist belum 100% selesai sehingga belum dapat diparaf.", 409);
            }

            const employee = await tx.employee.findFirst({
                where: { employeeId: signerEmployeeId, isActive: true },
                select: { employeeId: true, name: true },
            });
            if (!employee) {
                throw new CleaningError("Data karyawan penandatangan tidak ditemukan atau tidak aktif.", 403);
            }

            const existingParaf = await tx.cleaningDailyParaf.findFirst({
                where: { roomId: input.roomId, wibDate: input.wibDate, signerRole: role },
                select: { id: true },
            });
            if (existingParaf) {
                throw new CleaningError("Paraf untuk peran ini sudah ada pada tanggal tersebut.", 409);
            }

            const wibToday = toWIBDateString(new Date());
            if (input.wibDate > wibToday) {
                throw new CleaningError("Tanggal paraf belum tiba. Paraf hanya dapat dilakukan untuk hari ini atau tanggal lampau.", 422);
            }
            const isLate = wibToday > input.wibDate;
            const status: CleaningParafStatus = isLate ? "TERLAMBAT" : "TEPAT";

            const created = await tx.cleaningDailyParaf.create({
                data: {
                    roomId: input.roomId,
                    wibDate: input.wibDate,
                    signerRole: role,
                    signerEmployeeId: employee.employeeId,
                    signerNameSnapshot: employee.name,
                    signedAt: new Date(),
                    status,
                },
            });

            await tx.auditLog.create({
                data: {
                    action: "SIGN_CLEANING_DAILY_PARAF",
                    entity: "CLEANING_DAILY_PARAF",
                    entityId: created.id,
                    actorType: "USER",
                    actorUserId: input.operator?.userId ?? null,
                    actorIdentifier: input.operator
                        ? `${input.operator.username} untuk ${employee.employeeId}`
                        : employee.employeeId,
                    actorName: input.operator
                        ? `${input.operator.name} (untuk ${employee.name})`
                        : employee.name,
                    actorRole: role,
                    details: JSON.stringify({
                        roomId: input.roomId,
                        roomName: room.name,
                        wibDate: input.wibDate,
                        role,
                        status,
                        signerEmployeeId: employee.employeeId,
                    }),
                },
            });

            const responseData: SignDailyParafResult = {
                success: true,
                parafId: created.id,
                roomId: input.roomId,
                wibDate: input.wibDate,
                role,
                status,
                isLate,
                signedAt: created.signedAt,
            };

            if (input.idempotencyKey) {
                await tx.cleaningApprovalIdempotency.create({
                    data: {
                        actorId: idempotencyActorId,
                        endpointScope: CLEANING_DAILY_PARAF_SCOPE,
                        idempotencyKey: input.idempotencyKey,
                        requestHash,
                        responsePayload: JSON.stringify(responseData),
                        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    },
                });
            }

            return responseData;
        });
    } catch (err: unknown) {
        if (err instanceof CleaningError) {
            throw err;
        }
        if (isPrismaUniqueViolation(err)) {
            throw new CleaningError("Paraf untuk peran ini sudah ada pada tanggal tersebut.", 409);
        }
        throw err;
    }
}

// ─── Libur cleaning WIG002 ──────────────────────────────────────

export async function listCleaningHolidays(): Promise<CleaningHolidayRecord[]> {
    const rows = await prisma.cleaningHoliday.findMany({
        orderBy: { wibDate: "asc" },
    });
    return rows.map((row) => ({
        id: row.id,
        wibDate: row.wibDate,
        description: row.description,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt,
    }));
}

export async function createCleaningHoliday(
    session: SessionPayload,
    data: { wibDate: string; description: string }
): Promise<CleaningHolidayRecord> {
    validateParafWibDate(data.wibDate);
    const description = validateHolidayDescription(data.description);

    try {
        const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Libur tidak boleh menutupi paraf yang sudah ada (audit hilang dari layar).
            const parafExists = await tx.cleaningDailyParaf.findFirst({
                where: { wibDate: data.wibDate },
                select: { id: true },
            });
            if (parafExists) {
                throw new CleaningError(
                    "Tanggal tersebut sudah memiliki paraf, tidak dapat dijadikan hari libur.",
                    409
                );
            }
            const row = await tx.cleaningHoliday.create({
                data: {
                    wibDate: data.wibDate,
                    description,
                    createdByUserId: session.userId,
                },
            });

            await tx.auditLog.create({
                data: {
                    action: "CREATE_CLEANING_HOLIDAY",
                    entity: "CLEANING_HOLIDAY",
                    entityId: row.id,
                    actorType: "USER",
                    actorUserId: session.userId,
                    actorIdentifier: session.username,
                    actorName: session.name,
                    actorRole: session.primaryRole,
                    details: JSON.stringify({ wibDate: data.wibDate, description }),
                },
            });

            return row;
        });

        return {
            id: created.id,
            wibDate: created.wibDate,
            description: created.description,
            createdByUserId: created.createdByUserId,
            createdAt: created.createdAt,
        };
    } catch (err: unknown) {
        if (isPrismaUniqueViolation(err)) {
            throw new CleaningError("Tanggal libur tersebut sudah terdaftar.", 409);
        }
        throw err;
    }
}

export interface CreateCleaningHolidayRangeInput {
    startDate: string;
    endDate?: string;
    description: string;
}

export interface CreateCleaningHolidayRangeResult {
    created: CleaningHolidayRecord[];
    skipped: string[];
    startDate: string;
    endDate: string;
}

/**
 * Buat libur rentang tanggal: expand [startDate..endDate] menjadi baris per
 * tanggal (maks 62 hari). Baris yang sudah ada di-skip (upsert-skip);
 * single yang sudah ada tetap 409 agar kompatibel dengan endpoint lama.
 */
export async function createCleaningHolidayRange(
    session: SessionPayload,
    data: CreateCleaningHolidayRangeInput
): Promise<CreateCleaningHolidayRangeResult> {
    const startDate = data.startDate.trim();
    const rawEnd = typeof data.endDate === "string" ? data.endDate.trim() : "";
    const endDate = rawEnd === "" ? startDate : rawEnd;
    const dates = expandHolidayDateRange(startDate, endDate);
    const description = validateHolidayDescription(data.description);
    const effectiveEnd = dates[dates.length - 1];

    try {
        return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const existing = await tx.cleaningHoliday.findMany({
                where: { wibDate: { in: dates } },
                select: { wibDate: true },
            });
            const existingSet = new Set(existing.map((row) => row.wibDate));
            const missing = dates.filter((date) => !existingSet.has(date));
            const skipped = dates.filter((date) => existingSet.has(date));

            if (dates.length === 1 && missing.length === 0) {
                throw new CleaningError("Tanggal libur tersebut sudah terdaftar.", 409);
            }

            // Tolak tanggal yang sudah diparaf agar paraf tidak hilang dari layar.
            const parafRows = missing.length > 0
                ? await tx.cleaningDailyParaf.findMany({
                    where: { wibDate: { in: missing } },
                    select: { wibDate: true },
                })
                : [];
            const conflicted = [...new Set(parafRows.map((row) => row.wibDate))].sort();
            if (conflicted.length > 0) {
                throw new CleaningError(
                    `Tanggal berikut sudah memiliki paraf, tidak dapat dijadikan hari libur: ${conflicted.join(", ")}.`,
                    409
                );
            }

            const created: CleaningHolidayRecord[] = [];
            for (const wibDate of missing) {
                const row = await tx.cleaningHoliday.create({
                    data: { wibDate, description, createdByUserId: session.userId },
                });
                await tx.auditLog.create({
                    data: {
                        action: "CREATE_CLEANING_HOLIDAY",
                        entity: "CLEANING_HOLIDAY",
                        entityId: row.id,
                        actorType: "USER",
                        actorUserId: session.userId,
                        actorIdentifier: session.username,
                        actorName: session.name,
                        actorRole: session.primaryRole,
                        details: JSON.stringify({ wibDate, description }),
                    },
                });
                created.push({
                    id: row.id,
                    wibDate: row.wibDate,
                    description: row.description,
                    createdByUserId: row.createdByUserId,
                    createdAt: row.createdAt,
                });
            }

            return { created, skipped, startDate: dates[0], endDate: effectiveEnd };
        });
    } catch (err: unknown) {
        if (err instanceof CleaningError) throw err;
        if (isPrismaUniqueViolation(err)) {
            throw new CleaningError("Tanggal libur tersebut sudah terdaftar.", 409);
        }
        throw err;
    }
}

export async function deleteCleaningHoliday(
    session: SessionPayload,
    params: { id?: string; wibDate?: string }
): Promise<{ success: boolean; id: string; wibDate: string }> {
    const targetId = params.id?.trim() ?? "";
    const targetDate = params.wibDate?.trim() ?? "";
    if (!targetId && !targetDate) {
        throw new CleaningError("ID atau tanggal libur wajib diisi.", 400);
    }
    if (targetDate) {
        validateParafWibDate(targetDate);
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = targetId
            ? await tx.cleaningHoliday.findUnique({ where: { id: targetId } })
            : await tx.cleaningHoliday.findUnique({ where: { wibDate: targetDate } });

        if (!existing) {
            throw new CleaningError("Hari libur tidak ditemukan.", 404);
        }

        await tx.cleaningHoliday.delete({ where: { id: existing.id } });

        await tx.auditLog.create({
            data: {
                action: "DELETE_CLEANING_HOLIDAY",
                entity: "CLEANING_HOLIDAY",
                entityId: existing.id,
                actorType: "USER",
                actorUserId: session.userId,
                actorIdentifier: session.username,
                actorName: session.name,
                actorRole: session.primaryRole,
                details: JSON.stringify({ wibDate: existing.wibDate, description: existing.description }),
            },
        });

        return { success: true, id: existing.id, wibDate: existing.wibDate };
    });
}

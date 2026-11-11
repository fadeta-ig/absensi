import { prisma } from "../prisma";
import { LeaveRequest } from "@/types";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { LeaveDateRangeError, validateLeaveDateRange } from "@/lib/services/leaveDateRange";
import { assertAllowedFile } from "@/lib/fileMagic";
import { getUploadLimit } from "@/lib/services/appSettingsService";
import { toDateString } from "@/lib/utils";
import { addCalendarDays, toUTCDateKey, toWIBDateString } from "@/lib/timezone";

export const DISCRETE_LEAVE_MAX_WINDOW_DAYS = 30;

export interface EmployeeLeaveBalance {
    totalLeave: number;
    usedLeave: number;
    pendingAnnualDays: number;
    remainingLeave: number;
    availableAnnualLeave: number;
}

// ─── Lampiran cuti: transport JSON-base64 dipertahankan, server pindah ke disk ───

/** Root privat lampiran cuti (di luar public/ agar wajib lewat route ber-auth). */
export const LEAVE_ATTACHMENT_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "leave-attachments");

/** Fallback bila setting upload.leaveAttachment.maxMb belum ada / DB gagal dibaca. */
export const DEFAULT_LEAVE_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

const LEAVE_ATTACHMENT_PREFIXES: Record<string, { mime: string; ext: string }> = {
    "data:image/jpeg;base64,": { mime: "image/jpeg", ext: ".jpg" },
    "data:image/png;base64,": { mime: "image/png", ext: ".png" },
    "data:image/webp;base64,": { mime: "image/webp", ext: ".webp" },
    "data:application/pdf;base64,": { mime: "application/pdf", ext: ".pdf" },
};

const LEAVE_ATTACHMENT_FILENAME_PATTERN = /^[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|pdf)$/i;

export const LEAVE_ATTACHMENT_MIME_BY_EXT: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
};

export class LeaveAttachmentError extends Error {
    readonly statusCode = 400;
    readonly code = "LEAVE_ATTACHMENT_ERROR";
    constructor(message: string) {
        super(message);
        this.name = "LeaveAttachmentError";
    }
}

export class LeaveQuotaError extends Error {
    readonly statusCode = 400;
    readonly code = "INSUFFICIENT_LEAVE_QUOTA";
    constructor(message: string) {
        super(message);
        this.name = "LeaveQuotaError";
    }
}

export class LeaveConflictError extends Error {
    readonly statusCode = 409;
    readonly code = "LEAVE_DATE_CONFLICT";
    constructor(message: string) {
        super(message);
        this.name = "LeaveConflictError";
    }
}

export class LeaveValidationError extends Error {
    readonly statusCode = 400;
    readonly code = "LEAVE_VALIDATION_ERROR";
    constructor(message: string) {
        super(message);
        this.name = "LeaveValidationError";
    }
}

/**
 * LeaveRequest untuk pembaca (page/modal): `attachment` adalah base64 lama
 * (baris lawas), `attachmentUrl` menunjuk serve privat bila ada path baru.
 * Dual: path → serve, kosong → base64 lama.
 */
export interface LeaveRequestWithAttachment extends LeaveRequest {
    attachmentUrl?: string | null;
    attachmentMime?: string | null;
    attachmentSize?: number | null;
}

export type LeaveRequestWithEmployee = LeaveRequestWithAttachment & {
    employee: {
        name: string;
        employeeId: string;
        totalLeave: number;
        usedLeave: number;
    };
};

export function leaveAttachmentUrl(filename: string): string {
    return `/api/leave/attachments/${encodeURIComponent(filename)}`;
}

/** Kembalikan absolute path bila nama file valid dan di dalam root, selain itu null. */
export function resolveLeaveAttachmentPath(filename: string): string | null {
    if (!LEAVE_ATTACHMENT_FILENAME_PATTERN.test(filename)) return null;
    const resolved = path.resolve(LEAVE_ATTACHMENT_STORAGE_ROOT, filename);
    if (!resolved.startsWith(`${LEAVE_ATTACHMENT_STORAGE_ROOT}${path.sep}`)) return null;
    return resolved;
}

/** Batas lampiran efektif: eksplisit > setting app > fallback bawaan 2MB. */
export async function resolveLeaveAttachmentLimitBytes(explicitMaxBytes?: number): Promise<number> {
    if (typeof explicitMaxBytes === "number" && Number.isFinite(explicitMaxBytes) && explicitMaxBytes > 0) {
        return Math.floor(explicitMaxBytes);
    }
    try {
        const limitMb = await getUploadLimit("upload.leaveAttachment.maxMb");
        if (Number.isFinite(limitMb) && limitMb > 0) {
            return Math.floor(limitMb * 1024 * 1024);
        }
    } catch {
        // Fallback ke konstanta bawaan di bawah.
    }
    return DEFAULT_LEAVE_ATTACHMENT_MAX_BYTES;
}

/**
 * Parse dataURL lampiran dari klien (kontrak lama dipertahankan) menjadi
 * buffer terverifikasi: prefix diizinkan, base64 kanonis, magic-byte cocok.
 */
export function parseLeaveAttachmentDataUrl(dataUrl: string, maxBytes: number): { buffer: Buffer; mime: string; ext: string } {
    const prefix = Object.keys(LEAVE_ATTACHMENT_PREFIXES).find((candidate) => dataUrl.startsWith(candidate));
    if (prefix === undefined) {
        throw new LeaveAttachmentError("Format lampiran tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF.");
    }
    const { mime, ext } = LEAVE_ATTACHMENT_PREFIXES[prefix];
    const encoded = dataUrl.slice(prefix.length);
    if (encoded.length === 0 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new LeaveAttachmentError("Data lampiran tidak valid.");
    }
    const buffer = Buffer.from(encoded, "base64");
    const canonicalInput = encoded.replace(/=+$/, "");
    const canonicalDecoded = buffer.toString("base64").replace(/=+$/, "");
    if (canonicalInput !== canonicalDecoded) {
        throw new LeaveAttachmentError("Data Base64 lampiran tidak valid.");
    }
    if (buffer.length === 0 || buffer.length > maxBytes) {
        const mb = maxBytes / (1024 * 1024);
        throw new LeaveAttachmentError(`Ukuran lampiran maksimal ${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB.`);
    }
    try {
        assertAllowedFile(buffer, mime);
    } catch {
        throw new LeaveAttachmentError("Isi lampiran tidak sesuai dengan format yang dinyatakan.");
    }
    return { buffer, mime, ext };
}

/** Simpan buffer terverifikasi ke disk privat; kembalikan nama file + meta. */
export async function saveLeaveAttachment(
    buffer: Buffer,
    mime: string,
    maxBytes: number,
): Promise<{ filename: string; mime: string; size: number }> {
    const ext = mime === "image/jpeg" ? ".jpg"
        : mime === "image/png" ? ".png"
            : mime === "image/webp" ? ".webp"
                : mime === "application/pdf" ? ".pdf"
                    : null;
    if (!ext) {
        throw new LeaveAttachmentError("Format lampiran tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF.");
    }
    if (buffer.length === 0 || buffer.length > maxBytes) {
        const mb = maxBytes / (1024 * 1024);
        throw new LeaveAttachmentError(`Ukuran lampiran maksimal ${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB.`);
    }
    try {
        assertAllowedFile(buffer, mime);
    } catch {
        throw new LeaveAttachmentError("Isi lampiran tidak sesuai dengan format yang dinyatakan.");
    }
    const filename = `${randomUUID()}${ext}`;
    const target = resolveLeaveAttachmentPath(filename);
    if (!target) {
        throw new LeaveAttachmentError("Nama berkas lampiran tidak valid.");
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: "wx" });
    return { filename, mime, size: buffer.length };
}

/** Mapper aman: mengkonversi Date fields Prisma menjadi string ISO untuk LeaveRequest */
function toLeaveRequest(row: Prisma.LeaveRequestGetPayload<Record<string, never>>): LeaveRequestWithAttachment {
    const attachmentPath = (row as { attachmentPath?: string | null }).attachmentPath ?? null;
    const attachmentMime = (row as { attachmentMime?: string | null }).attachmentMime ?? null;
    const attachmentSize = (row as { attachmentSize?: number | null }).attachmentSize ?? null;
    return {
        id: row.id,
        employeeId: row.employeeId,
        type: row.type as LeaveRequest["type"],
        startDate: row.startDate instanceof Date ? row.startDate.toISOString().split("T")[0] : String(row.startDate),
        endDate: row.endDate instanceof Date ? row.endDate.toISOString().split("T")[0] : String(row.endDate),
        reason: row.reason,
        status: row.status as LeaveRequest["status"],
        attachment: row.attachment ?? null,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        // Dual reader: path baru → URL serve privat; kosong → base64 lama di `attachment`.
        attachmentUrl: attachmentPath ? leaveAttachmentUrl(path.basename(attachmentPath)) : null,
        attachmentMime,
        attachmentSize,
    };
}

export async function getLeaveRequests(employeeId?: string): Promise<LeaveRequestWithEmployee[]> {
    const rows = await prisma.leaveRequest.findMany({
        where: employeeId ? { employeeId } : undefined,
        include: {
            employee: {
                select: {
                    name: true,
                    employeeId: true,
                    totalLeave: true,
                    usedLeave: true
                }
            }
        },
        orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
        ...toLeaveRequest(row),
        employee: row.employee,
    }));
}

/**
 * Hitung total hari kerja pada daftar rentang cuti secara efisien:
 * - Bila terdapat >1 rentang yang berada dalam batas <=366 hari kalender dan `resolveShiftsForRange` tersedia,
 *   lakukan 1x resolusi shift untuk rentang gabungan `[minStart, maxEnd]` lalu jumlahkan di memori (bebas N+1 query).
 * - Selain itu, gunakan `countWorkingDaysForEmployee` per rentang.
 */
async function countWorkingDaysAcrossRanges(
    employeeId: string,
    ranges: Array<{ startDate: string; endDate: string }>,
): Promise<number> {
    if (ranges.length === 0) return 0;

    const shiftModule = await import("@/lib/services/shiftAssignmentService");
    if (ranges.length > 1 && typeof shiftModule.resolveShiftsForRange === "function") {
        let minStart = ranges[0].startDate;
        let maxEnd = ranges[0].endDate;
        for (const r of ranges) {
            if (r.startDate < minStart) minStart = r.startDate;
            if (r.endDate > maxEnd) maxEnd = r.endDate;
        }
        if (validateLeaveDateRange(minStart, maxEnd).success) {
            const resolvedDays = await shiftModule.resolveShiftsForRange(prisma, employeeId, minStart, maxEnd);
            const workingByDate = new Map<string, number>();
            for (const { date, shift } of resolvedDays) {
                const dayOfWeek = toUTCDateKey(date).getUTCDay();
                const scheduleDay = shift?.days.find((d) => d.dayOfWeek === dayOfWeek) ?? null;
                const isOff = scheduleDay ? scheduleDay.isOff : dayOfWeek === 0;
                workingByDate.set(date, isOff ? 0 : 1);
            }
            let total = 0;
            for (const r of ranges) {
                let cur = r.startDate;
                while (cur <= r.endDate) {
                    total += workingByDate.get(cur) ?? 0;
                    if (cur === r.endDate) break;
                    cur = addCalendarDays(cur, 1);
                }
            }
            return total;
        }
    }

    let total = 0;
    for (const r of ranges) {
        total += await shiftModule.countWorkingDaysForEmployee(prisma, employeeId, r.startDate, r.endDate);
    }
    return total;
}

/**
 * Saldo cuti otoritatif karyawan dari DB:
 * - totalLeave & usedLeave dari tabel employees
 * - pendingAnnualDays dihitung dari pengajuan annual berstatus pending memakai roster efektif per tanggal
 * - remainingLeave = max(0, totalLeave - usedLeave)
 * - availableAnnualLeave = max(0, remainingLeave - pendingAnnualDays)
 * - Mendukung `prefetchedLeaves` dari `getLeaveRequests(employeeId)` agar tidak melakukan query DB ganda saat `?withBalance=1`
 */
export async function getEmployeeLeaveBalance(
    employeeId: string,
    prefetchedLeaves?: LeaveRequestWithEmployee[],
): Promise<EmployeeLeaveBalance> {
    let totalLeave: number;
    let usedLeave: number;
    let pendingRanges: Array<{ startDate: string; endDate: string }>;

    if (Array.isArray(prefetchedLeaves)) {
        const firstEmp = prefetchedLeaves[0]?.employee;
        if (firstEmp && typeof firstEmp.totalLeave === "number" && typeof firstEmp.usedLeave === "number") {
            totalLeave = firstEmp.totalLeave;
            usedLeave = firstEmp.usedLeave;
        } else {
            const employee = await prisma.employee.findUnique({
                where: { employeeId },
                select: { totalLeave: true, usedLeave: true },
            });
            if (!employee) {
                throw new LeaveValidationError("Data karyawan tidak ditemukan.");
            }
            totalLeave = employee.totalLeave;
            usedLeave = employee.usedLeave;
        }
        pendingRanges = prefetchedLeaves
            .filter((l) => l.type === "annual" && l.status === "pending")
            .map((l) => ({
                startDate: toDateString(l.startDate),
                endDate: toDateString(l.endDate),
            }));
    } else {
        const [employee, pendingAnnualRows] = await Promise.all([
            prisma.employee.findUnique({
                where: { employeeId },
                select: { totalLeave: true, usedLeave: true },
            }),
            prisma.leaveRequest.findMany({
                where: {
                    employeeId,
                    type: "annual",
                    status: "pending",
                },
                select: {
                    startDate: true,
                    endDate: true,
                },
            }),
        ]);

        if (!employee) {
            throw new LeaveValidationError("Data karyawan tidak ditemukan.");
        }

        totalLeave = employee.totalLeave;
        usedLeave = employee.usedLeave;
        pendingRanges = (pendingAnnualRows ?? []).map((item) => ({
            startDate: item.startDate instanceof Date ? item.startDate.toISOString().split("T")[0] : toDateString(item.startDate),
            endDate: item.endDate instanceof Date ? item.endDate.toISOString().split("T")[0] : toDateString(item.endDate),
        }));
    }

    const pendingAnnualDays = await countWorkingDaysAcrossRanges(employeeId, pendingRanges);
    const remainingLeave = Math.max(0, totalLeave - usedLeave);
    const availableAnnualLeave = Math.max(0, remainingLeave - pendingAnnualDays);

    return {
        totalLeave,
        usedLeave,
        pendingAnnualDays,
        remainingLeave,
        availableAnnualLeave,
    };
}

function buildLeaveConflictError(conflict: {
    startDate: Date | string;
    endDate: Date | string;
    status: string;
}): LeaveConflictError {
    const cStart = conflict.startDate instanceof Date
        ? conflict.startDate.toISOString().split("T")[0]
        : toDateString(conflict.startDate);
    const cEnd = conflict.endDate instanceof Date
        ? conflict.endDate.toISOString().split("T")[0]
        : toDateString(conflict.endDate);
    const statusLabel = conflict.status === "approved" ? "sudah disetujui" : "masih menunggu persetujuan";
    const rangeLabel = cStart === cEnd ? cStart : `${cStart} s/d ${cEnd}`;
    return new LeaveConflictError(
        `Tanggal pengajuan bentrok dengan cuti pada ${rangeLabel} yang ${statusLabel}.`
    );
}

async function assertNoOverlappingLeave(
    employeeId: string,
    startDate: string,
    endDate: string,
    excludeId?: string,
): Promise<void> {
    const conflict = await prisma.leaveRequest.findFirst({
        where: {
            employeeId,
            ...(excludeId ? { id: { not: excludeId } } : {}),
            status: { in: ["pending", "approved"] },
            startDate: { lte: toUTCDateKey(endDate) },
            endDate: { gte: toUTCDateKey(startDate) },
        },
        select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
        },
    });

    if (conflict) {
        throw buildLeaveConflictError(conflict);
    }
}

/**
 * Validasi anti-overlap untuk sekumpulan tanggal lepas sekaligus hanya dengan 1 query DB.
 */
async function assertNoOverlappingLeaveForDates(
    employeeId: string,
    sortedDateKeys: string[],
): Promise<void> {
    if (sortedDateKeys.length === 0) return;
    if (sortedDateKeys.length === 1) {
        await assertNoOverlappingLeave(employeeId, sortedDateKeys[0], sortedDateKeys[0]);
        return;
    }

    const conflict = await prisma.leaveRequest.findFirst({
        where: {
            employeeId,
            status: { in: ["pending", "approved"] },
            OR: sortedDateKeys.map((dateKey) => ({
                startDate: { lte: toUTCDateKey(dateKey) },
                endDate: { gte: toUTCDateKey(dateKey) },
            })),
        },
        select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
        },
    });

    if (conflict) {
        throw buildLeaveConflictError(conflict);
    }
}

/**
 * Validasi setiap tanggal lepas bukan hari libur jadwal kerja:
 * - Untuk multi-tanggal dengan `resolveShiftsForRange`, cukup 1x resolusi rentang `[minDate, maxDate]` (bebas N+1 query).
 * - Fallback ke `countWorkingDaysForEmployee` bila hanya 1 tanggal atau pada mock unit test.
 */
async function assertAllDatesAreWorkingDays(
    employeeId: string,
    sortedDateKeys: string[],
): Promise<void> {
    if (sortedDateKeys.length === 0) return;

    const shiftModule = await import("@/lib/services/shiftAssignmentService");
    if (sortedDateKeys.length > 1 && typeof shiftModule.resolveShiftsForRange === "function") {
        const minDate = sortedDateKeys[0];
        const maxDate = sortedDateKeys[sortedDateKeys.length - 1];
        const resolvedDays = await shiftModule.resolveShiftsForRange(prisma, employeeId, minDate, maxDate);
        const offByDate = new Map<string, boolean>();
        for (const { date, shift } of resolvedDays) {
            const dayOfWeek = toUTCDateKey(date).getUTCDay();
            const scheduleDay = shift?.days.find((d) => d.dayOfWeek === dayOfWeek) ?? null;
            const isOff = scheduleDay ? scheduleDay.isOff : dayOfWeek === 0;
            offByDate.set(date, isOff);
        }
        for (const dateKey of sortedDateKeys) {
            const isOff = offByDate.get(dateKey) ?? (toUTCDateKey(dateKey).getUTCDay() === 0);
            if (isOff) {
                throw new LeaveValidationError(`Tanggal ${dateKey} adalah hari libur jadwal kerja.`);
            }
        }
        return;
    }

    for (const dateKey of sortedDateKeys) {
        const workingDays = await shiftModule.countWorkingDaysForEmployee(prisma, employeeId, dateKey, dateKey);
        if (workingDays <= 0) {
            throw new LeaveValidationError(`Tanggal ${dateKey} adalah hari libur jadwal kerja.`);
        }
    }
}

async function cleanupSavedAttachment(filename: string | null | undefined): Promise<void> {
    if (!filename) return;
    const target = resolveLeaveAttachmentPath(filename);
    if (!target) return;
    await unlink(target).catch(() => undefined);
}

export async function createLeaveRequest(data: Omit<LeaveRequest, "id">, opts?: { attachmentMaxBytes?: number }): Promise<LeaveRequestWithAttachment> {
    const startDate = toDateString(data.startDate);
    const endDate = toDateString(data.endDate);
    assertSupportedLeaveRange(startDate, endDate);

    await assertNoOverlappingLeave(data.employeeId, startDate, endDate);

    const { countWorkingDaysForEmployee } = await import("@/lib/services/shiftAssignmentService");
    const requestedDays = await countWorkingDaysForEmployee(
        prisma,
        data.employeeId,
        startDate,
        endDate,
    );

    if ((data.type === "annual" || data.type === "sick" || data.type === "personal") && requestedDays <= 0) {
        throw new LeaveValidationError("Rentang tanggal yang dipilih seluruhnya jatuh pada hari libur jadwal kerja.");
    }

    // Pre-check: validasi saldo cuti untuk tipe annual (termasuk pengajuan annual yang masih pending)
    if (data.type === "annual") {
        const balance = await getEmployeeLeaveBalance(data.employeeId);

        if (requestedDays > balance.availableAnnualLeave) {
            const pendingNote = balance.pendingAnnualDays > 0
                ? ` (sisa disetujui ${balance.remainingLeave} hari, menunggu persetujuan ${balance.pendingAnnualDays} hari)`
                : "";
            throw new LeaveQuotaError(
                `Sisa cuti tahunan tidak mencukupi. Tersedia: ${balance.availableAnnualLeave} hari${pendingNote}, dibutuhkan: ${requestedDays} hari kerja.`
            );
        }
    }

    const attachmentColumns = await resolveLeaveAttachmentColumns(data.attachment, opts?.attachmentMaxBytes);
    try {
        const row = await prisma.leaveRequest.create({
            data: {
                employeeId: data.employeeId,
                type: data.type,
                startDate: toUTCDateKey(startDate),
                endDate: toUTCDateKey(endDate),
                reason: data.reason,
                status: data.status,
                ...attachmentColumns,
            },
        });
        return toLeaveRequest(row);
    } catch (err) {
        await cleanupSavedAttachment(attachmentColumns.attachmentPath);
        throw err;
    }
}

/**
 * Membuat pengajuan cuti tanggal lepas (1 tanggal = 1 LeaveRequest single-day) secara atomik:
 * - Khusus tipe annual, sick, personal
 * - Validasi window H+1 s/d H+30 (WIB), bukan hari libur jadwal (1x range query), dan tidak bentrok (1x query)
 * - Validasi total tanggal terhadap availableAnnualLeave (totalLeave - usedLeave - pendingAnnualDays)
 * - Menyimpan file bukti lampiran ke disk HANYA 1 KALI untuk seluruh tanggal terpilih (dengan cleanup otomatis bila transaksi gagal)
 */
export async function createLeaveRequestsBatch(
    data: {
        employeeId: string;
        type: "annual" | "sick" | "personal";
        dates: string[];
        reason: string;
        status: LeaveRequest["status"];
        attachment?: string | null;
    },
    opts?: { attachmentMaxBytes?: number; todayWib?: string }
): Promise<LeaveRequestWithAttachment[]> {
    if (!Array.isArray(data.dates) || data.dates.length === 0) {
        throw new LeaveValidationError("Pilih minimal 1 tanggal cuti.");
    }

    const normalizedDates = Array.from(new Set(data.dates.map((d) => toDateString(d)))).sort();
    if (normalizedDates.length !== data.dates.length) {
        throw new LeaveValidationError("Terdapat tanggal cuti yang duplikat.");
    }
    if (normalizedDates.length > DISCRETE_LEAVE_MAX_WINDOW_DAYS) {
        throw new LeaveValidationError(`Maksimal ${DISCRETE_LEAVE_MAX_WINDOW_DAYS} tanggal cuti dalam satu pengajuan.`);
    }

    const todayKey = opts?.todayWib ?? toWIBDateString();
    const minDateKey = addCalendarDays(todayKey, 1);
    const maxDateKey = addCalendarDays(todayKey, DISCRETE_LEAVE_MAX_WINDOW_DAYS);

    for (const dateKey of normalizedDates) {
        assertSupportedLeaveRange(dateKey, dateKey);
        if (dateKey < minDateKey || dateKey > maxDateKey) {
            throw new LeaveValidationError(
                `Tanggal ${dateKey} berada di luar batas pengajuan (${minDateKey} s/d ${maxDateKey}).`
            );
        }
    }

    await assertNoOverlappingLeaveForDates(data.employeeId, normalizedDates);
    await assertAllDatesAreWorkingDays(data.employeeId, normalizedDates);

    if (data.type === "annual") {
        const balance = await getEmployeeLeaveBalance(data.employeeId);
        if (normalizedDates.length > balance.availableAnnualLeave) {
            const pendingNote = balance.pendingAnnualDays > 0
                ? ` (sisa disetujui ${balance.remainingLeave} hari, menunggu persetujuan ${balance.pendingAnnualDays} hari)`
                : "";
            throw new LeaveQuotaError(
                `Sisa cuti tahunan tidak mencukupi. Tersedia: ${balance.availableAnnualLeave} hari${pendingNote}, dipilih: ${normalizedDates.length} hari.`
            );
        }
    }

    // Simpan lampiran 1 kali ke disk privat untuk dipakai bersama oleh semua baris dalam batch
    const attachmentColumns = await resolveLeaveAttachmentColumns(data.attachment, opts?.attachmentMaxBytes);

    try {
        const createOperations = normalizedDates.map((dateKey) =>
            prisma.leaveRequest.create({
                data: {
                    employeeId: data.employeeId,
                    type: data.type,
                    startDate: toUTCDateKey(dateKey),
                    endDate: toUTCDateKey(dateKey),
                    reason: data.reason,
                    status: data.status,
                    ...attachmentColumns,
                },
            })
        );

        const rows = typeof prisma.$transaction === "function"
            ? await prisma.$transaction(createOperations)
            : await Promise.all(createOperations);

        return rows.map(toLeaveRequest);
    } catch (err) {
        await cleanupSavedAttachment(attachmentColumns.attachmentPath);
        throw err;
    }
}

/**
 * Hitung hari kerja antara start dan end berdasarkan shift karyawan.
 * Menggunakan isOff dari WorkShiftDay untuk menentukan hari libur.
 * Jika offDays tidak diberikan, default: hanya Minggu (0) yang libur.
 */
export function calculateWorkingDays(
    start: Date | string,
    end: Date | string,
    offDays: Set<number> = new Set([0]) // default: Minggu libur
): number {
    const s = new Date(start);
    const e = new Date(end);
    let count = 0;
    const current = new Date(s);

    while (current <= e) {
        const dayOfWeek = current.getDay();
        if (!offDays.has(dayOfWeek)) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }

    return Math.max(count, 0);
}

export async function updateLeaveRequest(id: string, data: Partial<LeaveRequest>): Promise<LeaveRequest | null> {
    const existing = await prisma.leaveRequest.findUnique({
        where: { id },
        include: { employee: true }
    });

    if (!existing) return null;

    const existingStartDate = toDateString(existing.startDate);
    const existingEndDate = toDateString(existing.endDate);
    const startDate = toDateString(data.startDate || existing.startDate);
    const endDate = toDateString(data.endDate || existing.endDate);
    assertSupportedLeaveRange(startDate, endDate);

    const isDateChanged = startDate !== existingStartDate || endDate !== existingEndDate;
    if (isDateChanged && (data.status ?? existing.status) !== "rejected") {
        await assertNoOverlappingLeave(existing.employeeId, startDate, endDate, id);
    }

    // Balance Recalculation Logic
    // Hitung hari kerja per tanggal dengan shift efektif masing-masing hari (mendukung rotasi).
    const { countWorkingDaysForEmployee } = await import("@/lib/services/shiftAssignmentService");

    let usedLeaveDelta = 0;

    if (existing.type === "annual") {
        if (data.status === "approved" || (existing.status === "approved" && isDateChanged)) {
            const oldDays = existing.status === "approved"
                ? await countWorkingDaysForEmployee(prisma, existing.employeeId, existingStartDate, existingEndDate)
                : 0;
            const newDays = isDateChanged || existing.status !== "approved"
                ? await countWorkingDaysForEmployee(prisma, existing.employeeId, startDate, endDate)
                : oldDays;

            if (newDays <= 0) {
                throw new LeaveValidationError("Rentang tanggal realisasi seluruhnya jatuh pada hari libur jadwal kerja.");
            }

            if (existing.status !== "approved" && data.status === "approved") {
                usedLeaveDelta = newDays;
            } else if (existing.status === "approved" && data.status !== "rejected") {
                usedLeaveDelta = newDays - oldDays;
            }

            if (usedLeaveDelta > 0 && (existing.employee.totalLeave - existing.employee.usedLeave) < usedLeaveDelta) {
                throw new LeaveQuotaError("Sisa cuti karyawan tidak mencukupi untuk persetujuan ini.");
            }
        } else if (existing.status === "approved" && data.status === "rejected") {
            const days = await countWorkingDaysForEmployee(
                prisma,
                existing.employeeId,
                existingStartDate,
                existingEndDate,
            );
            usedLeaveDelta = -days;
        }
    } else if (isDateChanged && (existing.type === "sick" || existing.type === "personal") && (data.status ?? existing.status) !== "rejected") {
        const newDays = await countWorkingDaysForEmployee(prisma, existing.employeeId, startDate, endDate);
        if (newDays <= 0) {
            throw new LeaveValidationError("Rentang tanggal realisasi seluruhnya jatuh pada hari libur jadwal kerja.");
        }
    }

    const updateLeavePromise = prisma.leaveRequest.update({
        where: { id },
        data: {
            ...(data.status !== undefined && { status: data.status }),
            ...(data.startDate !== undefined && { startDate: toUTCDateKey(startDate) }),
            ...(data.endDate !== undefined && { endDate: toUTCDateKey(endDate) }),
            ...(data.reason !== undefined && { reason: data.reason }),
        },
    });

    if (usedLeaveDelta !== 0) {
        const updateEmployeePromise = prisma.employee.update({
            where: { employeeId: existing.employeeId },
            data: usedLeaveDelta > 0
                ? { usedLeave: { increment: usedLeaveDelta } }
                : { usedLeave: { decrement: Math.abs(usedLeaveDelta) } },
        });
        if (typeof prisma.$transaction === "function") {
            const [, row] = await prisma.$transaction([updateEmployeePromise, updateLeavePromise]);
            return toLeaveRequest(row);
        }
        await updateEmployeePromise;
    }

    const row = await updateLeavePromise;
    return toLeaveRequest(row);
}

export interface BulkLeaveUpdateOutcome {
    updated: LeaveRequestWithAttachment[];
    succeededIds: string[];
    failed: Array<{ id: string; error: string }>;
}

/**
 * Memproses persetujuan / penolakan cuti massal dalam satu permintaan server
 * agar portal HR tidak perlu menembakkan N HTTP PUT request sekuensial.
 */
export async function updateLeaveRequestsBulk(
    ids: string[],
    status: "approved" | "rejected",
): Promise<BulkLeaveUpdateOutcome> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    const updated: LeaveRequestWithAttachment[] = [];
    const succeededIds: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of uniqueIds) {
        try {
            const row = await updateLeaveRequest(id, { status });
            if (!row) {
                failed.push({ id, error: "Permohonan cuti tidak ditemukan." });
                continue;
            }
            updated.push(row);
            succeededIds.push(id);
        } catch (err) {
            failed.push({
                id,
                error: err instanceof Error ? err.message : "Gagal memperbarui status cuti.",
            });
        }
    }

    return { updated, succeededIds, failed };
}

function assertSupportedLeaveRange(startDate: string, endDate: string): void {
    const range = validateLeaveDateRange(startDate, endDate);
    if (!range.success) {
        throw new LeaveDateRangeError(range.message);
    }
}

/**
 * Ubah kolom attachment lama (dataURL/base64) menjadi kolom disk baru.
 * Kosong/null → semua kolom null (dual reader jatuh ke base64 lama bila ada).
 */
async function resolveLeaveAttachmentColumns(
    attachment: string | null | undefined,
    explicitMaxBytes?: number,
): Promise<{ attachment: string | null; attachmentPath: string | null; attachmentMime: string | null; attachmentSize: number | null }> {
    if (!attachment) {
        return { attachment: null, attachmentPath: null, attachmentMime: null, attachmentSize: null };
    }
    const maxBytes = await resolveLeaveAttachmentLimitBytes(explicitMaxBytes);
    const parsed = parseLeaveAttachmentDataUrl(attachment, maxBytes);
    const saved = await saveLeaveAttachment(parsed.buffer, parsed.mime, maxBytes);
    return {
        attachment: null,
        attachmentPath: saved.filename,
        attachmentMime: saved.mime,
        attachmentSize: saved.size,
    };
}

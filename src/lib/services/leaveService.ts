import { prisma } from "../prisma";
import { LeaveRequest } from "@/types";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { LeaveDateRangeError, validateLeaveDateRange } from "@/lib/services/leaveDateRange";
import { assertAllowedFile } from "@/lib/fileMagic";
import { getUploadLimit } from "@/lib/services/appSettingsService";
import { toDateString } from "@/lib/utils";
import { toUTCDateKey } from "@/lib/timezone";

/** Tipe inferensi Prisma untuk LeaveRequest beserta relasi employee-nya */
export type LeaveRequestWithEmployee = Prisma.LeaveRequestGetPayload<{
    include: {
        employee: {
            select: { name: true; employeeId: true; totalLeave: true; usedLeave: true };
        };
    };
}>;

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
    constructor(message: string) {
        super(message);
        this.name = "LeaveAttachmentError";
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
    return rows;
}

export async function createLeaveRequest(data: Omit<LeaveRequest, "id">, opts?: { attachmentMaxBytes?: number }): Promise<LeaveRequest> {
    const startDate = toDateString(data.startDate);
    const endDate = toDateString(data.endDate);
    assertSupportedLeaveRange(startDate, endDate);

    // Pre-check: validasi saldo cuti untuk tipe annual
    if (data.type === "annual") {
        const employee = await prisma.employee.findUnique({
            where: { employeeId: data.employeeId },
            select: { totalLeave: true, usedLeave: true },
        });

        if (!employee) {
            throw new Error("Data karyawan tidak ditemukan.");
        }

        // Hitung hari kerja per tanggal dengan shift efektif masing-masing hari (mendukung rotasi).
        const { countWorkingDaysForEmployee } = await import("@/lib/services/shiftAssignmentService");
        const requestedDays = await countWorkingDaysForEmployee(
            prisma,
            data.employeeId,
            startDate,
            endDate,
        );
        const remainingLeave = employee.totalLeave - employee.usedLeave;

        if (requestedDays > remainingLeave) {
            throw new Error(
                `Sisa cuti tahunan tidak mencukupi. Sisa: ${remainingLeave} hari, dibutuhkan: ${requestedDays} hari kerja.`
            );
        }
    }

    const row = await prisma.leaveRequest.create({
        data: {
            employeeId: data.employeeId,
            type: data.type,
            startDate: toUTCDateKey(startDate),
            endDate: toUTCDateKey(endDate),
            reason: data.reason,
            status: data.status,
            // Lampiran baru TIDAK disimpan sebagai base64: server memindahkan
            // dataURL klien ke disk privat + mengisi path/mime/size. Baris
            // lawas dengan base64 tetap dibaca apa adanya (dual reader).
            ...(await resolveLeaveAttachmentColumns(data.attachment, opts?.attachmentMaxBytes)),
            // createdAt: @default(now()) — tidak perlu diisi
        },
    });
    return toLeaveRequest(row);
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

    const startDate = toDateString(data.startDate || existing.startDate);
    const endDate = toDateString(data.endDate || existing.endDate);
    assertSupportedLeaveRange(startDate, endDate);

    // Balance Recalculation Logic
    // Hitung hari kerja per tanggal dengan shift efektif masing-masing hari (mendukung rotasi).
    const { countWorkingDaysForEmployee } = await import("@/lib/services/shiftAssignmentService");

    if (existing.type === "annual") {
        if (data.status === "approved" || (existing.status === "approved" && (data.startDate || data.endDate))) {
            const oldDays = await countWorkingDaysForEmployee(
                prisma,
                existing.employeeId,
                toDateString(existing.startDate),
                toDateString(existing.endDate),
            );
            const newDays = await countWorkingDaysForEmployee(
                prisma,
                existing.employeeId,
                toDateString(data.startDate || existing.startDate),
                toDateString(data.endDate || existing.endDate),
            );

            let diff = 0;
            if (existing.status !== "approved" && data.status === "approved") {
                // Changing from pending/rejected to approved
                diff = newDays;
            } else if (existing.status === "approved" && data.status !== "rejected") {
                // Already approved, just adjusting dates
                diff = newDays - oldDays;
            }

            if (diff !== 0) {
                if (diff > 0 && (existing.employee.totalLeave - existing.employee.usedLeave) < diff) {
                    throw new Error(`Sisa cuti karyawan tidak mencukupi untuk persetujuan ini.`);
                }
                await prisma.employee.update({
                    where: { employeeId: existing.employeeId },
                    data: { usedLeave: { increment: diff } }
                });
            }
        } else if (existing.status === "approved" && data.status === "rejected") {
            // Reversing an approval
            const days = await countWorkingDaysForEmployee(
                prisma,
                existing.employeeId,
                toDateString(existing.startDate),
                toDateString(existing.endDate),
            );
            await prisma.employee.update({
                where: { employeeId: existing.employeeId },
                data: { usedLeave: { decrement: days } }
            });
        }
    }

    const row = await prisma.leaveRequest.update({
        where: { id },
        data: {
            ...(data.status !== undefined && { status: data.status }),
            ...(data.startDate !== undefined && { startDate: toUTCDateKey(startDate) }),
            ...(data.endDate !== undefined && { endDate: toUTCDateKey(endDate) }),
            ...(data.reason !== undefined && { reason: data.reason }),
        },
    });
    return toLeaveRequest(row);
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

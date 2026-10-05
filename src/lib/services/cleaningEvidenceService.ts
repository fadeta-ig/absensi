import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { isWig002 } from "@/lib/services/cleaningService";
import type { SessionPayload } from "@/lib/auth";
import {
    DEFAULT_CLEANING_EVIDENCE_MAX_PHOTOS,
    DEFAULT_UPLOAD_LIMITS_MB,
    getCleaningEvidenceMaxPhotos,
    getUploadLimit,
} from "@/lib/services/appSettingsService";
import { sanitizeString } from "@/lib/middleware/sanitize";
import logger from "@/lib/logger";

/**
 * Evidence foto cleaning per item (Tahap 1).
 * Disk + path on-premise di luar public/ agar wajib lewat route ber-auth.
 */
export const CLEANING_EVIDENCE_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "cleaning-evidence");

const CLEANING_EVIDENCE_RELATIVE_PATTERN =
    /^[A-Za-z0-9_-]+\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i;

export const CLEANING_EVIDENCE_MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
};

// Idempotency Tahap 1+: reuse tabel `cleaning_approval_idempotency` yang sama
// dengan scope baru (JANGAN ubah tabelnya, JANGAN buat tabel idempotency baru).
export const CLEANING_PARAF_IDEMPOTENCY_SCOPE = "cleaning_daily_paraf";
export const CLEANING_EVIDENCE_IDEMPOTENCY_SCOPE = "cleaning_evidence_upload";

/** Kembalikan absolute path bila relative path valid dan di dalam root; selain itu null. */
export function resolveCleaningEvidencePath(relativePath: string): string | null {
    if (typeof relativePath !== "string" || !CLEANING_EVIDENCE_RELATIVE_PATTERN.test(relativePath)) return null;
    const resolved = path.resolve(CLEANING_EVIDENCE_STORAGE_ROOT, relativePath);
    if (!resolved.startsWith(`${CLEANING_EVIDENCE_STORAGE_ROOT}${path.sep}`)) return null;
    return resolved;
}

/** Baca berkas evidence dari relative path yang tervalidasi. */
export async function readCleaningEvidenceFile(relativePath: string): Promise<Buffer> {
    const absolutePath = resolveCleaningEvidencePath(relativePath);
    if (!absolutePath) {
        throw new Error("Lokasi evidence cleaning tidak valid.");
    }
    return readFile(absolutePath);
}

export interface CleaningEvidenceRecord {
    id: string;
    roomId: string;
    wibDate: string;
    filePath: string;
    mimeType: string;
}

/**
 * Otorisasi serve privat: pekerja pemilik ruangan-tanggal / WIG002 / reviewer.
 * - WIG002 (ga.manage) selalu boleh.
 * - Pekerja: assignment efektif pada wibDate untuk roomId tersebut.
 * - Reviewer: employeeId terdaftar sebagai inspected/known pada bulan berjalan.
 */
export async function hasCleaningEvidenceAccess(
    session: SessionPayload,
    evidence: Pick<CleaningEvidenceRecord, "roomId" | "wibDate">
): Promise<boolean> {
    if (isWig002(session)) return true;
    const { isCleaningTopViewer } = await import("@/lib/services/appSettingsService");
    if (await isCleaningTopViewer(session).catch(() => false)) return true;

    const assignment = await prisma.cleaningWorkerAssignment.findFirst({
        where: {
            userId: session.userId,
            roomId: evidence.roomId,
            startsOnWibDate: { lte: evidence.wibDate },
            OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: evidence.wibDate } }],
        },
        select: { id: true },
    });
    if (assignment) return true;

    if (session.employeeId) {
        const monthWib = evidence.wibDate.slice(0, 7);
        const review = await prisma.cleaningMonthlyApproval.findFirst({
            where: {
                roomId: evidence.roomId,
                monthWib,
                OR: [
                    { inspectedByEmployeeId: session.employeeId },
                    { knownByEmployeeId: session.employeeId },
                ],
            },
            select: { id: true },
        });
        if (review) return true;
    }

    return false;
}

// ─── Tahap 3: upload evidence per item (TAMBAH; fungsi serve Tahap 1 di atas JANGAN diubah) ───
// Foto bukti PER ITEM checklist harian: opsional, batas GLOBAL maxPhotos
// (default 3 via AppSetting `cleaning.evidence.maxPhotos`) + maxMb per foto.
// Disk + path on-premise (base64 dilarang). SENGAJA tanpa guard hari-ini:
// endpoint upload terpisah sehingga susulan untuk tanggal lampau tetap boleh
// tanpa membuka centang lama.

export class CleaningEvidenceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = "CleaningEvidenceError";
    }
}

export interface SaveCleaningEvidenceInput {
    checklistItemId: string;
    buffer: Buffer;
    /** Klaim MIME klien — wajib "image/jpeg", diverifikasi ulang via magic byte. */
    mime: string;
    uploaderUserId: string;
    note?: string | null;
}

/** Validasi JPEG: header SOI + penanda akhir EOI (menolak file palsu berheader saja). */
function isJpegBytes(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    const hasSoi = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const hasEoi = buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
    return hasSoi && hasEoi;
}

function formatLimitMb(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * Simpan satu foto evidence ke `storage/cleaning-evidence/{itemUuid}/{wibDate}/{uuid}.jpg`
 * via `mkdir recursive + writeFile wx`, lalu isi row DB
 * (path/mime/size/sha256/capturedAt/uploader). Bila DB gagal, berkas yatim
 * dihapus (cleanup-yatim). 409 bila jumlah existing per item mencapai maxPhotos.
 *
 * Catatan path: segmen `{wibDate}` di tengah menjaga kompatibilitas guard
 * serve Tahap 1 (`resolveCleaningEvidencePath` mensyaratkan pola
 * `{segmen}/{YYYY-MM-DD}/{berkas}.jpg`) agar berkas baru tetap dapat
 * diserve tanpa mengubah fungsi serve Tahap 1.
 */
export async function saveCleaningEvidence(input: SaveCleaningEvidenceInput) {
    const { checklistItemId, buffer, mime, uploaderUserId } = input;
    if (!checklistItemId || typeof checklistItemId !== "string") {
        throw new CleaningEvidenceError("checklistItemId wajib diisi.", 400);
    }
    if (!uploaderUserId || typeof uploaderUserId !== "string") {
        throw new CleaningEvidenceError("Uploader tidak valid.", 400);
    }
    if (mime !== "image/jpeg" || !Buffer.isBuffer(buffer) || !isJpegBytes(buffer)) {
        throw new CleaningEvidenceError("Foto harus berformat JPEG dari kamera aplikasi.", 400);
    }

    let maxBytes: number;
    try {
        const limitMb = await getUploadLimit("upload.cleaningEvidence.maxMb");
        const effectiveMb =
            Number.isFinite(limitMb) && limitMb > 0
                ? limitMb
                : DEFAULT_UPLOAD_LIMITS_MB["upload.cleaningEvidence.maxMb"];
        maxBytes = Math.floor(effectiveMb * 1024 * 1024);
    } catch {
        maxBytes = Math.floor(DEFAULT_UPLOAD_LIMITS_MB["upload.cleaningEvidence.maxMb"] * 1024 * 1024);
    }
    if (buffer.length > maxBytes) {
        throw new CleaningEvidenceError(
            `Ukuran foto maksimal ${formatLimitMb(maxBytes)}.`,
            413
        );
    }

    const item = await prisma.cleaningDailyChecklistItem.findUnique({
        where: { id: checklistItemId },
        include: { checklist: { select: { roomId: true, wibDate: true } } },
    });
    if (!item?.checklist) {
        throw new CleaningEvidenceError("Item checklist tidak ditemukan.", 404);
    }

    const maxPhotos = await getCleaningEvidenceMaxPhotos();
    const effectiveMaxPhotos =
        Number.isFinite(maxPhotos) && maxPhotos > 0
            ? Math.floor(maxPhotos)
            : DEFAULT_CLEANING_EVIDENCE_MAX_PHOTOS;
    const existingCount = await prisma.cleaningEvidencePhoto.count({
        where: { checklistItemId: item.id },
    });
    if (existingCount >= effectiveMaxPhotos) {
        throw new CleaningEvidenceError(
            `Batas ${effectiveMaxPhotos} foto per item sudah tercapai.`,
            409
        );
    }

    const photoId = randomUUID();
    const relativePath = `${item.id}/${item.checklist.wibDate}/${photoId}.jpg`;
    const absolutePath = resolveCleaningEvidencePath(relativePath);
    if (!absolutePath) {
        throw new CleaningEvidenceError("Lokasi penyimpanan evidence tidak valid.", 500);
    }
    await mkdir(path.dirname(absolutePath), { recursive: true });
    try {
        await writeFile(absolutePath, buffer, { flag: "wx" });
    } catch (error) {
        await unlink(absolutePath).catch(() => undefined);
        throw error;
    }

    const cleanedNote =
        typeof input.note === "string" && sanitizeString(input.note)
            ? sanitizeString(input.note).slice(0, 1000)
            : null;
    try {
        // Hitung ulang dalam transaksi dengan kunci baris checklist agar dua
        // unggahan bersamaan tidak sama-sama lolos kuota.
        return await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM cleaning_daily_checklists WHERE id = ${item.checklistId} FOR UPDATE`;
            const recount = await tx.cleaningEvidencePhoto.count({
                where: { checklistItemId: item.id },
            });
            if (recount >= effectiveMaxPhotos) {
                throw new CleaningEvidenceError(
                    `Batas ${effectiveMaxPhotos} foto per item sudah tercapai.`,
                    409
                );
            }
            return tx.cleaningEvidencePhoto.create({
                data: {
                    checklistItemId: item.id,
                    roomId: item.checklist.roomId,
                    wibDate: item.checklist.wibDate,
                    filePath: relativePath,
                    mimeType: "image/jpeg",
                    size: buffer.length,
                    sha256: createHash("sha256").update(buffer).digest("hex"),
                    capturedAt: new Date(),
                    uploadedByUserId: uploaderUserId,
                    note: cleanedNote,
                },
            });
        });
    } catch (error) {
        await unlink(absolutePath).catch(() => undefined);
        if (error instanceof CleaningEvidenceError) {
            logger.warn("Cleaning evidence quota reached on recount", {
                checklistItemId: item.id,
            });
        } else {
            logger.warn("Cleaning evidence DB insert failed, orphan file removed", {
                checklistItemId: item.id,
            });
        }
        throw error;
    }
}

export interface EvidenceVerificationStatus {
    parafExists: boolean;
    signedExists: boolean;
    needsReverify: boolean;
}

/**
 * Status verifikasi foto susulan (A3): true bila tanggal itu sudah diparaf
 * atau periode bulanannya sudah ditandatangani — foto baru belum tercakup
 * pemeriksaan tersebut dan perlu diverifikasi ulang oleh atasan.
 */
export async function checkEvidenceVerificationStatus(
    roomId: string,
    wibDate: string
): Promise<EvidenceVerificationStatus> {
    const [paraf, approval] = await Promise.all([
        prisma.cleaningDailyParaf.findFirst({
            where: { roomId, wibDate },
            select: { id: true },
        }),
        prisma.cleaningMonthlyApproval.findFirst({
            where: { roomId, monthWib: wibDate.slice(0, 7) },
            select: { signatures: { where: { status: "SIGNED" }, select: { id: true } } },
        }),
    ]);
    const parafExists = Boolean(paraf);
    const signedExists = Boolean(approval?.signatures?.length);
    return { parafExists, signedExists, needsReverify: parafExists || signedExists };
}

export interface CleaningEvidenceListItem {
    id: string;
    checklistItemId: string;
    mimeType: string;
    size: number;
    capturedAt: Date;
    note: string | null;
    createdAt: Date;
    uploaderName: string | null;
}

/** Daftar foto per item untuk klien (tanpa filePath storage; URL serve dirakit route). */
export async function listCleaningEvidenceByItem(
    checklistItemId: string
): Promise<CleaningEvidenceListItem[]> {
    const rows = await prisma.cleaningEvidencePhoto.findMany({
        where: { checklistItemId },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            checklistItemId: true,
            mimeType: true,
            size: true,
            capturedAt: true,
            note: true,
            createdAt: true,
            uploadedBy: { select: { displayName: true } },
        },
    });
    return rows.map((row) => ({
        id: row.id,
        checklistItemId: row.checklistItemId,
        mimeType: row.mimeType,
        size: row.size,
        capturedAt: row.capturedAt,
        note: row.note,
        createdAt: row.createdAt,
        uploaderName: row.uploadedBy?.displayName ?? null,
    }));
}

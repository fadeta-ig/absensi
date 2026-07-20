import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rmdir, unlink, writeFile } from "fs/promises";
import path from "path";
import type { Prisma } from "@prisma/client";
import sharp from "sharp";
import type {
    VisitPhotoCategory,
    VisitPhotoDraft,
    VisitPhotoPhase,
} from "@/types";

export const MIN_VISIT_PHOTOS = 2;
export const MAX_VISIT_PHOTOS = 5;
export const MAX_VISIT_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_VISIT_PHOTO_PIXELS = 16_000_000;
export const VISIT_PHOTO_OVERLAY_VERSION = 1;

const STORAGE_ROOT = path.resolve(process.cwd(), "storage", "visit-photos");
const JPEG_DATA_URL_PREFIX = "data:image/jpeg;base64,";

const CATEGORY_LABELS: Record<VisitPhotoCategory, string> = {
    LOKASI: "Lokasi",
    AKTIVITAS: "Aktivitas",
    HASIL: "Hasil",
    DOKUMEN: "Dokumen",
    LAINNYA: "Lainnya",
};

export class VisitPhotoValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "VisitPhotoValidationError";
    }
}

export interface VisitPhotoLocationEvidence {
    lat: number;
    lng: number;
    accuracyMeters?: number | null;
    acquiredAt?: string | null;
}

export interface PrepareVisitPhotosInput {
    visitId: string;
    clientName: string;
    phase: VisitPhotoPhase;
    officialTimestamp: Date;
    photos: VisitPhotoDraft[];
    location: VisitPhotoLocationEvidence;
    distanceToTargetMeters?: number | null;
}

export interface PreparedVisitPhotos {
    records: Prisma.VisitPhotoCreateManyInput[];
    cleanup: () => Promise<void>;
}

function safeResolvedPath(relativePath: string): string {
    const resolved = path.resolve(STORAGE_ROOT, relativePath);
    if (!resolved.startsWith(`${STORAGE_ROOT}${path.sep}`)) {
        throw new Error("Lokasi penyimpanan foto kunjungan tidak valid.");
    }
    return resolved;
}

function parseJpegDataUrl(dataUrl: string): Buffer {
    if (!dataUrl.startsWith(JPEG_DATA_URL_PREFIX)) {
        throw new VisitPhotoValidationError("Foto harus berformat JPEG dari kamera aplikasi.");
    }

    const encoded = dataUrl.slice(JPEG_DATA_URL_PREFIX.length);
    if (
        encoded.length === 0
        || encoded.length % 4 !== 0
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    ) {
        throw new VisitPhotoValidationError("Data foto tidak valid.");
    }

    const buffer = Buffer.from(encoded, "base64");
    const canonicalInput = encoded.replace(/=+$/, "");
    const canonicalDecoded = buffer.toString("base64").replace(/=+$/, "");
    if (canonicalInput !== canonicalDecoded) {
        throw new VisitPhotoValidationError("Data Base64 foto tidak valid.");
    }
    if (buffer.length === 0 || buffer.length > MAX_VISIT_PHOTO_BYTES) {
        throw new VisitPhotoValidationError("Ukuran setiap foto harus lebih dari 0 dan maksimal 2 MB.");
    }
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        throw new VisitPhotoValidationError("Isi foto tidak sesuai dengan format JPEG.");
    }

    return buffer;
}

function parseDeviceTimestamp(value: string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function escapeXml(value: string): string {
    return value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function truncate(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatWIBTimestamp(value: Date): string {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)?.value ?? "";

    return `${part("day")}-${part("month")}-${part("year")} ${part("hour")}:${part("minute")}:${part("second")} WIB (+07:00)`;
}

function createWatermarkSvg(input: {
    width: number;
    height: number;
    phase: VisitPhotoPhase;
    sequence: number;
    totalPhotos: number;
    visitId: string;
    clientName: string;
    category: VisitPhotoCategory;
    caption?: string | null;
    officialTimestamp: Date;
    location: VisitPhotoLocationEvidence;
    distanceToTargetMeters?: number | null;
}): Buffer {
    const padding = Math.max(18, Math.round(input.width * 0.025));
    const titleSize = Math.max(18, Math.round(input.width * 0.023));
    const bodySize = Math.max(15, Math.round(input.width * 0.018));
    const lineHeight = Math.max(24, Math.round(bodySize * 1.45));
    const panelHeight = Math.min(
        Math.round(input.height * 0.42),
        Math.max(128, padding * 2 + titleSize + lineHeight * 3),
    );
    const panelTop = input.height - panelHeight;
    const phaseLabel = input.phase === "CLOCK_IN" ? "CLOCK IN" : "CLOCK OUT";
    const evidenceId = input.visitId.replace(/-/g, "").slice(0, 8).toUpperCase();
    const detail = input.caption?.trim() || CATEGORY_LABELS[input.category];
    const accuracy = input.location.accuracyMeters == null
        ? "akurasi tidak tersedia"
        : `akurasi ±${Math.round(input.location.accuracyMeters)} m`;
    const distance = input.distanceToTargetMeters == null
        ? "jarak target tidak tersedia"
        : `${Math.round(input.distanceToTargetMeters)} m dari target`;
    const lines = [
        `WIG • ${phaseLabel} • Foto ${input.sequence}/${input.totalPhotos} • ${evidenceId}`,
        `${formatWIBTimestamp(input.officialTimestamp)} • Waktu server`,
        `${truncate(input.clientName, 48)} — ${truncate(detail, 72)}`,
        `${input.location.lat.toFixed(6)}, ${input.location.lng.toFixed(6)} • ${accuracy} • ${distance}`,
    ].map(escapeXml);
    const titleY = panelTop + padding + titleSize;

    return Buffer.from(`
        <svg width="${input.width}" height="${input.height}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="${panelTop}" width="${input.width}" height="${panelHeight}" fill="#111827" fill-opacity="0.88" />
            <text x="${padding}" y="${titleY}" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="700">${lines[0]}</text>
            <text x="${padding}" y="${titleY + lineHeight}" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="${bodySize}" font-weight="600">${lines[1]}</text>
            <text x="${padding}" y="${titleY + lineHeight * 2}" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="${bodySize}">${lines[2]}</text>
            <text x="${padding}" y="${titleY + lineHeight * 3}" fill="#E5E7EB" font-family="Arial, Helvetica, sans-serif" font-size="${bodySize}">${lines[3]}</text>
        </svg>
    `);
}

async function prepareSinglePhoto(input: PrepareVisitPhotosInput, photo: VisitPhotoDraft, index: number) {
    const originalBuffer = parseJpegDataUrl(photo.dataUrl);
    const metadata = await sharp(originalBuffer, {
        failOn: "error",
        limitInputPixels: MAX_VISIT_PHOTO_PIXELS,
    }).metadata();

    if (metadata.format !== "jpeg" || !metadata.width || !metadata.height) {
        throw new VisitPhotoValidationError("Foto JPEG tidak dapat dibaca atau tidak memiliki dimensi yang valid.");
    }
    if (metadata.width * metadata.height > MAX_VISIT_PHOTO_PIXELS) {
        throw new VisitPhotoValidationError("Resolusi foto terlalu besar.");
    }

    const normalized = await sharp(originalBuffer, {
        failOn: "error",
        limitInputPixels: MAX_VISIT_PHOTO_PIXELS,
    })
        .rotate()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const width = normalized.info.width;
    const height = normalized.info.height;
    const watermark = createWatermarkSvg({
        width,
        height,
        phase: input.phase,
        sequence: index + 1,
        totalPhotos: input.photos.length,
        visitId: input.visitId,
        clientName: input.clientName,
        category: photo.category,
        caption: photo.caption,
        officialTimestamp: input.officialTimestamp,
        location: input.location,
        distanceToTargetMeters: input.distanceToTargetMeters,
    });
    const stampedBuffer = await sharp(normalized.data, {
        raw: {
            width,
            height,
            channels: normalized.info.channels,
        },
    })
        .composite([{ input: watermark, top: 0, left: 0 }])
        .jpeg({ quality: 84, mozjpeg: true })
        .toBuffer();

    const id = randomUUID();
    const phaseFolder = input.phase.toLowerCase();
    const originalPath = path.join(input.visitId, phaseFolder, `${id}-original.jpg`).replace(/\\/g, "/");
    const stampedPath = path.join(input.visitId, phaseFolder, `${id}-stamped.jpg`).replace(/\\/g, "/");
    const originalAbsolutePath = safeResolvedPath(originalPath);
    const stampedAbsolutePath = safeResolvedPath(stampedPath);
    await mkdir(path.dirname(originalAbsolutePath), { recursive: true });

    try {
        await writeFile(originalAbsolutePath, originalBuffer, { flag: "wx" });
        await writeFile(stampedAbsolutePath, stampedBuffer, { flag: "wx" });
    } catch (error) {
        await Promise.all([
            unlink(originalAbsolutePath).catch(() => undefined),
            unlink(stampedAbsolutePath).catch(() => undefined),
        ]);
        throw error;
    }

    const receivedAtServer = new Date();
    const record: Prisma.VisitPhotoCreateManyInput = {
        id,
        visitId: input.visitId,
        phase: input.phase,
        sequence: index + 1,
        category: photo.category,
        caption: photo.caption?.trim() || null,
        originalPath,
        stampedPath,
        capturedAtDevice: parseDeviceTimestamp(photo.capturedAtDevice),
        receivedAtServer,
        officialTimestamp: input.officialTimestamp,
        latitude: input.location.lat,
        longitude: input.location.lng,
        accuracyMeters: input.location.accuracyMeters ?? null,
        distanceToTargetMeters: input.distanceToTargetMeters ?? null,
        sha256Original: createHash("sha256").update(originalBuffer).digest("hex"),
        mimeType: "image/jpeg",
        fileSize: originalBuffer.length,
        width,
        height,
        overlayVersion: VISIT_PHOTO_OVERLAY_VERSION,
        createdAt: receivedAtServer,
    };

    return record;
}

export async function prepareVisitPhotos(input: PrepareVisitPhotosInput): Promise<PreparedVisitPhotos> {
    if (input.photos.length < MIN_VISIT_PHOTOS || input.photos.length > MAX_VISIT_PHOTOS) {
        throw new VisitPhotoValidationError(
            `Jumlah foto harus antara ${MIN_VISIT_PHOTOS} dan ${MAX_VISIT_PHOTOS}.`,
        );
    }

    const records: Prisma.VisitPhotoCreateManyInput[] = [];
    const cleanup = async () => {
        await Promise.all(records.flatMap((record) => [
            unlink(safeResolvedPath(record.originalPath)).catch(() => undefined),
            unlink(safeResolvedPath(record.stampedPath)).catch(() => undefined),
        ]));
        const phaseDirectories = Array.from(new Set(
            records.map((record) => path.dirname(safeResolvedPath(record.originalPath))),
        ));
        for (const phaseDirectory of phaseDirectories) {
            await rmdir(phaseDirectory).catch(() => undefined);
            await rmdir(path.dirname(phaseDirectory)).catch(() => undefined);
        }
    };

    try {
        for (let index = 0; index < input.photos.length; index += 1) {
            records.push(await prepareSinglePhoto(input, input.photos[index], index));
        }
        return { records, cleanup };
    } catch (error) {
        await cleanup();
        if (error instanceof VisitPhotoValidationError) throw error;
        throw new VisitPhotoValidationError("Foto tidak dapat diproses oleh server.");
    }
}

export async function readVisitPhotoFile(relativePath: string): Promise<Buffer> {
    return readFile(safeResolvedPath(relativePath));
}

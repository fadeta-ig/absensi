import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { assertAllowedFile, extensionForMime } from "@/lib/fileMagic";
import { getUploadLimit } from "@/lib/services/appSettingsService";
import { prisma } from "@/lib/prisma";

// ─── Avatar: transport JSON-base64 dipertahankan, server pindah ke disk ───
// Upload oleh HR via PUT /api/employees/[id]/avatar; serve privat /api/auth/avatar/[filename].
// Klien render opaque via avatarUrl (URL serve atau https:// eksternal lama).

/** Root privat avatar (di luar public/ agar wajib lewat route ber-auth). */
export const AVATAR_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "avatars");

/** Fallback bila setting upload.avatar.maxMb belum ada / DB gagal dibaca. */
export const DEFAULT_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const AVATAR_DATA_PREFIXES: Record<string, string> = {
    "data:image/jpeg;base64,": "image/jpeg",
    "data:image/png;base64,": "image/png",
    "data:image/webp;base64,": "image/webp",
};

const AVATAR_FILENAME_PATTERN = /^[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/i;
const AVATAR_EMPLOYEE_PATTERN = /^[A-Za-z0-9_-]+$/;

export class AvatarUploadError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = "AvatarUploadError";
        this.statusCode = statusCode;
    }
}

export function avatarServeUrl(filename: string): string {
    return `/api/auth/avatar/${encodeURIComponent(filename)}`;
}

/** Kembalikan absolute path bila employeeId + filename valid dan di dalam root. */
export function resolveAvatarPath(employeeId: string, filename: string): string | null {
    if (!AVATAR_EMPLOYEE_PATTERN.test(employeeId)) return null;
    if (!AVATAR_FILENAME_PATTERN.test(filename)) return null;
    const resolved = path.resolve(AVATAR_STORAGE_ROOT, employeeId, filename);
    if (!resolved.startsWith(`${AVATAR_STORAGE_ROOT}${path.sep}`)) return null;
    return resolved;
}

/** Batas avatar efektif: setting upload.avatar.maxMb, fallback bawaan 2MB. */
export async function resolveAvatarLimitBytes(): Promise<number> {
    try {
        const limitMb = await getUploadLimit("upload.avatar.maxMb");
        if (Number.isFinite(limitMb) && limitMb > 0) {
            return Math.floor(limitMb * 1024 * 1024);
        }
    } catch {
        // Fallback ke konstanta bawaan di bawah.
    }
    return DEFAULT_AVATAR_MAX_BYTES;
}

/**
 * Parse dataURL avatar dari klien (kontrak lama dipertahankan, validasi bentuk
 * SUDAH ada di avatarUrlSchema) menjadi buffer terverifikasi magic-byte.
 * Cukup tulis buffer jpeg/png/webp apa adanya — tanpa konversi sharp.
 */
export function parseAvatarDataUrl(dataUrl: string, maxBytes: number): { buffer: Buffer; mime: string; ext: string } {
    const prefix = Object.keys(AVATAR_DATA_PREFIXES).find((candidate) => dataUrl.startsWith(candidate));
    if (prefix === undefined) {
        throw new AvatarUploadError("Format avatar tidak didukung. Gunakan JPG, PNG, atau WEBP.");
    }
    const mime = AVATAR_DATA_PREFIXES[prefix];
    const encoded = dataUrl.slice(prefix.length);
    if (encoded.length === 0 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new AvatarUploadError("Data avatar tidak valid.");
    }
    const buffer = Buffer.from(encoded, "base64");
    const canonicalInput = encoded.replace(/=+$/, "");
    const canonicalDecoded = buffer.toString("base64").replace(/=+$/, "");
    if (canonicalInput !== canonicalDecoded) {
        throw new AvatarUploadError("Data Base64 avatar tidak valid.");
    }
    if (buffer.length === 0 || buffer.length > maxBytes) {
        const mb = maxBytes / (1024 * 1024);
        throw new AvatarUploadError(`Ukuran avatar maksimal ${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB.`);
    }
    try {
        assertAllowedFile(buffer, mime);
    } catch {
        throw new AvatarUploadError("Isi avatar tidak sesuai dengan format gambar.");
    }
    const ext = extensionForMime(mime);
    if (!ext) {
        throw new AvatarUploadError("Format avatar tidak didukung. Gunakan JPG, PNG, atau WEBP.");
    }
    return { buffer, mime, ext };
}

/** Simpan buffer avatar terverifikasi ke folder karyawan; kembalikan path relatif + URL serve. */
export async function saveAvatarBuffer(
    employeeId: string,
    buffer: Buffer,
    mime: string,
    maxBytes: number,
): Promise<{ relativePath: string; serveUrl: string; size: number }> {
    const ext = extensionForMime(mime);
    if (!ext || !["image/jpeg", "image/png", "image/webp"].includes(mime)) {
        throw new AvatarUploadError("Format avatar tidak didukung. Gunakan JPG, PNG, atau WEBP.");
    }
    if (buffer.length === 0 || buffer.length > maxBytes) {
        const mb = maxBytes / (1024 * 1024);
        throw new AvatarUploadError(`Ukuran avatar maksimal ${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB.`);
    }
    try {
        assertAllowedFile(buffer, mime);
    } catch {
        throw new AvatarUploadError("Isi avatar tidak sesuai dengan format gambar.");
    }
    const filename = `${randomUUID()}${ext}`;
    const target = resolveAvatarPath(employeeId, filename);
    if (!target) {
        throw new AvatarUploadError("Lokasi penyimpanan avatar tidak valid.");
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: "wx" });
    return { relativePath: `${employeeId}/${filename}`, serveUrl: avatarServeUrl(filename), size: buffer.length };
}

/**
 * Normalisasi server untuk foto HR: orientasi EXIF diterapkan, dimensi dibatasi,
 * keluaran selalu JPEG (metadata termasuk GPS dibuang oleh Sharp).
 */
const HR_AVATAR_MAX_DIMENSION = 1024;

export async function normalizeAvatarBuffer(buffer: Buffer): Promise<{ buffer: Buffer; mime: string }> {
    try {
        const out = await sharp(buffer)
            .rotate()
            .resize(HR_AVATAR_MAX_DIMENSION, HR_AVATAR_MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        return { buffer: out, mime: "image/jpeg" };
    } catch {
        throw new AvatarUploadError("Gagal memproses gambar. Gunakan berkas JPG, PNG, atau WEBP yang valid.");
    }
}

/**
 * Tetapkan foto avatar karyawan oleh HR (WIG001). Guard sesi ada di route.
 * `null` mengosongkan kedua kolom. Berkas lama sengaja TIDAK dihapus
 * (pembersihan file yatim = jobdesk IT operasional).
 */
export async function setEmployeeAvatarByHr(
    employeeUuid: string,
    avatarInput: string | null
): Promise<{ id: string; employeeId: string; avatarUrl: string | null }> {
    const employee = await prisma.employee.findUnique({
        where: { id: employeeUuid },
        select: { id: true, employeeId: true },
    });
    if (!employee) throw new AvatarUploadError("Data karyawan tidak ditemukan.", 404);
    if (avatarInput === null) {
        return prisma.employee.update({
            where: { id: employee.id },
            data: { avatarUrl: null, avatarPath: null },
            select: { id: true, employeeId: true, avatarUrl: true },
        });
    }
    const maxBytes = await resolveAvatarLimitBytes();
    const parsed = parseAvatarDataUrl(avatarInput, maxBytes);
    const normalized = await normalizeAvatarBuffer(parsed.buffer);
    const saved = await saveAvatarBuffer(employee.employeeId, normalized.buffer, normalized.mime, maxBytes);
    return prisma.employee.update({
        where: { id: employee.id },
        data: { avatarUrl: saved.serveUrl, avatarPath: saved.relativePath },
        select: { id: true, employeeId: true, avatarUrl: true },
    });
}

import { prisma } from "@/lib/prisma";

export class AppSettingsError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = "AppSettingsError";
    }
}

/** Batas bawah dan atas klem saat admin memperbarui batas upload (dalam MB). */
export const UPLOAD_LIMIT_MIN_MB = 0.5;
export const UPLOAD_LIMIT_MAX_MB = 50;

/** Umur cache baca batas upload sebelum dianggap kedaluwarsa (60 detik). */
const UPLOAD_LIMIT_CACHE_TTL_MS = 60_000;

export const UPLOAD_LIMIT_KEYS = [
    "upload.selfie.maxMb",
    "upload.visitPhoto.maxMb",
    "upload.news.maxMb",
    "upload.document.maxMb",
    "upload.leaveAttachment.maxMb",
    "upload.bast.maxMb",
    "upload.correction.maxMb",
    "upload.import.maxMb",
    "upload.avatar.maxMb",
    "upload.signature.maxMb",
] as const;

export type UploadLimitKey = (typeof UPLOAD_LIMIT_KEYS)[number];

export interface UploadLimitMeta {
    key: UploadLimitKey;
    label: string;
    description: string;
}

/** Label Indonesia untuk setiap kunci agar halaman pengaturan konsisten dengan service. */
export const UPLOAD_LIMIT_META: Record<UploadLimitKey, { label: string; description: string }> = {
    "upload.selfie.maxMb": {
        label: "Foto selfie presensi",
        description: "Foto bukti clock in / clock out presensi harian (attendanceSchema).",
    },
    "upload.visitPhoto.maxMb": {
        label: "Foto kunjungan / visit",
        description: "Batas per foto bukti kunjungan (visitPhotoService).",
    },
    "upload.news.maxMb": {
        label: "Media WIG News",
        description: "Lampiran gambar / dokumen pada unggahan berita.",
    },
    "upload.document.maxMb": {
        label: "Dokumen karyawan",
        description: "Berkas dokumen HR (KTP, kontrak, ijazah, dsb.).",
    },
    "upload.leaveAttachment.maxMb": {
        label: "Lampiran cuti",
        description: "Bukti pendukung pengajuan cuti (maksimal aktual 2MB di sisi klien).",
    },
    "upload.bast.maxMb": {
        label: "Dokumen BAST aset",
        description: "Berita Acara Serah Terima pada mutasi aset GA.",
    },
    "upload.correction.maxMb": {
        label: "Lampiran koreksi presensi",
        description: "Bukti pendukung koreksi clock in / clock out.",
    },
    "upload.import.maxMb": {
        label: "Impor data karyawan",
        description: "Berkas spreadsheet impor massal karyawan.",
    },
    "upload.avatar.maxMb": {
        label: "Avatar karyawan",
        description: "Foto profil karyawan (batas aktual ±2MB data URL).",
    },
    "upload.signature.maxMb": {
        label: "Tanda tangan inspeksi",
        description: "Payload PNG tanda tangan approval cleaning (batas aktual 256 KB).",
    },
};

/**
 * Nilai bawaan (MB) yang mencerminkan batas aktual di kode saat tabel
 * `app_settings` belum memiliki baris untuk kunci tersebut atau DB gagal dibaca.
 */
export const DEFAULT_UPLOAD_LIMITS_MB: Record<UploadLimitKey, number> = {
    "upload.selfie.maxMb": 2,
    "upload.visitPhoto.maxMb": 2,
    "upload.news.maxMb": 10,
    "upload.document.maxMb": 10,
    "upload.leaveAttachment.maxMb": 2,
    "upload.bast.maxMb": 5,
    "upload.correction.maxMb": 2,
    "upload.import.maxMb": 10,
    "upload.avatar.maxMb": 2,
    "upload.signature.maxMb": 0.25,
};

interface UploadLimitCacheEntry {
    valueMb: number;
    expiresAt: number;
}

const uploadLimitCache = new Map<UploadLimitKey, UploadLimitCacheEntry>();

export function isUploadLimitKey(key: string): key is UploadLimitKey {
    return (UPLOAD_LIMIT_KEYS as readonly string[]).includes(key);
}

/** Menjepit nilai MB ke rentang 0,5–50. */
export function clampUploadLimitMb(mb: number): number {
    if (!Number.isFinite(mb)) return UPLOAD_LIMIT_MIN_MB;
    return Math.min(UPLOAD_LIMIT_MAX_MB, Math.max(UPLOAD_LIMIT_MIN_MB, mb));
}

/** Menghapus cache batas upload (satu kunci atau seluruhnya). */
export function invalidateUploadLimitCache(key?: UploadLimitKey): void {
    if (key) {
        uploadLimitCache.delete(key);
        return;
    }
    uploadLimitCache.clear();
}

function readCachedLimit(key: UploadLimitKey): number | null {
    const entry = uploadLimitCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        uploadLimitCache.delete(key);
        return null;
    }
    return entry.valueMb;
}

function writeCachedLimit(key: UploadLimitKey, valueMb: number): void {
    uploadLimitCache.set(key, { valueMb, expiresAt: Date.now() + UPLOAD_LIMIT_CACHE_TTL_MS });
}

function parseStoredLimit(raw: string | null | undefined, key: UploadLimitKey): number {
    const parsed = raw === null || raw === undefined ? NaN : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_UPLOAD_LIMITS_MB[key];
    return parsed;
}

/**
 * Mengambil batas upload satu kunci dalam MB.
 * Cache 60 detik; gagal baca DB atau nilai rusak → fallback ke DEFAULTS.
 */
export async function getUploadLimit(key: UploadLimitKey): Promise<number> {
    const cached = readCachedLimit(key);
    if (cached !== null) return cached;

    try {
        const row = await prisma.appSetting.findUnique({ where: { key } });
        const valueMb = parseStoredLimit(row?.value, key);
        writeCachedLimit(key, valueMb);
        return valueMb;
    } catch {
        const fallback = DEFAULT_UPLOAD_LIMITS_MB[key];
        writeCachedLimit(key, fallback);
        return fallback;
    }
}

export interface UploadLimitEntry extends UploadLimitMeta {
    valueMb: number;
    source: "database" | "default";
}

/**
 * Mengambil seluruh batas upload sekaligus (satu query) untuk halaman pengaturan.
 * DB gagal → semua entri memakai DEFAULTS dengan source "default".
 */
export async function getAllUploadLimits(): Promise<UploadLimitEntry[]> {
    let stored = new Map<string, string>();
    try {
        const rows = await prisma.appSetting.findMany({
            where: { key: { in: [...UPLOAD_LIMIT_KEYS] } },
            select: { key: true, value: true },
        });
        stored = new Map(rows.map((row) => [row.key, row.value]));
    } catch {
        stored = new Map();
    }

    return UPLOAD_LIMIT_KEYS.map((key) => {
        const raw = stored.get(key);
        const parsed = raw === undefined ? NaN : Number(raw);
        const valid = Number.isFinite(parsed) && parsed > 0;
        const valueMb = valid ? parsed : DEFAULT_UPLOAD_LIMITS_MB[key];
        writeCachedLimit(key, valueMb);
        return {
            key,
            label: UPLOAD_LIMIT_META[key].label,
            description: UPLOAD_LIMIT_META[key].description,
            valueMb,
            source: valid ? ("database" as const) : ("default" as const),
        };
    });
}

/**
 * Memperbarui batas upload oleh admin. Nilai dijepit ke 0,5–50 MB,
 * disimpan sebagai string, lalu cache kunci tersebut di-invalidasi.
 *
 * Catatan: bawaan tanda tangan adalah 0,25 MB (256 KB) sesuai batas aktual;
 * klem 0,5–50 MB hanya berlaku saat admin menyimpan nilai baru.
 */
export async function updateUploadLimit(
    key: string,
    mb: number,
    actorUserId?: string | null
): Promise<{ key: UploadLimitKey; valueMb: number }> {
    if (!isUploadLimitKey(key)) {
        throw new AppSettingsError(`Kunci batas upload tidak dikenal: ${key}.`, 400);
    }
    if (typeof mb !== "number" || !Number.isFinite(mb)) {
        throw new AppSettingsError("Batas upload harus berupa angka dalam MB.", 400);
    }

    const valueMb = clampUploadLimitMb(mb);
    await prisma.appSetting.upsert({
        where: { key },
        update: { value: String(valueMb), updatedByUserId: actorUserId ?? null },
        create: { key, value: String(valueMb), updatedByUserId: actorUserId ?? null },
    });
    invalidateUploadLimitCache(key);
    return { key, valueMb };
}

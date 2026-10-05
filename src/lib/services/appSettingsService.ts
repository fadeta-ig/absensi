import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";

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
    "upload.cleaningEvidence.maxMb",
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
    "upload.cleaningEvidence.maxMb": {
        label: "Foto evidence cleaning",
        description: "Batas per foto evidence cleaning per item (Tahap 1, disk on-premise).",
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
    "upload.cleaningEvidence.maxMb": 2,
};

/** Pola libur mingguan cleaning (CSV day-of-week 0=Min..6=Sab, dinamis via setting). */
export const CLEANING_WEEKLY_OFF_DAYS_KEY = "cleaning.weeklyOffDays" as const;
export const DEFAULT_CLEANING_WEEKLY_OFF_DAYS_CSV = "0,6";
export const DEFAULT_CLEANING_WEEKLY_OFF_DAYS: readonly number[] = [0, 6];

/** Batas global jumlah foto evidence per item checklist (Tahap 1). */
export const CLEANING_EVIDENCE_MAX_PHOTOS_KEY = "cleaning.evidence.maxPhotos" as const;
export const DEFAULT_CLEANING_EVIDENCE_MAX_PHOTOS = 3;
export const CLEANING_EVIDENCE_MAX_PHOTOS_MIN = 1;
export const CLEANING_EVIDENCE_MAX_PHOTOS_MAX = 10;

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

// ─── Batas global jumlah foto evidence cleaning per item (Tahap 1) ───
// Disimpan di tabel app_settings yang sama sebagai string integer agar dapat
// diubah tanpa deploy ulang. Bukan bagian UPLOAD_LIMIT_KEYS (satuan count,
// bukan MB), sehingga endpoint /api/settings/uploads yang generik tidak
// perlu diubah — ia otomatis menampilkan kunci upload baru di atas.

let cleaningEvidenceMaxPhotosCache: { value: number; expiresAt: number } | null = null;

/** Menjepit jumlah foto ke rentang 1–10 dan membulatkan ke integer. */
export function clampCleaningEvidenceMaxPhotos(value: number): number {
    if (!Number.isFinite(value)) return CLEANING_EVIDENCE_MAX_PHOTOS_MIN;
    const rounded = Math.round(value);
    return Math.min(
        CLEANING_EVIDENCE_MAX_PHOTOS_MAX,
        Math.max(CLEANING_EVIDENCE_MAX_PHOTOS_MIN, rounded)
    );
}

export function invalidateCleaningEvidenceMaxPhotosCache(): void {
    cleaningEvidenceMaxPhotosCache = null;
}

/**
 * Mengambil batas global foto evidence per item.
 * Cache 60 detik; DB gagal / nilai rusak → fallback DEFAULT (3).
 */
export async function getCleaningEvidenceMaxPhotos(): Promise<number> {
    const cached = cleaningEvidenceMaxPhotosCache;
    if (cached && Date.now() <= cached.expiresAt) return cached.value;

    try {
        const row = await prisma.appSetting.findUnique({
            where: { key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY },
        });
        const parsed = row?.value === undefined ? NaN : Number(row.value);
        const value =
            Number.isFinite(parsed) && parsed > 0
                ? clampCleaningEvidenceMaxPhotos(parsed)
                : DEFAULT_CLEANING_EVIDENCE_MAX_PHOTOS;
        cleaningEvidenceMaxPhotosCache = { value, expiresAt: Date.now() + UPLOAD_LIMIT_CACHE_TTL_MS };
        return value;
    } catch {
        cleaningEvidenceMaxPhotosCache = {
            value: DEFAULT_CLEANING_EVIDENCE_MAX_PHOTOS,
            expiresAt: Date.now() + UPLOAD_LIMIT_CACHE_TTL_MS,
        };
        return DEFAULT_CLEANING_EVIDENCE_MAX_PHOTOS;
    }
}

/**
 * Memperbarui batas global foto evidence oleh admin. Nilai dijepit ke 1–10,
 * disimpan sebagai string integer.
 */
export async function updateCleaningEvidenceMaxPhotos(
    value: number,
    actorUserId?: string | null
): Promise<{ key: typeof CLEANING_EVIDENCE_MAX_PHOTOS_KEY; value: number }> {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new AppSettingsError("Batas jumlah foto harus berupa angka.", 400);
    }
    const clamped = clampCleaningEvidenceMaxPhotos(value);
    await prisma.appSetting.upsert({
        where: { key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY },
        update: { value: String(clamped), updatedByUserId: actorUserId ?? null },
        create: { key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY, value: String(clamped), updatedByUserId: actorUserId ?? null },
    });
    invalidateCleaningEvidenceMaxPhotosCache();
    return { key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY, value: clamped };
}

// ─── Pola libur mingguan cleaning (dinamis, CSV 0=Min..6=Sab) ───
// Disimpan di tabel app_settings yang sama sebagai CSV agar WIG002 dapat
// memilih hari apa saja (misal "3,4,5,6,0" untuk Rab–Min) tanpa deploy ulang.
// Bukan bagian UPLOAD_LIMIT_KEYS (satuan day-of-week, bukan MB).
// Tiru pola kunci count `cleaning.evidence.maxPhotos`: cache 60 detik,
// fallback DEFAULT bila DB gagal / nilai rusak.

let cleaningWeeklyOffDaysCache: { value: number[]; csv: string; expiresAt: number } | null = null;

function weeklyOffDaysError(): AppSettingsError {
    return new AppSettingsError(
        'Format hari libur mingguan tidak valid. Gunakan CSV 0 (Min)..6 (Sab), contoh "0,6".',
        400
    );
}

/** Normalisasi: integer 0–6 unik terurut. */
export function normalizeCleaningWeeklyOffDays(days: number[]): number[] {
    return [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
}

/** Serialisasi list → CSV (list kosong → string kosong = tanpa libur mingguan). */
export function serializeCleaningWeeklyOffDays(days: number[]): string {
    return normalizeCleaningWeeklyOffDays(days).join(",");
}

/**
 * Validasi input pola mingguan (CSV string atau array angka).
 * Melempar AppSettingsError bila format tidak valid.
 */
export function validateCleaningWeeklyOffDaysInput(value: string | number[]): number[] {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") return [];
        const parts = trimmed.split(",").map((part) => part.trim());
        if (parts.length === 0 || parts.length > 7) throw weeklyOffDaysError();
        const days: number[] = [];
        for (const part of parts) {
            if (!/^[0-6]$/.test(part)) throw weeklyOffDaysError();
            days.push(Number(part));
        }
        return normalizeCleaningWeeklyOffDays(days);
    }
    if (Array.isArray(value)) {
        if (value.length > 7) throw weeklyOffDaysError();
        for (const day of value) {
            if (!Number.isInteger(day) || day < 0 || day > 6) throw weeklyOffDaysError();
        }
        return normalizeCleaningWeeklyOffDays(value);
    }
    throw weeklyOffDaysError();
}

/**
 * Parse nilai tersimpan menjadi list (fallback DEFAULT bila null/rusak).
 * String kosong eksplisit → [] (tanpa libur mingguan).
 */
export function parseCleaningWeeklyOffDays(raw: string | null | undefined): number[] {
    if (raw === null || raw === undefined) return [...DEFAULT_CLEANING_WEEKLY_OFF_DAYS];
    try {
        const trimmed = raw.trim();
        if (trimmed === "") return [];
        return validateCleaningWeeklyOffDaysInput(trimmed);
    } catch {
        return [...DEFAULT_CLEANING_WEEKLY_OFF_DAYS];
    }
}

export function invalidateCleaningWeeklyOffDaysCache(): void {
    cleaningWeeklyOffDaysCache = null;
}

// ─── Atasan tertinggi viewer cleaning (dinamis, milik HR sebagai employee) ───
// Disimpan sebagai employeeId (misal "ID-24050016"). String kosong / tidak ada
// baris = belum ada atasan tertinggi yang ditunjuk. Pola cache + fallback
// sama seperti kunci di atas. Guard baca: employeeId sesi == nilai setting
// (auth sudah menolak sesi nonaktif, sehingga penunjukan mati sendiri bila
// HR menonaktifkan employee tersebut — WIG002 tinggal menunjuk pengganti).

export const CLEANING_TOP_VIEWER_KEY = "cleaning.topViewer.employeeId" as const;

let cleaningTopViewerCache: { value: string | null; expiresAt: number } | null = null;

export function invalidateCleaningTopViewerCache(): void {
    cleaningTopViewerCache = null;
}

// ─── Default reviewer global (Diperiksa Oleh + Mengetahui) ───
// Satu pasang untuk SEMUA ruangan (praktik lapangan: tidak beda per ruangan).
// Pola sama seperti topViewer: AppSetting + cache 60 detik + validasi
// employee aktif + internal saat set. Tanpa approval row, pembaca tetap
// terkunci — baris dibuat otomatis (ensure) atau via "Buka semua ruangan".

export const CLEANING_DEFAULT_REVIEWERS_KEY = "cleaning.defaultReviewers" as const;

export interface CleaningDefaultReviewers {
    inspectedByEmployeeId: string | null;
    knownByEmployeeId: string | null;
}

let cleaningDefaultReviewersCache: { value: CleaningDefaultReviewers; expiresAt: number } | null = null;

export function invalidateCleaningDefaultReviewersCache(): void {
    cleaningDefaultReviewersCache = null;
}

function parseDefaultReviewers(raw: string | null | undefined): CleaningDefaultReviewers {
    if (!raw) return { inspectedByEmployeeId: null, knownByEmployeeId: null };
    try {
        const parsed = JSON.parse(raw) as Partial<CleaningDefaultReviewers>;
        const inspectedBy = typeof parsed.inspectedByEmployeeId === "string" && parsed.inspectedByEmployeeId.trim()
            ? parsed.inspectedByEmployeeId.trim()
            : null;
        const knownBy = typeof parsed.knownByEmployeeId === "string" && parsed.knownByEmployeeId.trim()
            ? parsed.knownByEmployeeId.trim()
            : null;
        return { inspectedByEmployeeId: inspectedBy, knownByEmployeeId: knownBy };
    } catch {
        return { inspectedByEmployeeId: null, knownByEmployeeId: null };
    }
}

/** Pasangan default reviewer (cache 60 detik; rusak/kosong → keduanya null). */
export async function getCleaningDefaultReviewers(): Promise<CleaningDefaultReviewers> {
    const cached = cleaningDefaultReviewersCache;
    if (cached && Date.now() <= cached.expiresAt) return { ...cached.value };

    try {
        const row = await prisma.appSetting.findUnique({
            where: { key: CLEANING_DEFAULT_REVIEWERS_KEY },
        });
        const value = parseDefaultReviewers(row?.value);
        cleaningDefaultReviewersCache = { value, expiresAt: Date.now() + UPLOAD_LIMIT_CACHE_TTL_MS };
        return { ...value };
    } catch {
        const value: CleaningDefaultReviewers = { inspectedByEmployeeId: null, knownByEmployeeId: null };
        cleaningDefaultReviewersCache = { value, expiresAt: Date.now() + UPLOAD_LIMIT_CACHE_TTL_MS };
        return { ...value };
    }
}

async function assertActiveInternalEmployee(employeeId: string, field: string): Promise<string> {
    const id = employeeId.trim();
    if (!id) {
        throw new AppSettingsError(`ID karyawan ${field} wajib diisi.`, 400);
    }
    if (id.length > 100) {
        throw new AppSettingsError(`ID karyawan ${field} terlalu panjang.`, 400);
    }
    const employee = await prisma.employee.findUnique({
        where: { employeeId: id },
        select: { employeeId: true, isActive: true, userAccount: { select: { id: true } } },
    });
    if (!employee || !employee.isActive || !employee.userAccount) {
        throw new AppSettingsError(
            `Karyawan ${field} tidak ditemukan, tidak aktif, atau bukan karyawan internal (outsource tidak boleh).`,
            422
        );
    }
    return employee.employeeId;
}

/**
 * Menyimpan pasangan default reviewer (oleh WIG002). Keduanya wajib beda orang.
 */
export async function updateCleaningDefaultReviewers(
    inspectedByEmployeeId: string,
    knownByEmployeeId: string,
    actorUserId?: string | null
): Promise<{ key: typeof CLEANING_DEFAULT_REVIEWERS_KEY } & CleaningDefaultReviewers> {
    const inspectedBy = await assertActiveInternalEmployee(inspectedByEmployeeId, "Diperiksa Oleh");
    const knownBy = await assertActiveInternalEmployee(knownByEmployeeId, "Mengetahui");
    if (normalizeEmployeeIdLike(inspectedBy) === normalizeEmployeeIdLike(knownBy)) {
        throw new AppSettingsError("Diperiksa Oleh dan Mengetahui harus orang yang berbeda.", 422);
    }
    const value = JSON.stringify({ inspectedByEmployeeId: inspectedBy, knownByEmployeeId: knownBy });
    await prisma.appSetting.upsert({
        where: { key: CLEANING_DEFAULT_REVIEWERS_KEY },
        update: { value, updatedByUserId: actorUserId ?? null },
        create: { key: CLEANING_DEFAULT_REVIEWERS_KEY, value, updatedByUserId: actorUserId ?? null },
    });
    invalidateCleaningDefaultReviewersCache();
    return { key: CLEANING_DEFAULT_REVIEWERS_KEY, inspectedByEmployeeId: inspectedBy, knownByEmployeeId: knownBy };
}

function normalizeEmployeeIdLike(value: string): string {
    return value.trim().replace(/[\s-]+/g, "").toUpperCase();
}

/** ID atasan tertinggi saat ini, atau null bila belum ditunjuk. */
export async function getCleaningTopViewerEmployeeId(): Promise<string | null> {
    const cached = cleaningTopViewerCache;
    if (cached && Date.now() <= cached.expiresAt) return cached.value;

    try {
        const row = await prisma.appSetting.findUnique({
            where: { key: CLEANING_TOP_VIEWER_KEY },
        });
        const value = row?.value?.trim() ? row.value.trim() : null;
        cleaningTopViewerCache = { value, expiresAt: Date.now() + UPLOAD_LIMIT_CACHE_TTL_MS };
        return value;
    } catch {
        cleaningTopViewerCache = { value: null, expiresAt: Date.now() + UPLOAD_LIMIT_CACHE_TTL_MS };
        return null;
    }
}

/**
 * True bila sesi adalah atasan tertinggi yang ditunjuk (read-only viewer)
 * DAN employee-nya masih aktif. Cek aktif di sini (bukan hanya warisan auth)
 * agar penunjukan basi setelah resign langsung mati.
 */
export async function isCleaningTopViewer(
    session: Pick<SessionPayload, "employeeId"> | null
): Promise<boolean> {
    if (!session?.employeeId) return false;
    const topViewerId = await getCleaningTopViewerEmployeeId().catch(() => null);
    if (topViewerId === null || session.employeeId !== topViewerId) return false;
    try {
        const employee = await prisma.employee.findUnique({
            where: { employeeId: topViewerId },
            select: { isActive: true },
        });
        return employee?.isActive === true;
    } catch {
        return false;
    }
}

export interface CleaningTopViewerInfo {
    employeeId: string | null;
    name: string | null;
    isActive: boolean | null;
}

/** Info penunjukan saat ini untuk UI settings (nama + status aktif employee). */
export async function getCleaningTopViewerInfo(): Promise<CleaningTopViewerInfo> {
    const employeeId = await getCleaningTopViewerEmployeeId();
    if (!employeeId) return { employeeId: null, name: null, isActive: null };
    try {
        const employee = await prisma.employee.findUnique({
            where: { employeeId },
            select: { employeeId: true, name: true, isActive: true },
        });
        if (!employee) return { employeeId, name: null, isActive: false };
        return { employeeId: employee.employeeId, name: employee.name, isActive: employee.isActive };
    } catch {
        return { employeeId, name: null, isActive: null };
    }
}

/**
 * Menunjuk/mengganti atasan tertinggi (oleh WIG002). Menerima string kosong
 * untuk mengosongkan penunjukan. Validasi employee aktif + internal.
 */
export async function updateCleaningTopViewer(
    rawEmployeeId: string,
    actorUserId?: string | null
): Promise<{ key: typeof CLEANING_TOP_VIEWER_KEY; employeeId: string | null }> {
    const employeeId = rawEmployeeId.trim();
    if (employeeId === "") {
        await prisma.appSetting.upsert({
            where: { key: CLEANING_TOP_VIEWER_KEY },
            update: { value: "", updatedByUserId: actorUserId ?? null },
            create: { key: CLEANING_TOP_VIEWER_KEY, value: "", updatedByUserId: actorUserId ?? null },
        });
        invalidateCleaningTopViewerCache();
        return { key: CLEANING_TOP_VIEWER_KEY, employeeId: null };
    }
    if (employeeId.length > 100) {
        throw new AppSettingsError("ID karyawan atasan tertinggi terlalu panjang.", 400);
    }
    const employee = await prisma.employee.findUnique({
        where: { employeeId },
        select: { employeeId: true, isActive: true, userAccount: { select: { id: true } } },
    });
    if (!employee || !employee.isActive || !employee.userAccount) {
        throw new AppSettingsError(
            "Karyawan tidak ditemukan, tidak aktif, atau bukan karyawan internal (outsource tidak boleh).",
            422
        );
    }
    await prisma.appSetting.upsert({
        where: { key: CLEANING_TOP_VIEWER_KEY },
        update: { value: employee.employeeId, updatedByUserId: actorUserId ?? null },
        create: { key: CLEANING_TOP_VIEWER_KEY, value: employee.employeeId, updatedByUserId: actorUserId ?? null },
    });
    invalidateCleaningTopViewerCache();
    return { key: CLEANING_TOP_VIEWER_KEY, employeeId: employee.employeeId };
}

/**
 * Mengambil pola libur mingguan cleaning.
 * Cache 60 detik; DB gagal / nilai rusak → fallback DEFAULT ([0,6]).
 */
export async function getCleaningWeeklyOffDays(): Promise<number[]> {
    const cached = cleaningWeeklyOffDaysCache;
    if (cached && Date.now() <= cached.expiresAt) return [...cached.value];

    try {
        const row = await prisma.appSetting.findUnique({
            where: { key: CLEANING_WEEKLY_OFF_DAYS_KEY },
        });
        const value = parseCleaningWeeklyOffDays(row?.value);
        const csv = value.join(",");
        cleaningWeeklyOffDaysCache = { value, csv, expiresAt: Date.now() + UPLOAD_LIMIT_CACHE_TTL_MS };
        return [...value];
    } catch {
        const value = [...DEFAULT_CLEANING_WEEKLY_OFF_DAYS];
        cleaningWeeklyOffDaysCache = {
            value,
            csv: value.join(","),
            expiresAt: Date.now() + UPLOAD_LIMIT_CACHE_TTL_MS,
        };
        return [...value];
    }
}

/**
 * Memperbarui pola libur mingguan oleh WIG002. Disimpan sebagai CSV.
 */
export async function updateCleaningWeeklyOffDays(
    value: string | number[],
    actorUserId?: string | null
): Promise<{ key: typeof CLEANING_WEEKLY_OFF_DAYS_KEY; value: number[]; csv: string }> {
    const normalized = validateCleaningWeeklyOffDaysInput(value);
    const csv = normalized.join(",");
    await prisma.appSetting.upsert({
        where: { key: CLEANING_WEEKLY_OFF_DAYS_KEY },
        update: { value: csv, updatedByUserId: actorUserId ?? null },
        create: { key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: csv, updatedByUserId: actorUserId ?? null },
    });
    invalidateCleaningWeeklyOffDaysCache();
    return { key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: normalized, csv };
}

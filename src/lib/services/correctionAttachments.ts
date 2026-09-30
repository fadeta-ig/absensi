import path from "path";

/** Root privat lampiran koreksi (di luar public/ agar wajib lewat route ber-auth). */
export const CORRECTION_ATTACHMENT_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "attendance-corrections");

const FILENAME_PATTERN = /^[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|pdf)$/i;

export const CORRECTION_ATTACHMENT_MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
};

/** Kembalikan absolute path bila nama file valid dan di dalam root, selain itu null. */
export function resolveCorrectionAttachmentPath(filename: string): string | null {
    if (!FILENAME_PATTERN.test(filename)) return null;
    const resolved = path.resolve(CORRECTION_ATTACHMENT_STORAGE_ROOT, filename);
    if (!resolved.startsWith(`${CORRECTION_ATTACHMENT_STORAGE_ROOT}${path.sep}`)) return null;
    return resolved;
}

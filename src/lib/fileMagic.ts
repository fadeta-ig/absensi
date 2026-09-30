const EXTENSIONS_BY_MIME: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
};

export const ALLOWED_UPLOAD_MIME: readonly string[] = Object.keys(EXTENSIONS_BY_MIME);

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function extensionForMime(mimeType: string): string | null {
    return EXTENSIONS_BY_MIME[mimeType] ?? null;
}

export function hasExpectedSignature(mimeType: string, buffer: Buffer): boolean {
    if (mimeType === "application/pdf") {
        return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    }
    if (mimeType === "image/jpeg") {
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === "image/png") {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from(PNG_SIGNATURE));
    }
    if (mimeType === "image/webp") {
        return (
            buffer.length >= 12 &&
            buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
            buffer.subarray(8, 12).toString("ascii") === "WEBP"
        );
    }
    if (mimeType === "image/gif") {
        if (buffer.length < 6) return false;
        const header = buffer.subarray(0, 6).toString("ascii");
        return header === "GIF87a" || header === "GIF89a";
    }
    if (mimeType.includes("openxmlformats")) {
        return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    }
    if (
        mimeType === "application/msword" ||
        mimeType === "application/vnd.ms-excel" ||
        mimeType === "application/vnd.ms-powerpoint"
    ) {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from(OLE_SIGNATURE));
    }
    return false;
}

export function assertAllowedFile(buffer: Buffer, claimedMime: string): string {
    const extension = extensionForMime(claimedMime);
    if (!extension) {
        throw new Error("Format file tidak didukung.");
    }
    if (buffer.length === 0) {
        throw new Error("File kosong atau rusak.");
    }
    if (!hasExpectedSignature(claimedMime, buffer)) {
        throw new Error("Isi file tidak sesuai dengan format yang dinyatakan.");
    }
    return extension;
}

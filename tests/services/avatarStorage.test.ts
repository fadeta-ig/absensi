// Tanpa DB tulis: helper murni + tulis disk privat dengan cleanup.
import { rm } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
    AVATAR_STORAGE_ROOT,
    AvatarUploadError,
    avatarServeUrl,
    parseAvatarDataUrl,
    resolveAvatarPath,
    saveAvatarBuffer,
} from "@/lib/services/avatarService";

const MAX_BYTES = 2 * 1024 * 1024;
const EMPLOYEE_ID = "EMPTEST001";

async function jpegDataUrl(): Promise<{ dataUrl: string; buffer: Buffer }> {
    const buffer = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 40, b: 40 } },
    }).jpeg().toBuffer();
    return { dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`, buffer };
}

describe("avatar storage", () => {
    it("mem-parse dataURL avatar jpeg/png/webp dengan validasi magic-byte", async () => {
        const { dataUrl, buffer } = await jpegDataUrl();
        const parsed = parseAvatarDataUrl(dataUrl, MAX_BYTES);
        expect(parsed.mime).toBe("image/jpeg");
        expect(parsed.ext).toBe(".jpg");
        expect(parsed.buffer.equals(buffer)).toBe(true);

        const webp = await sharp({
            create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 1, b: 1 } },
        }).webp().toBuffer();
        expect(parseAvatarDataUrl(`data:image/webp;base64,${webp.toString("base64")}`, MAX_BYTES).mime)
            .toBe("image/webp");
    });

    it("menolak svg, base64 rusak, isi tak cocok, dan over-limit", async () => {
        const payload = Buffer.from("contoh").toString("base64");
        expect(() => parseAvatarDataUrl(`data:image/svg+xml;base64,${payload}`, MAX_BYTES))
            .toThrow(AvatarUploadError);
        expect(() => parseAvatarDataUrl("data:image/png;base64,!!!", MAX_BYTES))
            .toThrow(AvatarUploadError);
        const { dataUrl } = await jpegDataUrl();
        expect(() => parseAvatarDataUrl(dataUrl, 10)).toThrow("maksimal");
    });

    it("menyelesaikan path avatar hanya di dalam root privat", () => {
        expect(AVATAR_STORAGE_ROOT).toContain(path.join("storage", "avatars"));
        const resolved = resolveAvatarPath(EMPLOYEE_ID, "9a2b3c4d-uuid.jpg");
        expect(resolved).not.toBeNull();
        expect(resolved as string).toContain(EMPLOYEE_ID);
        expect(resolveAvatarPath("../evil", "a.jpg")).toBeNull();
        expect(resolveAvatarPath(EMPLOYEE_ID, "../a.jpg")).toBeNull();
        expect(resolveAvatarPath(EMPLOYEE_ID, "a.exe")).toBeNull();
        expect(avatarServeUrl("abc-123.jpg")).toBe("/api/auth/avatar/abc-123.jpg");
    });

    it("menyimpan buffer apa adanya (tanpa konversi) ke folder karyawan", async () => {
        const { buffer, mime } = await (async () => {
            const { dataUrl } = await jpegDataUrl();
            const parsed = parseAvatarDataUrl(dataUrl, MAX_BYTES);
            return { buffer: parsed.buffer, mime: parsed.mime };
        })();
        const saved = await saveAvatarBuffer(EMPLOYEE_ID, buffer, mime, MAX_BYTES);
        try {
            expect(saved.relativePath.startsWith(`${EMPLOYEE_ID}/`)).toBe(true);
            expect(saved.serveUrl.startsWith("/api/auth/avatar/")).toBe(true);
            expect(saved.size).toBe(buffer.length);
            const filename = saved.relativePath.split("/")[1];
            expect(resolveAvatarPath(EMPLOYEE_ID, filename)).not.toBeNull();
        } finally {
            await rm(path.join(AVATAR_STORAGE_ROOT, EMPLOYEE_ID), { recursive: true, force: true });
        }

        await expect(saveAvatarBuffer(EMPLOYEE_ID, buffer, mime, 10)).rejects.toThrow("maksimal");
    });
});

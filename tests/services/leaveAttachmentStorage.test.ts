// Tanpa DB tulis: hanya helper murni + tulis disk privat dengan cleanup.
import { unlink } from "fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
    LEAVE_ATTACHMENT_STORAGE_ROOT,
    LeaveAttachmentError,
    leaveAttachmentUrl,
    parseLeaveAttachmentDataUrl,
    resolveLeaveAttachmentLimitBytes,
    resolveLeaveAttachmentPath,
    saveLeaveAttachment,
} from "@/lib/services/leaveService";

const MAX_BYTES = 2 * 1024 * 1024;

async function jpegDataUrl(): Promise<string> {
    const buffer = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 200, b: 90 } },
    }).jpeg().toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

describe("leave attachment storage", () => {
    it("mem-parse dataURL klien (jpeg/png/pdf) dengan validasi magic-byte", async () => {
        const jpeg = await jpegDataUrl();
        const parsed = parseLeaveAttachmentDataUrl(jpeg, MAX_BYTES);
        expect(parsed.mime).toBe("image/jpeg");
        expect(parsed.ext).toBe(".jpg");
        expect(parsed.buffer.length).toBeGreaterThan(0);

        const png = await sharp({
            create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
        }).png().toBuffer();
        const parsedPng = parseLeaveAttachmentDataUrl(`data:image/png;base64,${png.toString("base64")}`, MAX_BYTES);
        expect(parsedPng.mime).toBe("image/png");

        const parsedPdf = parseLeaveAttachmentDataUrl(
            `data:application/pdf;base64,${Buffer.from("%PDF-1.4 lampiran").toString("base64")}`,
            MAX_BYTES,
        );
        expect(parsedPdf.mime).toBe("application/pdf");
    });

    it("menolak prefix tak diizinkan, base64 rusak, isi tak cocok, dan over-limit", async () => {
        const payload = Buffer.from("contoh").toString("base64");
        expect(() => parseLeaveAttachmentDataUrl(`data:image/svg+xml;base64,${payload}`, MAX_BYTES))
            .toThrow(LeaveAttachmentError);
        expect(() => parseLeaveAttachmentDataUrl("data:image/jpeg;base64,!!!", MAX_BYTES))
            .toThrow(LeaveAttachmentError);
        // Klaim jpeg tetapi isi PNG.
        const png = await sharp({
            create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } },
        }).png().toBuffer();
        expect(() => parseLeaveAttachmentDataUrl(`data:image/jpeg;base64,${png.toString("base64")}`, MAX_BYTES))
            .toThrow("tidak sesuai");
        // Over-limit eksplisit.
        const jpeg = await jpegDataUrl();
        expect(() => parseLeaveAttachmentDataUrl(jpeg, 10)).toThrow("maksimal");
    });

    it("menyelesaikan path hanya di dalam root storage privat", () => {
        expect(LEAVE_ATTACHMENT_STORAGE_ROOT).toContain("leave-attachments");
        const resolved = resolveLeaveAttachmentPath("9a2b3c4d-uuid.pdf");
        expect(resolved).not.toBeNull();
        expect(resolved as string).toContain("leave-attachments");
        expect(resolveLeaveAttachmentPath("../rahasia.pdf")).toBeNull();
        expect(resolveLeaveAttachmentPath("bukti.exe")).toBeNull();
        expect(resolveLeaveAttachmentPath("sub/dir.jpg")).toBeNull();
        expect(leaveAttachmentUrl("a b.pdf")).toBe("/api/leave/attachments/a%20b.pdf");
    });

    it("menyimpan buffer ke disk dan menghormati batas eksplisit", async () => {
        const jpeg = await jpegDataUrl();
        const { buffer, mime } = parseLeaveAttachmentDataUrl(jpeg, MAX_BYTES);
        const saved = await saveLeaveAttachment(buffer, mime, MAX_BYTES);
        try {
            expect(saved.filename).toMatch(/^[A-Za-z0-9-]+\.jpg$/);
            expect(saved.mime).toBe("image/jpeg");
            expect(saved.size).toBe(buffer.length);
            expect(resolveLeaveAttachmentPath(saved.filename)).not.toBeNull();
        } finally {
            const target = resolveLeaveAttachmentPath(saved.filename);
            if (target) await unlink(target).catch(() => undefined);
        }

        await expect(saveLeaveAttachment(buffer, mime, 10)).rejects.toThrow("maksimal");
        await expect(saveLeaveAttachment(Buffer.from("korup"), "image/jpeg", MAX_BYTES))
            .rejects.toThrow("tidak sesuai");
    });

    it("memakai batas eksplisit tanpa menyentuh DB", async () => {
        await expect(resolveLeaveAttachmentLimitBytes(3 * 1024 * 1024)).resolves.toBe(3 * 1024 * 1024);
    });
});

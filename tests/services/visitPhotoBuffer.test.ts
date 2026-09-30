import { randomUUID } from "crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
    prepareVisitPhotos,
    readVisitPhotoFile,
    VisitPhotoValidationError,
    type VisitPhotoBufferDraft,
} from "@/lib/services/visitPhotoService";

async function jpegBuffer(width = 640, height = 480): Promise<Buffer> {
    return sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 44, g: 120, b: 180 },
        },
    }).jpeg({ quality: 90 }).toBuffer();
}

function bufferDraft(buffer: Buffer): VisitPhotoBufferDraft {
    return {
        buffer,
        capturedAtDevice: "2026-07-20T06:59:00.000Z",
        category: "LOKASI",
        caption: "jalur buffer",
    };
}

describe("visitPhotoService jalur buffer + resize", () => {
    it("menerima draft buffer (multipart) dan menyimpan asli tanpa perubahan", async () => {
        const source = await jpegBuffer();
        const prepared = await prepareVisitPhotos({
            visitId: `test-${randomUUID()}`,
            clientName: "PT Contoh",
            phase: "CLOCK_IN",
            officialTimestamp: new Date("2026-07-20T07:00:00.000Z"),
            photos: [bufferDraft(source), { ...bufferDraft(source), category: "AKTIVITAS" }],
            location: { lat: -6.2088, lng: 106.8456 },
            maxPhotoBytes: 2 * 1024 * 1024,
        });

        try {
            expect(prepared.records).toHaveLength(2);
            const original = await readVisitPhotoFile(prepared.records[0].originalPath);
            expect(original.equals(source)).toBe(true);
            expect(prepared.records[0].mimeType).toBe("image/jpeg");
        } finally {
            await prepared.cleanup();
        }
    });

    it("me-resize foto raksasa ke lebar 1920 tanpa enlargement untuk foto kecil", async () => {
        const big = await jpegBuffer(2500, 1400);
        const small = await jpegBuffer(640, 480);
        const prepared = await prepareVisitPhotos({
            visitId: `test-${randomUUID()}`,
            clientName: "PT Contoh",
            phase: "CLOCK_OUT",
            officialTimestamp: new Date("2026-07-20T07:00:00.000Z"),
            photos: [bufferDraft(big), bufferDraft(small)],
            location: { lat: -6.2088, lng: 106.8456 },
            maxPhotoBytes: 4 * 1024 * 1024,
        });

        try {
            const bigStamped = await readVisitPhotoFile(prepared.records[0].stampedPath);
            const bigMeta = await sharp(bigStamped).metadata();
            expect(bigMeta.width).toBe(1920);
            expect(prepared.records[0].width).toBe(1920);

            const smallStamped = await readVisitPhotoFile(prepared.records[1].stampedPath);
            const smallMeta = await sharp(smallStamped).metadata();
            expect(smallMeta.width).toBe(640);
            expect(smallMeta.format).toBe("jpeg");
        } finally {
            await prepared.cleanup();
        }
    });

    it("mencampur jalur lama (dataUrl) dan jalur baru (buffer) dalam satu fase", async () => {
        const source = await jpegBuffer();
        const prepared = await prepareVisitPhotos({
            visitId: `test-${randomUUID()}`,
            clientName: "PT Contoh",
            phase: "CLOCK_IN",
            officialTimestamp: new Date("2026-07-20T07:00:00.000Z"),
            photos: [
                {
                    dataUrl: `data:image/jpeg;base64,${source.toString("base64")}`,
                    capturedAtDevice: "2026-07-20T06:59:00.000Z",
                    category: "DOKUMEN",
                    caption: null,
                },
                bufferDraft(source),
            ],
            location: { lat: -6.2088, lng: 106.8456 },
            maxPhotoBytes: 2 * 1024 * 1024,
        });

        try {
            expect(prepared.records).toHaveLength(2);
        } finally {
            await prepared.cleanup();
        }
    });

    it("menolak buffer bukan-JPEG dan buffer melebihi batas eksplisit", async () => {
        const notJpeg = Buffer.from("bukan gambar jpeg");
        await expect(prepareVisitPhotos({
            visitId: `test-${randomUUID()}`,
            clientName: "PT Contoh",
            phase: "CLOCK_IN",
            officialTimestamp: new Date("2026-07-20T07:00:00.000Z"),
            photos: [bufferDraft(notJpeg), bufferDraft(notJpeg)],
            location: { lat: -6.2088, lng: 106.8456 },
            maxPhotoBytes: 2 * 1024 * 1024,
        })).rejects.toBeInstanceOf(VisitPhotoValidationError);

        const source = await jpegBuffer();
        await expect(prepareVisitPhotos({
            visitId: `test-${randomUUID()}`,
            clientName: "PT Contoh",
            phase: "CLOCK_IN",
            officialTimestamp: new Date("2026-07-20T07:00:00.000Z"),
            photos: [bufferDraft(source), bufferDraft(source)],
            location: { lat: -6.2088, lng: 106.8456 },
            maxPhotoBytes: 10,
        })).rejects.toThrow("maksimal");
    });
});

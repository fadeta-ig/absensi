import { randomUUID } from "crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
    prepareVisitPhotos,
    readVisitPhotoFile,
    VisitPhotoValidationError,
} from "@/lib/services/visitPhotoService";
import type { VisitPhotoDraft } from "@/types";

async function jpegDataUrl(): Promise<{ dataUrl: string; buffer: Buffer }> {
    const buffer = await sharp({
        create: {
            width: 640,
            height: 480,
            channels: 3,
            background: { r: 44, g: 120, b: 180 },
        },
    }).jpeg({ quality: 90 }).toBuffer();
    return { dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`, buffer };
}

describe("visitPhotoService", () => {
    it("menyimpan foto asli tanpa perubahan dan menghasilkan salinan watermark", async () => {
        const source = await jpegDataUrl();
        const capturedAtDevice = "2026-07-20T06:59:00.000Z";
        const photos: VisitPhotoDraft[] = [
            { dataUrl: source.dataUrl, capturedAtDevice, category: "LOKASI", caption: "Tampak depan lokasi" },
            { dataUrl: source.dataUrl, capturedAtDevice, category: "AKTIVITAS", caption: "Pertemuan dengan klien" },
        ];
        const prepared = await prepareVisitPhotos({
            visitId: `test-${randomUUID()}`,
            clientName: "PT Contoh",
            phase: "CLOCK_IN",
            officialTimestamp: new Date("2026-07-20T07:00:00.000Z"),
            photos,
            location: {
                lat: -6.2088,
                lng: 106.8456,
                accuracyMeters: 12,
                acquiredAt: "2026-07-20T06:59:30.000Z",
            },
            distanceToTargetMeters: 18.4,
        });

        try {
            expect(prepared.records).toHaveLength(2);
            const first = prepared.records[0];
            const original = await readVisitPhotoFile(first.originalPath);
            const stamped = await readVisitPhotoFile(first.stampedPath);
            expect(original.equals(source.buffer)).toBe(true);
            expect(stamped.equals(source.buffer)).toBe(false);
            expect(first.sha256Original).toMatch(/^[a-f0-9]{64}$/);
            expect(first.officialTimestamp).toEqual(new Date("2026-07-20T07:00:00.000Z"));
            expect(first.accuracyMeters).toBe(12);
            expect(first.distanceToTargetMeters).toBe(18.4);

            const stampedMetadata = await sharp(stamped).metadata();
            expect(stampedMetadata.format).toBe("jpeg");
            expect(stampedMetadata.width).toBe(640);
            expect(stampedMetadata.height).toBe(480);
        } finally {
            await prepared.cleanup();
        }
    });

    it("menolak payload yang bukan JPEG valid", async () => {
        const invalid: VisitPhotoDraft = {
            dataUrl: `data:image/jpeg;base64,${Buffer.from("not-a-jpeg").toString("base64")}`,
            capturedAtDevice: "2026-07-20T06:59:00.000Z",
            category: "LAINNYA",
            caption: null,
        };

        await expect(prepareVisitPhotos({
            visitId: `test-${randomUUID()}`,
            clientName: "PT Contoh",
            phase: "CLOCK_OUT",
            officialTimestamp: new Date("2026-07-20T07:00:00.000Z"),
            photos: [invalid, invalid],
            location: { lat: -6.2088, lng: 106.8456 },
        })).rejects.toBeInstanceOf(VisitPhotoValidationError);
    });

    it("menolak jumlah foto di luar batas", async () => {
        const source = await jpegDataUrl();
        const photo: VisitPhotoDraft = {
            dataUrl: source.dataUrl,
            capturedAtDevice: "2026-07-20T06:59:00.000Z",
            category: "LOKASI",
            caption: null,
        };

        await expect(prepareVisitPhotos({
            visitId: `test-${randomUUID()}`,
            clientName: "PT Contoh",
            phase: "CLOCK_IN",
            officialTimestamp: new Date("2026-07-20T07:00:00.000Z"),
            photos: [photo],
            location: { lat: -6.2088, lng: 106.8456 },
        })).rejects.toThrow("Jumlah foto harus antara 2 dan 5");
    });
});

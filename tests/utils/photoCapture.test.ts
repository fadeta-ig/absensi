// Logika murni kompresi klien (tanpa canvas/jsdom): helper yang dipakai
// MultiPhotoCapture untuk downscale maxDim 1280 + penolakan HEIC/HEIF dini.
import { describe, expect, it } from "vitest";
import {
    computeDownscaleSize,
    GALLERY_SOURCE_MAX_BYTES,
    isHeicFile,
    PHOTO_JPEG_QUALITY,
    PHOTO_MAX_DIMENSION,
} from "@/app/employee/visits/components/MultiPhotoCapture";

describe("photo capture client logic", () => {
    it("menetapkan maxDim 1280 dan kualitas jpeg 0.75", () => {
        expect(PHOTO_MAX_DIMENSION).toBe(1280);
        expect(PHOTO_JPEG_QUALITY).toBe(0.75);
        expect(GALLERY_SOURCE_MAX_BYTES).toBe(10 * 1024 * 1024);
    });

    it("men-downscale sisi terpanjang ke 1280 tanpa upscale", () => {
        // Landscape kamera 4000x3000 → 1280x960
        expect(computeDownscaleSize(4000, 3000)).toEqual({ width: 1280, height: 960 });
        // Portrait 3000x4000 → 960x1280
        expect(computeDownscaleSize(3000, 4000)).toEqual({ width: 960, height: 1280 });
        // Sudah kecil → dipertahankan (tanpa enlargement)
        expect(computeDownscaleSize(640, 480)).toEqual({ width: 640, height: 480 });
        expect(computeDownscaleSize(1280, 720)).toEqual({ width: 1280, height: 720 });
    });

    it("menjaga aspek dan batas 1px minimum", () => {
        const scaled = computeDownscaleSize(1920, 1080);
        expect(scaled.width).toBe(1280);
        expect(scaled.height).toBe(720);
        expect(computeDownscaleSize(0, 0)).toEqual({ width: 640, height: 480 });
        expect(computeDownscaleSize(NaN, 100)).toEqual({ width: 640, height: 480 });
    });

    it("menolak HEIC/HEIF dini dari nama atau MIME", () => {
        expect(isHeicFile("foto.heic", "image/heic")).toBe(true);
        expect(isHeicFile("FOTO.HEIF", "application/octet-stream")).toBe(true);
        expect(isHeicFile("foto.jpg", "image/heif")).toBe(true);
        expect(isHeicFile("foto.jpg", "image/jpeg")).toBe(false);
        expect(isHeicFile("foto.png", "image/png")).toBe(false);
        expect(isHeicFile(null, null)).toBe(false);
    });
});

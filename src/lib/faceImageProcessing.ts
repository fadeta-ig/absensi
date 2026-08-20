/**
 * Face Image Processing — Computer Vision Preprocessing Pipeline
 *
 * Modul pemrosesan citra digital murni (Canvas 2D Typed Array) untuk
 * meningkatkan deteksi wajah pada kamera berkualitas rendah, berembun,
 * lensa buram, atau pencahayaan tidak seimbang (backlight / bayangan gelap).
 */

/** Lookup table untuk gamma correction 1.4x (shadow lifting) */
const GAMMA_1_4_LUT = new Uint8Array(256);
for (let i = 0; i < 256; i += 1) {
    GAMMA_1_4_LUT[i] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(i / 255, 1 / 1.4))));
}

/**
 * Filter 1: Auto-Contrast & Dynamic Range Stretching
 * Meregangkan histogram intensitas cahaya dari [min, max] ke rentang penuh [0, 255].
 * Membantu kamera yang menghasilkan gambar kusam / berkontras rendah (washed out).
 */
export function applyAutoContrast(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;

    let min = 255;
    let max = 0;

    // Cari min & max luminance dengan sampling cepat (step 4 piksel)
    for (let i = 0; i < len; i += 16) {
        const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        if (lum < min) min = lum;
        if (lum > max) max = lum;
    }

    const range = max - min;
    if (range < 20 || (min === 0 && max === 255)) return; // Sudah optimal atau gambar terlalu datar

    const scale = 255 / range;
    for (let i = 0; i < len; i += 4) {
        data[i] = Math.min(255, Math.max(0, (data[i] - min) * scale));
        data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - min) * scale));
        data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - min) * scale));
    }

    ctx.putImageData(imgData, 0, 0);
}

/**
 * Filter 2: Gamma Correction (Shadow Lifting)
 * Menerapkan kurva gamma 1.4x untuk mengangkat detail wajah yang tertutup bayangan / backlight.
 */
export function applyGammaLift(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
        data[i] = GAMMA_1_4_LUT[data[i]];
        data[i + 1] = GAMMA_1_4_LUT[data[i + 1]];
        data[i + 2] = GAMMA_1_4_LUT[data[i + 2]];
    }

    ctx.putImageData(imgData, 0, 0);
}

/**
 * Filter 3: 3x3 Convolution Unsharp Masking
 * Menajamkan gradien tepi pada wajah untuk lensa kamera HP yang sedikit buram / berembun.
 * Kernel: [ 0, -1,  0,
 *          -1,  5, -1,
 *           0, -1,  0 ]
 */
export function applySharpen(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const srcImgData = ctx.getImageData(0, 0, width, height);
    const src = srcImgData.data;
    const dstImgData = ctx.createImageData(width, height);
    const dst = dstImgData.data;

    const rowBytes = width * 4;

    for (let y = 1; y < height - 1; y += 1) {
        const yOffset = y * rowBytes;
        const topOffset = (y - 1) * rowBytes;
        const btmOffset = (y + 1) * rowBytes;

        for (let x = 1; x < width - 1; x += 1) {
            const i = yOffset + x * 4;
            const iTop = topOffset + x * 4;
            const iBtm = btmOffset + x * 4;
            const iLeft = i - 4;
            const iRight = i + 4;

            for (let c = 0; c < 3; c += 1) {
                const val = 5 * src[i + c] - src[iTop + c] - src[iBtm + c] - src[iLeft + c] - src[iRight + c];
                dst[i + c] = val < 0 ? 0 : val > 255 ? 255 : val;
            }
            dst[i + 3] = src[i + 3]; // Alpha
        }
    }

    ctx.putImageData(dstImgData, 0, 0);
}

export type ProcessingPass = "raw" | "sharpen_contrast" | "gamma_lift" | "center_crop";

/**
 * Membuat kanvas yang telah diproses menurut mode processing pass yang ditentukan.
 */
export function createProcessedCanvas(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    mode: ProcessingPass,
    targetMaxDim = 480
): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;

    let srcW = 0;
    let srcH = 0;

    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
        srcW = source.videoWidth;
        srcH = source.videoHeight;
    } else if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
        srcW = source.naturalWidth || source.width;
        srcH = source.naturalHeight || source.height;
    } else if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
        srcW = source.width;
        srcH = source.height;
    }

    if (srcW === 0 || srcH === 0) return null;

    const canvas = document.createElement("canvas");

    if (mode === "center_crop") {
        // Crop 70% area tengah (Region of Interest / Oval Area)
        const cropW = Math.round(srcW * 0.7);
        const cropH = Math.round(srcH * 0.7);
        const cropX = Math.round((srcW - cropW) / 2);
        const cropY = Math.round((srcH - cropH) / 2);

        const scale = Math.min(1, targetMaxDim / Math.max(cropW, cropH));
        const outW = Math.max(160, Math.round(cropW * scale));
        const outH = Math.max(120, Math.round(cropH * scale));

        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;

        ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
        applyAutoContrast(ctx, outW, outH);
        return canvas;
    }

    // Standard scaling untuk pass normal
    const scale = Math.min(1, targetMaxDim / Math.max(srcW, srcH));
    const outW = Math.max(160, Math.round(srcW * scale));
    const outH = Math.max(120, Math.round(srcH * scale));

    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, outW, outH);

    if (mode === "sharpen_contrast") {
        applyAutoContrast(ctx, outW, outH);
        applySharpen(ctx, outW, outH);
    } else if (mode === "gamma_lift") {
        applyGammaLift(ctx, outW, outH);
        applyAutoContrast(ctx, outW, outH);
    }

    return canvas;
}

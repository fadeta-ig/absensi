/**
 * Face Recognition — face-api.js wrapper
 *
 * Logging: hanya warn & error yang dikirim ke server.
 * Info/debug di-drop oleh clientLogger (silent).
 */

import * as faceapi from "face-api.js";
import { createClientLogger } from "@/lib/clientLogger";

const log = createClientLogger("FaceRecognition");

/**
 * Threshold Euclidean distance untuk face matching.
 *
 * Cara kerja: match = distance < threshold
 * - Nilai LEBIH TINGGI → lebih longgar (kamera HP jelek / pencahayaan buruk)
 * - Nilai LEBIH RENDAH → lebih ketat  (kamera berkualitas tinggi)
 *
 * Skala referensi:
 *   0.40 – sangat ketat   | 0.50 – standar | 0.60 – longgar | 0.65 – sangat longgar ← aktif
 *
 * Override tanpa deploy ulang: NEXT_PUBLIC_FACE_THRESHOLD=0.65 di .env
 */
const DEFAULT_THRESHOLD = (() => {
    const envVal = parseFloat(process.env.NEXT_PUBLIC_FACE_THRESHOLD ?? "");
    return (!isNaN(envVal) && envVal > 0 && envVal < 1) ? envVal : 0.65;
})();

/** Threshold aktif — export agar bisa digunakan di UI */
export const FACE_THRESHOLD = DEFAULT_THRESHOLD;

let modelsLoaded = false;
let modelsLoading = false;

/**
 * Load face-api.js models dari /models/.
 * Hanya load sekali — panggilan berikutnya langsung return.
 */
export async function loadFaceModels(): Promise<void> {
    if (modelsLoaded) return;

    if (modelsLoading) {
        // Tunggu load yang sedang berjalan selesai
        await new Promise<void>((resolve) => {
            const check = setInterval(() => {
                if (modelsLoaded || !modelsLoading) {
                    clearInterval(check);
                    resolve();
                }
            }, 200);
        });
        return;
    }

    modelsLoading = true;
    const MODEL_URL = "/models";

    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        modelsLoaded = true;
    } catch (err) {
        modelsLoading = false;
        log.error("Gagal load face-api models", {
            error: err instanceof Error ? err.message : String(err),
            modelUrl: MODEL_URL,
        });
        throw err;
    }

    modelsLoading = false;
}

/**
 * Detect a single face dan kembalikan 128-point descriptor.
 * Return `null` jika tidak ada wajah terdeteksi.
 */
export async function detectFaceDescriptor(
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
    if (!modelsLoaded) {
        log.error("detectFaceDescriptor dipanggil sebelum model selesai di-load");
        return null;
    }

    try {
        const detection = await faceapi
            .detectSingleFace(input)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            // Tidak ada wajah — ini informasi penting untuk user
            const info = input instanceof HTMLVideoElement
                ? { videoWidth: input.videoWidth, videoHeight: input.videoHeight, readyState: input.readyState }
                : input instanceof HTMLCanvasElement
                ? { width: input.width, height: input.height }
                : {};
            log.warn("Wajah tidak terdeteksi di frame", info);
            return null;
        }

        return detection.descriptor;
    } catch (err) {
        log.error("Error saat deteksi wajah", {
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/**
 * Bandingkan dua descriptor dengan Euclidean distance.
 * @returns `{ match, distance, threshold }`
 */
export function compareFaces(
    descriptor1: Float32Array | number[],
    descriptor2: Float32Array | number[],
    threshold: number = DEFAULT_THRESHOLD
): { match: boolean; distance: number; threshold: number } {
    const d1 = descriptor1 instanceof Float32Array ? descriptor1 : new Float32Array(descriptor1);
    const d2 = descriptor2 instanceof Float32Array ? descriptor2 : new Float32Array(descriptor2);

    const distance = faceapi.euclideanDistance(Array.from(d1), Array.from(d2));
    const match = distance < threshold;

    if (!match) {
        log.warn("Face mismatch", {
            distance: distance.toFixed(4),
            threshold,
            similarityPct: `${((1 - distance) * 100).toFixed(1)}%`,
            margin: (distance - threshold).toFixed(4),
        });
    }

    return { match, distance, threshold };
}

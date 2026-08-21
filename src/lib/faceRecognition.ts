/**
 * Face Recognition — face-api.js wrapper
 * Menggunakan SSD MobileNet v1 presisi tinggi (minConfidence 0.15)
 * dengan fallback detectAllFaces (bounding box terbesar) untuk menangkap selfie HP.
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
 * Default 0.92 dipakai untuk memberi toleransi ekstra pada kamera buram.
 * Override saat build: NEXT_PUBLIC_FACE_THRESHOLD=0.92 di .env
 */
const DEFAULT_THRESHOLD = (() => {
    const envVal = parseFloat(process.env.NEXT_PUBLIC_FACE_THRESHOLD ?? "");
    return (!isNaN(envVal) && envVal > 0 && envVal < 1) ? envVal : 0.92;
})();

/** Threshold aktif — export agar bisa digunakan di UI */
export const FACE_THRESHOLD = DEFAULT_THRESHOLD;

/** Konfigurasi scan multi-frame untuk kamera. */
export const FACE_SCAN_ATTEMPTS = 5;
export const FACE_SCAN_MIN_DETECTIONS = 1;
export const FACE_SCAN_INTERVAL_MS = 150;

/** Confidence detektor SSD MobileNet v1 (0.15) toleran terhadap kamera selfie HP. */
const FACE_DETECTION_MIN_CONFIDENCE = 0.15;

let modelsLoaded = false;
let modelLoadPromise: Promise<void> | null = null;

/**
 * Load face-api.js models dari /models/.
 * Hanya load sekali — panggilan berikutnya langsung return.
 */
export async function loadFaceModels(): Promise<void> {
    if (modelsLoaded) return;
    if (modelLoadPromise) return modelLoadPromise;

    const MODEL_URL = "/models";

    modelLoadPromise = (async () => {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        modelsLoaded = true;
        log.info("Face-api SSD MobileNet v1 models berhasil dimuat");
    })()
        .catch((err) => {
            log.error("Gagal load face-api models", {
                error: err instanceof Error ? err.message : String(err),
                modelUrl: MODEL_URL,
            });
            throw err;
        })
        .finally(() => {
            modelLoadPromise = null;
        });

    return modelLoadPromise;
}

type FaceInput = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

/**
 * Detect a single face dan kembalikan 128-point descriptor.
 * 
 * Menggunakan SSD MobileNet v1 (minConfidence 0.15) dengan fallback detectAllFaces
 * (memilih wajah terbesar jika posisi selfie terpotong di tepi dahi/layar).
 *
 * Return `null` jika tidak ada wajah terdeteksi.
 */
export async function detectFaceDescriptor(
    input: FaceInput
): Promise<Float32Array | null> {
    if (!modelsLoaded) {
        await loadFaceModels();
    }

    if (typeof HTMLVideoElement !== "undefined" && input instanceof HTMLVideoElement) {
        if (input.readyState < 2 || input.videoWidth === 0 || input.videoHeight === 0) {
            return null;
        }
    }

    try {
        const options = new faceapi.SsdMobilenetv1Options({
            minConfidence: FACE_DETECTION_MIN_CONFIDENCE,
        });

        // Pass 1: Single face detection utama
        const single = await faceapi
            .detectSingleFace(input, options)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (single?.descriptor) {
            return single.descriptor;
        }

        // Pass 2: Fallback detectAllFaces (mengambil bounding box wajah paling dominan di selfie)
        const allDetections = await faceapi
            .detectAllFaces(input, options)
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (allDetections && allDetections.length > 0) {
            const best = allDetections.reduce((largest, curr) => {
                const currArea = curr.detection.box.width * curr.detection.box.height;
                const largestArea = largest.detection.box.width * largest.detection.box.height;
                return currArea > largestArea ? curr : largest;
            });
            if (best.descriptor) {
                return best.descriptor;
            }
        }

        return null;
    } catch (err) {
        log.error("Error saat deteksi wajah", {
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

interface MultiFrameDetectionOptions {
    attempts?: number;
    minimumDetections?: number;
    intervalMs?: number;
    onAttempt?: (attempt: number, total: number, detections: number) => void;
}

/**
 * Pindai beberapa frame video dan kumpulkan descriptor yang berhasil.
 * Pada deteksi pertama yang berhasil, proses dapat langsung selesai.
 */
export async function detectFaceDescriptors(
    input: FaceInput,
    options: MultiFrameDetectionOptions = {}
): Promise<Float32Array[]> {
    if (!modelsLoaded) {
        await loadFaceModels();
    }

    const attempts = Math.max(1, options.attempts ?? FACE_SCAN_ATTEMPTS);
    const minimumDetections = Math.max(
        1,
        Math.min(attempts, options.minimumDetections ?? FACE_SCAN_MIN_DETECTIONS)
    );
    const intervalMs = Math.max(0, options.intervalMs ?? FACE_SCAN_INTERVAL_MS);
    const descriptors: Float32Array[] = [];

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        options.onAttempt?.(attempt + 1, attempts, descriptors.length);

        const descriptor = await detectFaceDescriptor(input);
        if (descriptor) {
            descriptors.push(descriptor);
        }

        if (descriptors.length >= minimumDetections) break;
        if (attempt < attempts - 1 && intervalMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        }
    }

    return descriptors;
}

/**
 * Rata-ratakan beberapa descriptor registrasi lalu normalisasi kembali.
 * Ini mengurangi pengaruh satu frame yang goyang/buram saat pendaftaran.
 */
export function averageFaceDescriptors(descriptors: Float32Array[]): Float32Array | null {
    if (descriptors.length === 0) return null;

    const descriptorLength = descriptors[0].length;
    if (descriptorLength === 0 || descriptors.some((descriptor) => descriptor.length !== descriptorLength)) {
        return null;
    }

    const averaged = new Float32Array(descriptorLength);
    for (const descriptor of descriptors) {
        for (let index = 0; index < descriptorLength; index += 1) {
            averaged[index] += descriptor[index] / descriptors.length;
        }
    }

    const magnitude = Math.sqrt(
        Array.from(averaged).reduce((sum, value) => sum + value * value, 0)
    );
    if (!Number.isFinite(magnitude) || magnitude === 0) return null;

    for (let index = 0; index < descriptorLength; index += 1) {
        averaged[index] /= magnitude;
    }

    return averaged;
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
        log.info("Face mismatch", {
            distance: distance.toFixed(4),
            threshold,
            similarityPct: `${((1 - distance) * 100).toFixed(1)}%`,
            margin: (distance - threshold).toFixed(4),
        });
    }

    return { match, distance, threshold };
}

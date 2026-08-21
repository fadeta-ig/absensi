/**
 * Face Recognition — face-api.js wrapper.
 *
 * Model ringan dipakai lebih dahulu agar registrasi di ponsel tidak perlu
 * memuat SSD MobileNet. SSD hanya dimuat bila detektor ringan tidak menemukan
 * wajah. Hasil detail dipisahkan dari `null` agar kegagalan runtime tidak
 * tampil sebagai "wajah tidak ditemukan".
 */

import * as faceapi from "face-api.js";
import { createClientLogger } from "@/lib/clientLogger";

const log = createClientLogger("FaceRecognition");

const DEFAULT_THRESHOLD = (() => {
    const envVal = parseFloat(process.env.NEXT_PUBLIC_FACE_THRESHOLD ?? "");
    return (!isNaN(envVal) && envVal > 0 && envVal < 1) ? envVal : 0.92;
})();

export const FACE_THRESHOLD = DEFAULT_THRESHOLD;
export const FACE_SCAN_ATTEMPTS = 5;
export const FACE_SCAN_MIN_DETECTIONS = 1;
export const FACE_SCAN_INTERVAL_MS = 150;

const MODEL_URL = "/models";
const TINY_FACE_SCORE_THRESHOLD = 0.2;
const SSD_FACE_MIN_CONFIDENCE = 0.15;

let coreModelsLoaded = false;
let coreModelLoadPromise: Promise<void> | null = null;
let ssdModelsLoaded = false;
let ssdModelLoadPromise: Promise<void> | null = null;
let cpuBackendPromise: Promise<void> | null = null;

type FaceInput = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export type FaceDetectionResult =
    | { status: "success"; descriptor: Float32Array; detector: "tiny" | "ssd" }
    | { status: "not_found" }
    | { status: "error"; stage: "model" | "detection"; message: string };

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Jalur WebGL pada sejumlah browser Android dapat berhenti tanpa melempar
 * error saat inferensi. Pendaftaran memilih backend CPU yang lebih lambat,
 * tetapi stabil dan tidak bergantung pada driver GPU perangkat.
 */
export async function ensureStableFaceRecognitionBackend(): Promise<void> {
    if (faceapi.tf.getBackend() === "cpu") return;
    if (cpuBackendPromise) return cpuBackendPromise;

    cpuBackendPromise = (async () => {
        const switched = await faceapi.tf.setBackend("cpu");
        await faceapi.tf.ready();
        if (!switched || faceapi.tf.getBackend() !== "cpu") {
            throw new Error("Backend CPU TensorFlow tidak tersedia pada browser ini.");
        }
        log.info("Face recognition memakai backend CPU stabil");
    })().finally(() => {
        cpuBackendPromise = null;
    });

    return cpuBackendPromise;
}

/** Muat model inti yang ringan untuk kamera ponsel. */
export async function loadFaceModels(): Promise<void> {
    if (coreModelsLoaded) return;
    if (coreModelLoadPromise) return coreModelLoadPromise;

    coreModelLoadPromise = Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
        .then(() => {
            coreModelsLoaded = true;
            log.info("Face-api model inti berhasil dimuat");
        })
        .catch((error) => {
            log.error("Gagal memuat model inti face-api", { error: errorMessage(error), modelUrl: MODEL_URL });
            throw error;
        })
        .finally(() => {
            coreModelLoadPromise = null;
        });

    return coreModelLoadPromise;
}

/** Muat model SSD hanya bila fallback benar-benar diperlukan. */
async function loadSsdFallbackModels(): Promise<void> {
    if (ssdModelsLoaded) return;
    if (ssdModelLoadPromise) return ssdModelLoadPromise;

    ssdModelLoadPromise = Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    ])
        .then(() => {
            ssdModelsLoaded = true;
            log.info("Face-api model fallback SSD berhasil dimuat");
        })
        .catch((error) => {
            log.error("Gagal memuat model fallback SSD", { error: errorMessage(error), modelUrl: MODEL_URL });
            throw error;
        })
        .finally(() => {
            ssdModelLoadPromise = null;
        });

    return ssdModelLoadPromise;
}

/**
 * Deteksi dengan status eksplisit. Gunakan ini pada pendaftaran supaya UI dapat
 * membedakan foto tanpa wajah dari error browser/model.
 */
export async function detectFaceDescriptorDetailed(input: FaceInput): Promise<FaceDetectionResult> {
    if (typeof HTMLVideoElement !== "undefined" && input instanceof HTMLVideoElement) {
        if (input.readyState < 2 || input.videoWidth === 0 || input.videoHeight === 0) {
            return { status: "not_found" };
        }
    }

    try {
        await loadFaceModels();
    } catch (error) {
        return { status: "error", stage: "model", message: errorMessage(error) };
    }

    try {
        const tinyOptions = new faceapi.TinyFaceDetectorOptions({
            inputSize: 320,
            scoreThreshold: TINY_FACE_SCORE_THRESHOLD,
        });
        const tiny = await faceapi
            .detectSingleFace(input, tinyOptions)
            .withFaceLandmarks(true)
            .withFaceDescriptor();

        if (tiny?.descriptor) {
            return { status: "success", descriptor: tiny.descriptor, detector: "tiny" };
        }

        await loadSsdFallbackModels();
        const ssdOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: SSD_FACE_MIN_CONFIDENCE });
        const single = await faceapi
            .detectSingleFace(input, ssdOptions)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (single?.descriptor) {
            return { status: "success", descriptor: single.descriptor, detector: "ssd" };
        }

        const allDetections = await faceapi
            .detectAllFaces(input, ssdOptions)
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (allDetections.length > 0) {
            const best = allDetections.reduce((largest, current) => {
                const currentArea = current.detection.box.width * current.detection.box.height;
                const largestArea = largest.detection.box.width * largest.detection.box.height;
                return currentArea > largestArea ? current : largest;
            });
            if (best.descriptor) {
                return { status: "success", descriptor: best.descriptor, detector: "ssd" };
            }
        }

        return { status: "not_found" };
    } catch (error) {
        const message = errorMessage(error);
        log.error("Error saat deteksi wajah", { error: message });
        return { status: "error", stage: "detection", message };
    }
}

/** Kompatibilitas untuk alur absensi lama yang hanya membutuhkan descriptor/null. */
export async function detectFaceDescriptor(input: FaceInput): Promise<Float32Array | null> {
    const result = await detectFaceDescriptorDetailed(input);
    return result.status === "success" ? result.descriptor : null;
}

interface MultiFrameDetectionOptions {
    attempts?: number;
    minimumDetections?: number;
    intervalMs?: number;
    onAttempt?: (attempt: number, total: number, detections: number) => void;
}

export async function detectFaceDescriptors(
    input: FaceInput,
    options: MultiFrameDetectionOptions = {}
): Promise<Float32Array[]> {
    const attempts = Math.max(1, options.attempts ?? FACE_SCAN_ATTEMPTS);
    const minimumDetections = Math.max(1, Math.min(attempts, options.minimumDetections ?? FACE_SCAN_MIN_DETECTIONS));
    const intervalMs = Math.max(0, options.intervalMs ?? FACE_SCAN_INTERVAL_MS);
    const descriptors: Float32Array[] = [];

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        options.onAttempt?.(attempt + 1, attempts, descriptors.length);
        const descriptor = await detectFaceDescriptor(input);
        if (descriptor) descriptors.push(descriptor);
        if (descriptors.length >= minimumDetections) break;
        if (attempt < attempts - 1 && intervalMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        }
    }

    return descriptors;
}

export function averageFaceDescriptors(descriptors: Float32Array[]): Float32Array | null {
    if (descriptors.length === 0) return null;
    const descriptorLength = descriptors[0].length;
    if (descriptorLength === 0 || descriptors.some((descriptor) => descriptor.length !== descriptorLength)) return null;

    const averaged = new Float32Array(descriptorLength);
    for (const descriptor of descriptors) {
        for (let index = 0; index < descriptorLength; index += 1) {
            averaged[index] += descriptor[index] / descriptors.length;
        }
    }

    const magnitude = Math.sqrt(Array.from(averaged).reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(magnitude) || magnitude === 0) return null;
    for (let index = 0; index < descriptorLength; index += 1) averaged[index] /= magnitude;
    return averaged;
}

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

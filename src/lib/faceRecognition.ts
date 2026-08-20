/**
 * Face Recognition — face-api.js wrapper
 * Dilengkapi dengan Multi-Pass Computer Vision Preprocessing Pipeline
 * untuk memaksimalkan deteksi pada kamera buram, berembun, atau backlight.
 *
 * Logging: hanya warn & error yang dikirim ke server.
 * Info/debug di-drop oleh clientLogger (silent).
 */

import * as faceapi from "face-api.js";
import { createClientLogger } from "@/lib/clientLogger";
import { createProcessedCanvas, ProcessingPass } from "@/lib/faceImageProcessing";

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

/** Konfigurasi scan multi-frame yang stabil dan ringan untuk perangkat mobile. */
export const FACE_SCAN_ATTEMPTS = 2;
export const FACE_SCAN_MIN_DETECTIONS = 1;
export const FACE_SCAN_INTERVAL_MS = 250;

/** Confidence detektor; 0.12 memberikan toleransi tinggi dengan akurasi optimal. */
const FACE_DETECTION_MIN_CONFIDENCE = 0.12;

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
        log.info("Face-api models berhasil dimuat");
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

/**
 * Detect a single face dan kembalikan 128-point descriptor.
 * Menjalankan Multi-Pass Image Preprocessing (Raw -> Sharpen/Contrast -> Gamma Shadow Lift -> Center ROI).
 * Return `null` jika tidak ada wajah terdeteksi pada seluruh pass.
 */
export async function detectFaceDescriptor(
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
    if (!modelsLoaded) {
        await loadFaceModels();
    }

    if (typeof HTMLVideoElement !== "undefined" && input instanceof HTMLVideoElement) {
        if (input.readyState < 2 || input.videoWidth === 0 || input.videoHeight === 0) {
            return null;
        }
    }

    const options = new faceapi.SsdMobilenetv1Options({
        minConfidence: FACE_DETECTION_MIN_CONFIDENCE,
    });

    // 4 Tahap Preprocessing Citra Digital
    const passes: ProcessingPass[] = ["raw", "sharpen_contrast", "gamma_lift", "center_crop"];

    for (const pass of passes) {
        try {
            const processedCanvas = createProcessedCanvas(input, pass);
            const target = processedCanvas ?? input;

            // 1. Deteksi single face utama
            const single = await faceapi
                .detectSingleFace(target, options)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (single?.descriptor) {
                return single.descriptor;
            }

            // 2. Fallback: deteksi all faces jika single face tidak lolos
            const allDetections = await faceapi
                .detectAllFaces(target, options)
                .withFaceLandmarks()
                .withFaceDescriptors();

            if (allDetections && allDetections.length > 0) {
                const best = allDetections.reduce((largest, curr) => {
                    const currArea = curr.detection.box.width * curr.detection.box.height;
                    const largestArea = largest.detection.box.width * largest.detection.box.height;
                    return currArea > largestArea ? curr : largest;
                });
                return best.descriptor;
            }
        } catch (err) {
            log.error(`Error saat deteksi wajah pass: ${pass}`, {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return null;
}

interface MultiFrameDetectionOptions {
    attempts?: number;
    minimumDetections?: number;
    intervalMs?: number;
    onAttempt?: (attempt: number, total: number, detections: number) => void;
    onDiagnostic?: (info: string) => void;
}

/**
 * Pindai frame video dan kumpulkan descriptor yang berhasil.
 * Berjalan berurutan secara bersih tanpa thread-locking.
 */
export async function detectFaceDescriptors(
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
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

        // Jeda waktu agar antarmuka browser sempat merespons dan me-render
        await new Promise<void>((resolve) => setTimeout(resolve, 100));

        const t0 = performance.now();
        const descriptor = await detectFaceDescriptor(input);
        const elapsed = Math.round(performance.now() - t0);

        if (descriptor) {
            options.onDiagnostic?.(`Percobaan ${attempt + 1}: Terdeteksi (${elapsed}ms)`);
            descriptors.push(descriptor);
        } else {
            options.onDiagnostic?.(`Percobaan ${attempt + 1}: Tidak terdeteksi (${elapsed}ms)`);
        }

        if (descriptors.length >= minimumDetections) break;
        if (attempt < attempts - 1 && intervalMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        }
    }

    if (descriptors.length === 0) {
        const inputInfo = (typeof HTMLVideoElement !== "undefined" && input instanceof HTMLVideoElement)
            ? { videoWidth: input.videoWidth, videoHeight: input.videoHeight, readyState: input.readyState }
            : {};
        log.warn("Wajah tidak terdeteksi setelah percobaan scan", {
            attempts,
            minimumDetections,
            ...inputInfo,
        });
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

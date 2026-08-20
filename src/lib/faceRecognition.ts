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
 * Default 0.92 dipakai untuk memberi toleransi ekstra pada kamera buram.
 * Override saat build: NEXT_PUBLIC_FACE_THRESHOLD=0.92 di .env
 */
const DEFAULT_THRESHOLD = (() => {
    const envVal = parseFloat(process.env.NEXT_PUBLIC_FACE_THRESHOLD ?? "");
    return (!isNaN(envVal) && envVal > 0 && envVal < 1) ? envVal : 0.92;
})();

/** Threshold aktif — export agar bisa digunakan di UI */
export const FACE_THRESHOLD = DEFAULT_THRESHOLD;

/** Konfigurasi scan multi-frame untuk perangkat mobile. */
export const FACE_SCAN_ATTEMPTS = 5;
export const FACE_SCAN_MIN_DETECTIONS = 1;
export const FACE_SCAN_INTERVAL_MS = 200;

/** Confidence detektor; semakin rendah semakin toleran terhadap kamera buram. */
const FACE_DETECTION_MIN_CONFIDENCE = 0.10;

/** Timeout per-frame agar deteksi tidak hang selamanya di HP lambat. */
const DETECTION_TIMEOUT_MS = 10000;

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
 * Ambil frame dari video dan gambar ke canvas 2D yang sudah teruji.
 * face-api.js secara internal selalu mengkonversi input ke canvas via
 * `createCanvasFromMedia()` lalu membaca piksel dengan `tf.browser.fromPixels()`.
 * Pada banyak HP mobile, proses drawImage(video) di dalam face-api.js
 * terjadi terlalu cepat sehingga kanvas kosong/hitam. Dengan membuat
 * canvas sendiri dan memastikan pikselnya valid, kita mem-bypass masalah itu.
 */
function captureVideoToCanvas(video: HTMLVideoElement): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return null;

    try {
        const canvas = document.createElement("canvas");
        canvas.width = vw;
        canvas.height = vh;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0, vw, vh);

        // Verifikasi bahwa canvas benar-benar berisi piksel (bukan hitam kosong)
        const sample = ctx.getImageData(
            Math.floor(vw / 4), Math.floor(vh / 4),
            Math.min(32, Math.floor(vw / 2)), Math.min(32, Math.floor(vh / 2))
        );
        let nonZeroCount = 0;
        for (let i = 0; i < sample.data.length; i += 4) {
            if (sample.data[i] > 5 || sample.data[i + 1] > 5 || sample.data[i + 2] > 5) {
                nonZeroCount++;
            }
        }
        const totalPixels = sample.data.length / 4;
        const hasContent = nonZeroCount > totalPixels * 0.05;

        if (!hasContent) {
            log.warn("Canvas berisi piksel hitam/kosong setelah drawImage dari video", {
                videoWidth: vw,
                videoHeight: vh,
                nonZeroPixels: nonZeroCount,
                totalSampled: totalPixels,
            });
            return null;
        }

        return canvas;
    } catch (err) {
        log.error("Gagal capture video ke canvas", {
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/**
 * Detect a single face dan kembalikan 128-point descriptor.
 * Menggunakan canvas yang sudah diverifikasi pikselnya sebagai input,
 * sehingga face-api.js tidak perlu melakukan konversi internal yang
 * bisa menghasilkan canvas kosong pada HP tertentu.
 *
 * Return `null` jika tidak ada wajah terdeteksi atau timeout.
 */
export async function detectFaceDescriptor(
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
    if (!modelsLoaded) {
        await loadFaceModels();
    }

    // Untuk video: tangkap frame ke canvas terlebih dahulu, verifikasi isinya
    let detectionInput: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement = input;
    if (input instanceof HTMLVideoElement) {
        if (input.readyState < 3 || input.videoWidth === 0 || input.videoHeight === 0) {
            return null;
        }
        const canvas = captureVideoToCanvas(input);
        if (canvas) {
            detectionInput = canvas;
        }
        // Jika capture gagal (canvas kosong), tetap coba pakai video langsung
    }

    const detectionWork = async (): Promise<Float32Array | null> => {
        try {
            const options = new faceapi.SsdMobilenetv1Options({
                minConfidence: FACE_DETECTION_MIN_CONFIDENCE,
            });

            const single = await faceapi
                .detectSingleFace(detectionInput, options)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (single?.descriptor) {
                return single.descriptor;
            }

            return null;
        } catch (err) {
            log.error("Error saat deteksi wajah", {
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    };

    // Proteksi timeout
    const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), DETECTION_TIMEOUT_MS)
    );

    return Promise.race([detectionWork(), timeout]);
}

interface MultiFrameDetectionOptions {
    attempts?: number;
    minimumDetections?: number;
    intervalMs?: number;
    onAttempt?: (attempt: number, total: number, detections: number) => void;
    onDiagnostic?: (info: string) => void;
}

/**
 * Pindai beberapa frame video dan kumpulkan descriptor yang berhasil.
 * Setiap frame dilindungi timeout individual.
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

        // Jeda agar browser sempat render frame video baru dan repaint UI
        await new Promise<void>((resolve) => setTimeout(resolve, 80));

        const t0 = performance.now();
        const descriptor = await detectFaceDescriptor(input);
        const elapsed = Math.round(performance.now() - t0);

        if (descriptor) {
            options.onDiagnostic?.(`Frame ${attempt + 1}: terdeteksi (${elapsed}ms)`);
            descriptors.push(descriptor);
        } else {
            const reason = elapsed >= DETECTION_TIMEOUT_MS ? "timeout" : "tidak terdeteksi";
            options.onDiagnostic?.(`Frame ${attempt + 1}: ${reason} (${elapsed}ms)`);
        }

        if (descriptors.length >= minimumDetections) break;
        if (attempt < attempts - 1 && intervalMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        }
    }

    if (descriptors.length === 0) {
        const inputInfo = input instanceof HTMLVideoElement
            ? { videoWidth: input.videoWidth, videoHeight: input.videoHeight, readyState: input.readyState }
            : {};
        log.warn("Wajah tidak terdeteksi setelah seluruh percobaan scan", {
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

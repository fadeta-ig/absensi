/**
 * Face Recognition — face-api.js wrapper
 *
 * Setiap langkah di-log secara detail agar mudah debug:
 * - Model load: durasi per model
 * - Detection: input element info, jumlah deteksi, skor confidence
 * - Comparison: jarak euclidean, threshold, hasil match
 *
 * Log dikirim ke server via clientLogger → /api/logs/client
 */

import * as faceapi from "face-api.js";
import { createClientLogger } from "@/lib/clientLogger";

const log = createClientLogger("FaceRecognition");

let modelsLoaded = false;
let modelsLoading = false; // guard agar tidak double-load paralel

/**
 * Load the required face-api.js models from /models/ directory.
 * Only loads once — subsequent calls are no-ops.
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) {
    log.debug("Models sudah ter-load sebelumnya, skip.");
    return;
  }

  if (modelsLoading) {
    log.warn("Model sedang dalam proses load oleh panggilan lain, menunggu...");
    // Tunggu sampai flag berubah (polling sederhana)
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
  log.info("Mulai load face-api models", { modelUrl: MODEL_URL });

  const t0 = performance.now();

  try {
    await Promise.all([
      loadSingleModel("SSD MobileNetV1",    () => faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)),
      loadSingleModel("Face Landmark 68",    () => faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)),
      loadSingleModel("Face Recognition Net", () => faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)),
    ]);

    const elapsed = (performance.now() - t0).toFixed(0);
    modelsLoaded = true;
    log.info(`Semua model berhasil di-load`, { durasiMs: elapsed });
  } catch (err) {
    modelsLoading = false;
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("GAGAL load face-api models", {
      error: errMsg,
      stack: err instanceof Error ? err.stack : undefined,
      modelUrl: MODEL_URL,
    });
    throw err;
  }

  modelsLoading = false;
}

async function loadSingleModel(name: string, loader: () => Promise<void>): Promise<void> {
  const t0 = performance.now();
  log.debug(`Loading model: ${name}...`);
  try {
    await loader();
    const elapsed = (performance.now() - t0).toFixed(0);
    log.info(`Model loaded: ${name}`, { durasiMs: elapsed });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`GAGAL load model: ${name}`, { error: errMsg });
    throw err;
  }
}

/**
 * Detect a single face in the given input and return its 128-point descriptor.
 * Returns `null` if no face is detected.
 */
export async function detectFaceDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  // Log info tentang input element
  const inputInfo = getInputInfo(input);
  log.info("Memulai deteksi wajah", inputInfo);

  if (!modelsLoaded) {
    log.error("Deteksi dipanggil sebelum model selesai di-load!");
    return null;
  }

  const t0 = performance.now();

  try {
    const detection = await faceapi
      .detectSingleFace(input)
      .withFaceLandmarks()
      .withFaceDescriptor();

    const elapsed = (performance.now() - t0).toFixed(0);

    if (!detection) {
      log.warn("Tidak ada wajah terdeteksi di frame", {
        ...inputInfo,
        durasiMs: elapsed,
      });
      return null;
    }

    const box = detection.detection.box;
    log.info("Wajah berhasil dideteksi", {
      score: detection.detection.score.toFixed(4),
      boxX: Math.round(box.x),
      boxY: Math.round(box.y),
      boxW: Math.round(box.width),
      boxH: Math.round(box.height),
      descriptorLength: detection.descriptor.length,
      durasiMs: elapsed,
    });

    return detection.descriptor;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Error saat deteksi wajah", {
      error: errMsg,
      stack: err instanceof Error ? err.stack : undefined,
      ...inputInfo,
    });
    return null;
  }
}

/** Ambil info diagnostik dari input element */
function getInputInfo(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
  if (input instanceof HTMLVideoElement) {
    return {
      inputType: "video",
      videoWidth: input.videoWidth,
      videoHeight: input.videoHeight,
      readyState: input.readyState,    // 0=HAVE_NOTHING, 4=HAVE_ENOUGH_DATA
      paused: input.paused,
      srcObjectNull: input.srcObject === null,
    };
  }
  if (input instanceof HTMLCanvasElement) {
    return {
      inputType: "canvas",
      width: input.width,
      height: input.height,
    };
  }
  return { inputType: "image" };
}

/** Match threshold — lower = stricter */
const DEFAULT_THRESHOLD = 0.45;

/**
 * Compare two face descriptors using Euclidean distance.
 * @returns `{ match, distance }` — match is true if distance < threshold
 */
export function compareFaces(
  descriptor1: Float32Array | number[],
  descriptor2: Float32Array | number[],
  threshold: number = DEFAULT_THRESHOLD
): { match: boolean; distance: number } {
  const d1 = descriptor1 instanceof Float32Array ? descriptor1 : new Float32Array(descriptor1);
  const d2 = descriptor2 instanceof Float32Array ? descriptor2 : new Float32Array(descriptor2);

  const distance = faceapi.euclideanDistance(Array.from(d1), Array.from(d2));
  const match = distance < threshold;

  log.info("Hasil perbandingan wajah", {
    distance: distance.toFixed(4),
    threshold,
    match,
    similarityPct: `${((1 - distance) * 100).toFixed(1)}%`,
  });

  return { match, distance };
}

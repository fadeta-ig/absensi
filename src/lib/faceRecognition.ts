import * as faceapi from "face-api.js";

let modelsLoaded = false;

/**
 * Load the required face-api.js models from /models/ directory.
 * Only loads once — subsequent calls are no-ops.
 */
export async function loadFaceModels(): Promise<void> {
    if (modelsLoaded) return;

    const MODEL_URL = "/models";
    await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    modelsLoaded = true;
}

/**
 * Detect a single face in the given input and return its 128-point descriptor.
 * Returns `null` if no face is detected.
 */
export async function detectFaceDescriptor(
    input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
    const detection = await faceapi
        .detectSingleFace(input)
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) return null;
    return detection.descriptor;
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

    const distance = faceapi.euclideanDistance(
        Array.from(d1),
        Array.from(d2)
    );

    return { match: distance < threshold, distance };
}

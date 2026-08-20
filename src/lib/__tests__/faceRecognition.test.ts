import { beforeEach, describe, expect, it, vi } from "vitest";

const { detectSingleFace } = vi.hoisted(() => ({
    detectSingleFace: vi.fn(),
}));

vi.mock("face-api.js", () => ({
    SsdMobilenetv1Options: class {
        constructor(public options: { minConfidence: number }) {}
    },
    detectSingleFace,
    euclideanDistance: vi.fn((first: number[], second: number[]) => (
        Math.sqrt(first.reduce((sum, value, index) => sum + (value - second[index]) ** 2, 0))
    )),
    nets: {
        ssdMobilenetv1: { loadFromUri: vi.fn() },
        faceLandmark68Net: { loadFromUri: vi.fn() },
        faceRecognitionNet: { loadFromUri: vi.fn() },
    },
}));

vi.mock("@/lib/clientLogger", () => ({
    createClientLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

import {
    averageFaceDescriptors,
    compareFaces,
    detectFaceDescriptors,
    FACE_THRESHOLD,
    loadFaceModels,
} from "@/lib/faceRecognition";

function detectionChain(descriptor: Float32Array | null) {
    return {
        withFaceLandmarks: () => ({
            withFaceDescriptor: () => Promise.resolve(descriptor ? { descriptor } : null),
        }),
    };
}

describe("faceRecognition", () => {
    beforeEach(() => {
        detectSingleFace.mockReset();
    });

    it("menggunakan threshold kamera buram 0.92", () => {
        expect(FACE_THRESHOLD).toBe(0.92);
        expect(compareFaces([0], [0.91]).match).toBe(true);
        expect(compareFaces([0], [0.93]).match).toBe(false);
    });

    it("mencoba frame berikutnya saat wajah tidak terdeteksi", async () => {
        await loadFaceModels();
        const descriptor = new Float32Array([1, 0]);
        detectSingleFace
            .mockImplementationOnce(() => detectionChain(null))
            .mockImplementationOnce(() => detectionChain(descriptor));

        const results = await detectFaceDescriptors({} as HTMLVideoElement, {
            attempts: 2,
            minimumDetections: 1,
            intervalMs: 0,
        });

        expect(detectSingleFace).toHaveBeenCalledTimes(2);
        expect(detectSingleFace.mock.calls[0][1].options.minConfidence).toBe(0.20);
        expect(results).toEqual([descriptor]);
    });

    it("merata-ratakan dan menormalisasi descriptor registrasi", () => {
        const averaged = averageFaceDescriptors([
            new Float32Array([1, 0]),
            new Float32Array([0, 1]),
        ]);

        expect(averaged).not.toBeNull();
        expect(averaged?.[0]).toBeCloseTo(Math.SQRT1_2, 5);
        expect(averaged?.[1]).toBeCloseTo(Math.SQRT1_2, 5);
    });
});

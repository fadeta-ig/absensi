import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

const mocks = vi.hoisted(() => ({
    unlink: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
}));

vi.mock("fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof import("fs/promises")>();
    return { ...actual, unlink: mocks.unlink };
});

vi.mock("@/lib/prisma", () => ({
    prisma: {
        visitReport: { findUnique: mocks.findUnique, delete: mocks.delete },
        visitPhoto: { findMany: mocks.findMany },
    },
}));

import { deleteVisitPhotoFiles } from "@/lib/services/visitPhotoService";
import { deleteVisitReport } from "@/lib/services/visitService";

const VISIT_ID = "123e4567-e89b-4123-a456-426614174000";

beforeEach(() => {
    vi.clearAllMocks();
    mocks.unlink.mockResolvedValue(undefined);
});

describe("deleteVisitPhotoFiles", () => {
    it("unlink tiap path unik; lewati kosong, duplikat, dan path keluar root", async () => {
        await deleteVisitPhotoFiles([
            `${VISIT_ID}/clock_in/a-original.jpg`,
            `${VISIT_ID}/clock_in/a-stamped.jpg`,
            `${VISIT_ID}/clock_in/a-original.jpg`,
            "",
            null,
            "../rahasia.pdf",
            "/etc/passwd",
        ]);
        expect(mocks.unlink).toHaveBeenCalledTimes(2);
        const called = mocks.unlink.mock.calls.map((args) => String(args[0]));
        expect(called.every((p) => p.includes("visit-photos"))).toBe(true);
    });
});

describe("deleteVisitReport", () => {
    it("tolak non-draft tanpa hapus apapun", async () => {
        mocks.findUnique.mockResolvedValue({ status: "clocked_in" });
        expect(await deleteVisitReport(VISIT_ID)).toBe(false);
        expect(mocks.delete).not.toHaveBeenCalled();
        expect(mocks.unlink).not.toHaveBeenCalled();
    });

    it("hapus draft + unlink foto miliknya setelah DB sukses", async () => {
        mocks.findUnique.mockResolvedValue({ status: "draft" });
        mocks.findMany.mockResolvedValue([
            { originalPath: `${VISIT_ID}/clock_in/a-original.jpg`, stampedPath: `${VISIT_ID}/clock_in/a-stamped.jpg` },
        ]);
        mocks.delete.mockResolvedValue({ id: VISIT_ID });
        expect(await deleteVisitReport(VISIT_ID)).toBe(true);
        expect(mocks.delete).toHaveBeenCalledOnce();
        expect(mocks.unlink).toHaveBeenCalledTimes(2);
    });
});

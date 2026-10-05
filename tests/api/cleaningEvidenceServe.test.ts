import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock murni: tanpa tulis hris_local maupun filesystem asli.
const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    evidenceFindUnique: vi.fn(),
    assignmentFindFirst: vi.fn(),
    approvalFindFirst: vi.fn(),
    readFile: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: mocks.unauthorizedResponse,
    forbiddenResponse: mocks.forbiddenResponse,
    serverErrorResponse: mocks.serverErrorResponse,
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningEvidencePhoto: { findUnique: mocks.evidenceFindUnique },
        cleaningWorkerAssignment: { findFirst: mocks.assignmentFindFirst },
        cleaningMonthlyApproval: { findFirst: mocks.approvalFindFirst },
    },
}));

vi.mock("node:fs/promises", () => ({
    readFile: mocks.readFile,
}));

import { GET } from "@/app/api/cleaning/evidence/[id]/route";
import { resolveCleaningEvidencePath } from "@/lib/services/cleaningEvidenceService";
import { makeEmployeeSession, makeWig002Session, makeWorkerSession } from "../fixtures/cleaning";

const EVIDENCE_ID = "evidence-1";
const VALID_PATH = "room-1/2026-09-21/photo-abc123.jpg";
const request = new NextRequest(`http://localhost/api/cleaning/evidence/${EVIDENCE_ID}`);
const context = { params: Promise.resolve({ id: EVIDENCE_ID }) };

function mockEvidence(overrides: Record<string, unknown> = {}) {
    return {
        id: EVIDENCE_ID,
        roomId: "room-1",
        wibDate: "2026-09-21",
        filePath: VALID_PATH,
        mimeType: "image/jpeg",
        ...overrides,
    };
}

describe("serve privat evidence cleaning (Tahap 1, mock-murni)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.readFile.mockResolvedValue(Buffer.from("fake-image"));
        mocks.assignmentFindFirst.mockResolvedValue(null);
        mocks.approvalFindFirst.mockResolvedValue(null);
    });

    it("resolveCleaningEvidencePath menolak traversal dan ekstensi di luar izin", () => {
        expect(resolveCleaningEvidencePath("../rahasia.png")).toBeNull();
        expect(resolveCleaningEvidencePath("../../etc/passwd")).toBeNull();
        expect(resolveCleaningEvidencePath("room-1/2026-09-21/bukti.exe")).toBeNull();
        expect(resolveCleaningEvidencePath("/absolute/path.jpg")).toBeNull();
        expect(resolveCleaningEvidencePath("room-1/2026-09-21/a/b.jpg")).toBeNull();
    });

    it("resolveCleaningEvidencePath menerima path valid di dalam root storage", () => {
        const resolved = resolveCleaningEvidencePath(VALID_PATH);
        expect(resolved).not.toBeNull();
        expect(resolved as string).toContain("cleaning-evidence");
    });

    it("wajib login (401)", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        expect((await GET(request, context)).status).toBe(401);
    });

    it("404 bila evidence tidak ditemukan", async () => {
        mocks.requireAuth.mockResolvedValue(makeWorkerSession());
        mocks.evidenceFindUnique.mockResolvedValue(null);
        expect((await GET(request, context)).status).toBe(404);
    });

    it("403 bila bukan pemilik / WIG002 / reviewer", async () => {
        mocks.requireAuth.mockResolvedValue(makeWorkerSession({ userId: "other-user" }));
        mocks.evidenceFindUnique.mockResolvedValue(mockEvidence());
        mocks.assignmentFindFirst.mockResolvedValue(null);
        mocks.approvalFindFirst.mockResolvedValue(null);
        expect((await GET(request, context)).status).toBe(403);
    });

    it("200 untuk pekerja pemilik ruangan-tanggal + header privat", async () => {
        mocks.requireAuth.mockResolvedValue(makeWorkerSession({ userId: "worker-1" }));
        mocks.evidenceFindUnique.mockResolvedValue(mockEvidence());
        mocks.assignmentFindFirst.mockResolvedValue({ id: "assignment-1" });

        const response = await GET(request, context);
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("content-type")).toBe("image/jpeg");
    });

    it("200 untuk WIG002 tanpa cek assignment", async () => {
        mocks.requireAuth.mockResolvedValue(makeWig002Session());
        mocks.evidenceFindUnique.mockResolvedValue(mockEvidence());

        const response = await GET(request, context);
        expect(response.status).toBe(200);
        expect(mocks.assignmentFindFirst).not.toHaveBeenCalled();
    });

    it("200 untuk reviewer bulan berjalan (employee.self)", async () => {
        mocks.requireAuth.mockResolvedValue(makeEmployeeSession({ employeeId: "EMP001" }));
        mocks.evidenceFindUnique.mockResolvedValue(mockEvidence());
        mocks.assignmentFindFirst.mockResolvedValue(null);
        mocks.approvalFindFirst.mockResolvedValue({ id: "approval-1" });

        const response = await GET(request, context);
        expect(response.status).toBe(200);
        expect(mocks.approvalFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ roomId: "room-1", monthWib: "2026-09" }),
            })
        );
    });

    it("404 bila filePath tersimpan traversal", async () => {
        mocks.requireAuth.mockResolvedValue(makeWig002Session());
        mocks.evidenceFindUnique.mockResolvedValue(mockEvidence({ filePath: "../rahasia.png" }));

        expect((await GET(request, context)).status).toBe(404);
    });

    it("404 bila berkas tidak ada di storage", async () => {
        mocks.requireAuth.mockResolvedValue(makeWig002Session());
        mocks.evidenceFindUnique.mockResolvedValue(mockEvidence());
        const enoent = new Error("missing") as NodeJS.ErrnoException;
        enoent.code = "ENOENT";
        mocks.readFile.mockRejectedValue(enoent);

        expect((await GET(request, context)).status).toBe(404);
    });
});

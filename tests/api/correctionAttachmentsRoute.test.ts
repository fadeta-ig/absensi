import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    findFirst: vi.fn(),
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFile: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: mocks.unauthorizedResponse,
    forbiddenResponse: mocks.forbiddenResponse,
    serverErrorResponse: mocks.serverErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({
    prisma: { attendanceCorrection: { findFirst: mocks.findFirst } },
}));
vi.mock("fs", () => ({
    existsSync: mocks.existsSync,
    statSync: mocks.statSync,
}));
vi.mock("fs/promises", () => ({
    readFile: mocks.readFile,
}));

import { GET } from "@/app/api/attendance/correction/attachments/[filename]/route";
import { resolveCorrectionAttachmentPath } from "@/lib/services/correctionAttachments";

const FILENAME = "9a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.jpg";
const context = { params: Promise.resolve({ filename: FILENAME }) };
const request = new NextRequest(`http://localhost/api/attendance/correction/attachments/${FILENAME}`);

function mockOwnedFile() {
    mocks.existsSync.mockReturnValue(true);
    mocks.statSync.mockReturnValue({ isDirectory: () => false });
    mocks.readFile.mockResolvedValue(Buffer.from("lampiran"));
}

describe("correction attachment guard", () => {
    beforeEach(() => vi.resetAllMocks());

    it("menolak nama berkas traversal dan ekstensi di luar izin", () => {
        expect(resolveCorrectionAttachmentPath("../rahasia.pdf")).toBeNull();
        expect(resolveCorrectionAttachmentPath("bukti.exe")).toBeNull();
        expect(resolveCorrectionAttachmentPath("a/b.jpg")).toBeNull();
    });

    it("menyelesaikan path valid di dalam root storage", () => {
        const resolved = resolveCorrectionAttachmentPath(FILENAME);
        expect(resolved).not.toBeNull();
        expect(resolved as string).toContain("attendance-corrections");
    });

    it("wajib login", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        expect((await GET(request, context)).status).toBe(401);
    });

    it("menolak non-pemilik tanpa hr.manage", async () => {
        mocks.requireAuth.mockResolvedValue({ username: "WIG002", employeeId: "EMP002", permissions: ["employee.self"] });
        mocks.findFirst.mockResolvedValue(null);
        expect((await GET(request, context)).status).toBe(403);
    });

    it("mengizinkan pemilik koreksi", async () => {
        mocks.requireAuth.mockResolvedValue({ username: "WIG002", employeeId: "EMP002", permissions: ["employee.self"] });
        mocks.findFirst.mockResolvedValue({ id: "correction-1" });
        mockOwnedFile();

        const response = await GET(request, context);
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("content-type")).toBe("image/jpeg");
    });

    it("mengizinkan HR pengelola tanpa cek kepemilikan", async () => {
        mocks.requireAuth.mockResolvedValue({ username: "WIG001", employeeId: "EMP001", permissions: ["hr.manage"] });
        mockOwnedFile();

        const response = await GET(request, context);
        expect(response.status).toBe(200);
        expect(mocks.findFirst).not.toHaveBeenCalled();
    });

    it("404 bila berkas tidak ada di storage", async () => {
        mocks.requireAuth.mockResolvedValue({ username: "WIG001", employeeId: "EMP001", permissions: ["hr.manage"] });
        mocks.existsSync.mockReturnValue(false);

        expect((await GET(request, context)).status).toBe(404);
    });
});

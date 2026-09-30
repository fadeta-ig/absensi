import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    leaveFindFirst: vi.fn(),
    avatarFindFirst: vi.fn(),
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
    prisma: {
        leaveRequest: { findFirst: mocks.leaveFindFirst },
        employee: { findFirst: mocks.avatarFindFirst },
    },
}));
vi.mock("fs", () => ({
    existsSync: mocks.existsSync,
    statSync: mocks.statSync,
}));
vi.mock("fs/promises", () => ({
    readFile: mocks.readFile,
    mkdir: vi.fn(),
    writeFile: vi.fn(),
}));

import { GET as GET_LEAVE } from "@/app/api/leave/attachments/[filename]/route";
import { GET as GET_AVATAR } from "@/app/api/auth/avatar/[filename]/route";
import { resolveLeaveAttachmentPath } from "@/lib/services/leaveService";
import { resolveAvatarPath } from "@/lib/services/avatarService";

const LEAVE_FILENAME = "9a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.pdf";
const AVATAR_FILENAME = "9a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.jpg";

function mockOwnedFile(content: string) {
    mocks.existsSync.mockReturnValue(true);
    mocks.statSync.mockReturnValue({ isDirectory: () => false });
    mocks.readFile.mockResolvedValue(Buffer.from(content));
}

describe("serve privat lampiran cuti", () => {
    beforeEach(() => vi.resetAllMocks());

    it("menolak traversal dan ekstensi di luar izin", () => {
        expect(resolveLeaveAttachmentPath("../rahasia.pdf")).toBeNull();
        expect(resolveLeaveAttachmentPath("bukti.exe")).toBeNull();
    });

    it("wajib login", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        const request = new NextRequest(`http://localhost/api/leave/attachments/${LEAVE_FILENAME}`);
        expect((await GET_LEAVE(request, { params: Promise.resolve({ filename: LEAVE_FILENAME }) })).status).toBe(401);
    });

    it("menolak non-pemilik tanpa hr.manage", async () => {
        mocks.requireAuth.mockResolvedValue({ username: "WIG002", employeeId: "EMP002", permissions: ["employee.self"] });
        mocks.leaveFindFirst.mockResolvedValue({ id: "leave-1", employeeId: "EMP001", attachmentMime: "application/pdf" });
        const request = new NextRequest(`http://localhost/api/leave/attachments/${LEAVE_FILENAME}`);
        expect((await GET_LEAVE(request, { params: Promise.resolve({ filename: LEAVE_FILENAME }) })).status).toBe(403);
    });

    it("mengizinkan pemilik dan HR pengelola", async () => {
        mockOwnedFile("%PDF-lampiran");
        mocks.requireAuth.mockResolvedValue({ username: "WIG002", employeeId: "EMP002", permissions: ["employee.self"] });
        mocks.leaveFindFirst.mockResolvedValue({ id: "leave-1", employeeId: "EMP002", attachmentMime: "application/pdf" });
        const request = new NextRequest(`http://localhost/api/leave/attachments/${LEAVE_FILENAME}`);
        const owned = await GET_LEAVE(request, { params: Promise.resolve({ filename: LEAVE_FILENAME }) });
        expect(owned.status).toBe(200);
        expect(owned.headers.get("content-type")).toBe("application/pdf");
        expect(owned.headers.get("cache-control")).toBe("private, no-store");

        mocks.requireAuth.mockResolvedValue({ username: "WIG001", employeeId: "EMP001", permissions: ["hr.manage"] });
        const hr = await GET_LEAVE(request, { params: Promise.resolve({ filename: LEAVE_FILENAME }) });
        expect(hr.status).toBe(200);
    });

    it("404 bila baris lampiran tak dikenal atau berkas hilang", async () => {
        mocks.requireAuth.mockResolvedValue({ username: "WIG001", employeeId: "EMP001", permissions: ["hr.manage"] });
        mocks.leaveFindFirst.mockResolvedValue(null);
        const request = new NextRequest(`http://localhost/api/leave/attachments/${LEAVE_FILENAME}`);
        expect((await GET_LEAVE(request, { params: Promise.resolve({ filename: LEAVE_FILENAME }) })).status).toBe(404);

        mocks.leaveFindFirst.mockResolvedValue({ id: "leave-1", employeeId: "EMP001", attachmentMime: "application/pdf" });
        mocks.existsSync.mockReturnValue(false);
        expect((await GET_LEAVE(request, { params: Promise.resolve({ filename: LEAVE_FILENAME }) })).status).toBe(404);
    });
});

describe("serve privat avatar", () => {
    beforeEach(() => vi.resetAllMocks());

    it("menolak traversal dan ekstensi di luar izin", () => {
        expect(resolveAvatarPath("EMP001", "../rahasia.jpg")).toBeNull();
        expect(resolveAvatarPath("EMP001", "avatar.exe")).toBeNull();
    });

    it("wajib login", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        const request = new NextRequest(`http://localhost/api/auth/avatar/${AVATAR_FILENAME}`);
        expect((await GET_AVATAR(request, { params: Promise.resolve({ filename: AVATAR_FILENAME }) })).status).toBe(401);
    });

    it("mengizinkan self (owner) dan hr.manage, menolak orang lain", async () => {
        mockOwnedFile("avatar-bytes");
        mocks.requireAuth.mockResolvedValue({ username: "WIG002", employeeId: "EMP002", permissions: ["employee.self"] });
        mocks.avatarFindFirst.mockResolvedValue({ employeeId: "EMP002", avatarPath: `EMP002/${AVATAR_FILENAME}` });
        const request = new NextRequest(`http://localhost/api/auth/avatar/${AVATAR_FILENAME}`);
        const owned = await GET_AVATAR(request, { params: Promise.resolve({ filename: AVATAR_FILENAME }) });
        expect(owned.status).toBe(200);
        expect(owned.headers.get("content-type")).toBe("image/jpeg");

        mocks.avatarFindFirst.mockResolvedValue({ employeeId: "EMP003", avatarPath: `EMP003/${AVATAR_FILENAME}` });
        expect((await GET_AVATAR(request, { params: Promise.resolve({ filename: AVATAR_FILENAME }) })).status).toBe(403);

        mocks.requireAuth.mockResolvedValue({ username: "WIG001", employeeId: "EMP001", permissions: ["hr.manage"] });
        expect((await GET_AVATAR(request, { params: Promise.resolve({ filename: AVATAR_FILENAME }) })).status).toBe(200);
    });

    it("404 bila avatar tak terdaftar atau berkas hilang", async () => {
        mocks.requireAuth.mockResolvedValue({ username: "WIG001", employeeId: "EMP001", permissions: ["hr.manage"] });
        mocks.avatarFindFirst.mockResolvedValue(null);
        const request = new NextRequest(`http://localhost/api/auth/avatar/${AVATAR_FILENAME}`);
        expect((await GET_AVATAR(request, { params: Promise.resolve({ filename: AVATAR_FILENAME }) })).status).toBe(404);

        mocks.avatarFindFirst.mockResolvedValue({ employeeId: "EMP002", avatarPath: `EMP002/${AVATAR_FILENAME}` });
        mocks.existsSync.mockReturnValue(false);
        expect((await GET_AVATAR(request, { params: Promise.resolve({ filename: AVATAR_FILENAME }) })).status).toBe(404);
    });
});

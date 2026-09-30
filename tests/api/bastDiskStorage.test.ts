import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "unauth" }, { status: 401 })),
    forbiddenResponse: vi.fn(() => NextResponse.json({ error: "forbidden" }, { status: 403 })),
    serverErrorResponse: vi.fn(() => NextResponse.json({ error: "server" }, { status: 500 })),
    parseFormData: vi.fn(),
    assetHistoryFindUnique: vi.fn(),
    bastCreate: vi.fn(),
    bastFindUnique: vi.fn(),
    bastDelete: vi.fn(),
    getUploadLimit: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
    logAction: vi.fn(),
    actorFromSession: vi.fn((s: { userId: string; username: string }) => ({ userId: s.userId, identifier: s.username })),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: mocks.unauthorizedResponse,
    forbiddenResponse: mocks.forbiddenResponse,
    serverErrorResponse: mocks.serverErrorResponse,
    parseFormData: mocks.parseFormData,
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        assetHistory: { findUnique: mocks.assetHistoryFindUnique },
        assetBastDocument: {
            create: mocks.bastCreate,
            findUnique: mocks.bastFindUnique,
            delete: mocks.bastDelete,
        },
    },
}));

vi.mock("@/lib/services/appSettingsService", () => ({
    getUploadLimit: mocks.getUploadLimit,
}));

vi.mock("fs/promises", () => ({
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
    unlink: mocks.unlink,
}));

vi.mock("@/lib/services/auditService", () => ({
    actorFromSession: mocks.actorFromSession,
    logAction: mocks.logAction,
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/permissions", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/permissions")>();
    return { ...actual };
});

import { POST } from "@/app/api/assets/bast/route";
import { DELETE, GET } from "@/app/api/assets/bast/[id]/route";

const SESSION = {
    role: "ga",
    username: "GA001",
    userId: "user-ga-1",
    roles: ["GA_ADMIN"],
    permissions: ["ga.manage", "hr.manage", "asset.read"],
};
const HISTORY_ID = "history-uuid-1";
const PDF_BYTES = Buffer.from("%PDF-1.4 bast-test-content");

function formWithFile(file: File, historyId: string | null = HISTORY_ID): FormData {
    const form = new FormData();
    form.append("file", file);
    if (historyId !== null) form.append("historyId", historyId);
    return form;
}

function dummyRequest(): NextRequest {
    return new NextRequest("http://localhost/api/assets/bast", { method: "POST" });
}

function idContext(id: string) {
    return { params: Promise.resolve({ id }) };
}

describe("BAST disk+path (Gel.2c, mock fs+prisma, tanpa DB tulis)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireAuth.mockResolvedValue(SESSION);
        mocks.getUploadLimit.mockResolvedValue(5);
        mocks.mkdir.mockResolvedValue(undefined);
        mocks.writeFile.mockResolvedValue(undefined);
        mocks.readFile.mockResolvedValue(PDF_BYTES);
        mocks.unlink.mockResolvedValue(undefined);
        mocks.assetHistoryFindUnique.mockResolvedValue({ id: HISTORY_ID });
        mocks.logAction.mockResolvedValue(undefined);
    });

    it("POST menyimpan ke storage/bast-documents/{historyId}/{uuid}.ext dengan wx dan fileData kosong", async () => {
        const file = new File([new Uint8Array(PDF_BYTES)], "bast.pdf", { type: "application/pdf" });
        mocks.parseFormData.mockResolvedValue({ data: formWithFile(file) });
        mocks.bastCreate.mockImplementation(async (arg: { data: Record<string, unknown> }) => ({
            id: "bast-1",
            ...arg.data,
        }));

        const res = await POST(dummyRequest());

        expect(res.status).toBe(201);
        expect(mocks.getUploadLimit).toHaveBeenCalledWith("upload.bast.maxMb");
        expect(mocks.mkdir).toHaveBeenCalledTimes(1);
        expect(mocks.writeFile).toHaveBeenCalledTimes(1);
        const [, written, options] = mocks.writeFile.mock.calls[0] as [string, Buffer, { flag: string }];
        expect(options).toMatchObject({ flag: "wx" });
        expect(Buffer.isBuffer(written) ? written : Buffer.from(written as Uint8Array)).toEqual(PDF_BYTES);
        const absPath = mocks.writeFile.mock.calls[0][0] as string;
        expect(absPath).toContain("bast-documents");

        expect(mocks.bastCreate).toHaveBeenCalledTimes(1);
        const createArg = mocks.bastCreate.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(createArg.data.historyId).toBe(HISTORY_ID);
        expect(createArg.data.filePath).toMatch(new RegExp(`^${HISTORY_ID}/.+\\.pdf$`));
        expect(createArg.data.mimeType).toBe("application/pdf");
        expect(createArg.data.fileName).toBe("bast.pdf");
        // Base64/blob dilarang masuk DB untuk upload baru.
        const fileData = createArg.data.fileData as Buffer;
        expect(Buffer.isBuffer(fileData) ? fileData.length : (fileData as Uint8Array).length).toBe(0);

        const json = (await res.json()) as Record<string, unknown>;
        expect(json).not.toHaveProperty("fileData");
        expect(json.filePath).toBe(createArg.data.filePath);
    });

    it("POST menolak berkas melebihi batas setting upload.bast.maxMb", async () => {
        mocks.getUploadLimit.mockResolvedValue(1);
        const big = Buffer.alloc(2 * 1024 * 1024, 0x25);
        big.subarray(0, 5).set(Buffer.from("%PDF-"));
        const file = new File([new Uint8Array(big)], "besar.pdf", { type: "application/pdf" });
        Object.defineProperty(file, "size", { value: big.length });
        mocks.parseFormData.mockResolvedValue({ data: formWithFile(file) });

        const res = await POST(dummyRequest());

        expect(res.status).toBe(400);
        expect(mocks.writeFile).not.toHaveBeenCalled();
        expect(mocks.bastCreate).not.toHaveBeenCalled();
    });

    it("GET dual-read: filePath ada → stream file disk dengan header nosniff + private,no-store", async () => {
        mocks.requireAuth.mockResolvedValue({ ...SESSION, role: "ga" });
        mocks.bastFindUnique.mockResolvedValue({
            id: "bast-1",
            mimeType: "application/pdf",
            fileName: "bast.pdf",
            filePath: `${HISTORY_ID}/uuid.pdf`,
            fileData: Buffer.alloc(0),
        });

        const res = await GET(new NextRequest("http://localhost/api/assets/bast/bast-1"), idContext("bast-1"));

        expect(res.status).toBe(200);
        expect(mocks.readFile).toHaveBeenCalledTimes(1);
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(res.headers.get("content-type")).toBe("application/pdf");
        expect(Buffer.from(await res.arrayBuffer()).equals(PDF_BYTES)).toBe(true);
    });

    it("GET fallback: filePath kosong → blob lama fileData tetap disajikan (cabang lama dipertahankan)", async () => {
        const legacy = Buffer.from("%PDF-1.4 legacy-blob");
        mocks.bastFindUnique.mockResolvedValue({
            id: "bast-legacy",
            mimeType: "application/pdf",
            fileName: "lama.pdf",
            filePath: null,
            fileData: legacy,
        });

        const res = await GET(new NextRequest("http://localhost/api/assets/bast/bast-legacy"), idContext("bast-legacy"));

        expect(res.status).toBe(200);
        expect(mocks.readFile).not.toHaveBeenCalled();
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(Buffer.from(await res.arrayBuffer()).equals(legacy)).toBe(true);
    });

    it("GET 404 bila disk hilang dan blob lama kosong", async () => {
        const enoent = Object.assign(new Error("missing"), { code: "ENOENT" });
        mocks.readFile.mockRejectedValue(enoent);
        mocks.bastFindUnique.mockResolvedValue({
            id: "bast-gone",
            mimeType: "application/pdf",
            fileName: "hilang.pdf",
            filePath: `${HISTORY_ID}/gone.pdf`,
            fileData: Buffer.alloc(0),
        });

        const res = await GET(new NextRequest("http://localhost/api/assets/bast/bast-gone"), idContext("bast-gone"));

        expect(res.status).toBe(404);
    });

    it("DELETE menghapus file fisik SETELAH db delete sukses dan mengabaikan ENOENT", async () => {
        mocks.bastFindUnique.mockResolvedValue({
            id: "bast-1",
            fileName: "bast.pdf",
            filePath: `${HISTORY_ID}/uuid.pdf`,
        });
        mocks.bastDelete.mockResolvedValue({ id: "bast-1" });
        const enoent = Object.assign(new Error("gone"), { code: "ENOENT" });
        mocks.unlink.mockRejectedValue(enoent);

        const res = await DELETE(new NextRequest("http://localhost/api/assets/bast/bast-1", { method: "DELETE" }), idContext("bast-1"));

        expect(res.status).toBe(200);
        expect(mocks.bastDelete).toHaveBeenCalledWith({ where: { id: "bast-1" } });
        expect(mocks.unlink).toHaveBeenCalledTimes(1);
        const unlinked = mocks.unlink.mock.calls[0][0] as string;
        expect(unlinked).toContain("bast-documents");
    });
});

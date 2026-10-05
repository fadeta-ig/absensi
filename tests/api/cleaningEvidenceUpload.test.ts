import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock murni: tanpa tulis hris_local maupun filesystem asli.
// CATATAN: factory mock TIDAK memakai importOriginal agar `@/lib/auth`
// (JWT_SECRET top-level) tidak pernah dimuat di suite ini.
const mocks = vi.hoisted(() => {
    class CleaningEvidenceError extends Error {
        statusCode: number;
        constructor(message: string, statusCode = 400) {
            super(message);
            this.name = "CleaningEvidenceError";
            this.statusCode = statusCode;
        }
    }
    return {
        requireAuth: vi.fn(),
        itemFindUnique: vi.fn(),
        assignmentFindFirst: vi.fn(),
        settingFindUnique: vi.fn(async () => null),
        saveCleaningEvidence: vi.fn(),
        listByItem: vi.fn(),
        hasAccess: vi.fn(),
        CleaningEvidenceError,
    };
});

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: () => new Response(JSON.stringify({ error: "Sesi berakhir." }), { status: 401 }),
    forbiddenResponse: () => new Response(JSON.stringify({ error: "Akses ditolak." }), { status: 403 }),
    parseFormData: async (request: Request) => {
        try {
            return { data: await request.formData() };
        } catch {
            return {
                error: new Response(JSON.stringify({ error: "Format form-data tidak valid." }), { status: 400 }),
            };
        }
    },
    serverErrorResponse: () =>
        new Response(JSON.stringify({ error: "Terjadi kesalahan pada server." }), { status: 500 }),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningDailyChecklistItem: { findUnique: mocks.itemFindUnique },
        cleaningWorkerAssignment: { findFirst: mocks.assignmentFindFirst },
        appSetting: { findUnique: mocks.settingFindUnique },
    },
}));

vi.mock("@/lib/services/cleaningEvidenceService", () => ({
    CleaningEvidenceError: mocks.CleaningEvidenceError,
    saveCleaningEvidence: mocks.saveCleaningEvidence,
    listCleaningEvidenceByItem: mocks.listByItem,
    hasCleaningEvidenceAccess: mocks.hasAccess,
}));

import { GET, POST } from "@/app/api/cleaning/evidence/route";
import { CleaningEvidenceError } from "@/lib/services/cleaningEvidenceService";
import { makeWorkerSession, makeWig002Session } from "../fixtures/cleaning";

const ITEM = { id: "item-1", checklist: { roomId: "room-1", wibDate: "2026-09-21" } };
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const jpegFile = (type = "image/jpeg") => new File([JPEG_BYTES], "bukti.jpg", { type });

function postRequest({ checklistItemId, file, note }: { checklistItemId?: string; file?: File | null; note?: string }) {
    const form = new FormData();
    if (checklistItemId !== undefined) form.append("checklistItemId", checklistItemId);
    if (file !== undefined && file !== null) form.append("photo", file);
    if (note !== undefined) form.append("note", note);
    return new NextRequest("http://localhost/api/cleaning/evidence", { method: "POST", body: form });
}

describe("POST /api/cleaning/evidence (Tahap 3, mock-murni)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.itemFindUnique.mockResolvedValue(ITEM);
        mocks.assignmentFindFirst.mockResolvedValue({ id: "assignment-1" });
        mocks.saveCleaningEvidence.mockResolvedValue({
            id: "photo-1",
            mimeType: "image/jpeg",
            size: JPEG_BYTES.length,
            capturedAt: new Date("2026-09-21T10:00:00+07:00"),
            note: null,
        });
    });

    it("401 bila tanpa sesi", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        expect((await POST(postRequest({ checklistItemId: "item-1", file: jpegFile() }))).status).toBe(401);
    });

    it("400 bila checklistItemId / foto hilang atau MIME bukan JPEG", async () => {
        mocks.requireAuth.mockResolvedValue(makeWig002Session());
        expect((await POST(postRequest({ file: jpegFile() }))).status).toBe(400);
        expect((await POST(postRequest({ checklistItemId: "item-1" }))).status).toBe(400);
        expect((await POST(postRequest({ checklistItemId: "item-1", file: jpegFile("image/png") }))).status).toBe(400);
        expect(mocks.saveCleaningEvidence).not.toHaveBeenCalled();
    });

    it("404 bila item tidak ditemukan", async () => {
        mocks.requireAuth.mockResolvedValue(makeWig002Session());
        mocks.itemFindUnique.mockResolvedValue(null);
        expect((await POST(postRequest({ checklistItemId: "item-hilang", file: jpegFile() }))).status).toBe(404);
    });

    it("403 bila pekerja tanpa assignment-efektif (WIG002 lolos tanpa cek assignment)", async () => {
        mocks.requireAuth.mockResolvedValue(makeWorkerSession({ userId: "worker-tanpa-tugas" }));
        mocks.assignmentFindFirst.mockResolvedValue(null);
        expect((await POST(postRequest({ checklistItemId: "item-1", file: jpegFile() }))).status).toBe(403);

        mocks.requireAuth.mockResolvedValue(makeWig002Session());
        mocks.assignmentFindFirst.mockClear();
        const response = await POST(postRequest({ checklistItemId: "item-1", file: jpegFile() }));
        expect(response.status).toBe(201);
        expect(mocks.assignmentFindFirst).not.toHaveBeenCalled();
    });

    it("413 saat service menolak over-limit, 409 saat kuota item penuh", async () => {
        mocks.requireAuth.mockResolvedValue(makeWig002Session());
        mocks.saveCleaningEvidence.mockRejectedValueOnce(new CleaningEvidenceError("Ukuran foto maksimal 2 MB.", 413));
        expect((await POST(postRequest({ checklistItemId: "item-1", file: jpegFile() }))).status).toBe(413);

        mocks.saveCleaningEvidence.mockRejectedValueOnce(new CleaningEvidenceError("Batas 3 foto per item sudah tercapai.", 409));
        const full = await POST(postRequest({ checklistItemId: "item-1", file: jpegFile() }));
        expect(full.status).toBe(409);
        expect(await full.json()).toMatchObject({ error: expect.stringContaining("3 foto") });
    });

    it("201 + URL serve untuk susulan tanggal lampau (tanpa guard hari-ini)", async () => {
        mocks.requireAuth.mockResolvedValue(makeWorkerSession({ userId: "worker-1" }));
        const response = await POST(
            postRequest({ checklistItemId: "item-1", file: jpegFile(), note: "wastafel" })
        );
        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.data).toMatchObject({
            id: "photo-1",
            url: "/api/cleaning/evidence/photo-1",
            mimeType: "image/jpeg",
        });
        expect(mocks.saveCleaningEvidence).toHaveBeenCalledWith(
            expect.objectContaining({
                checklistItemId: "item-1",
                mime: "image/jpeg",
                uploaderUserId: "worker-1",
                note: "wastafel",
            })
        );
        const sentBuffer = mocks.saveCleaningEvidence.mock.calls[0][0].buffer as Buffer;
        expect(Buffer.isBuffer(sentBuffer)).toBe(true);
        expect(sentBuffer[0]).toBe(0xff);
    });
});

describe("GET /api/cleaning/evidence?checklistItemId= (Tahap 3, mock-murni)", () => {
    const getRequest = (query: string) =>
        new NextRequest(`http://localhost/api/cleaning/evidence${query}`);

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.itemFindUnique.mockResolvedValue(ITEM);
        mocks.hasAccess.mockResolvedValue(true);
        mocks.listByItem.mockResolvedValue([
            {
                id: "photo-1",
                checklistItemId: "item-1",
                mimeType: "image/jpeg",
                size: 1234,
                capturedAt: new Date("2026-09-21T10:00:00+07:00"),
                note: null,
                createdAt: new Date("2026-09-21T10:00:00+07:00"),
            },
        ]);
    });

    it("401 tanpa sesi, 400 tanpa param, 404 item hilang, 403 tanpa akses", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        expect((await GET(getRequest("?checklistItemId=item-1"))).status).toBe(401);

        mocks.requireAuth.mockResolvedValue(makeWig002Session());
        expect((await GET(getRequest(""))).status).toBe(400);

        mocks.itemFindUnique.mockResolvedValue(null);
        expect((await GET(getRequest("?checklistItemId=item-hilang"))).status).toBe(404);

        mocks.itemFindUnique.mockResolvedValue(ITEM);
        mocks.hasAccess.mockResolvedValue(false);
        expect((await GET(getRequest("?checklistItemId=item-1"))).status).toBe(403);
    });

    it("200 list + URL serve + maxPhotos/maxMb dari setting", async () => {
        mocks.requireAuth.mockResolvedValue(makeWig002Session());
        const response = await GET(getRequest("?checklistItemId=item-1"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.maxPhotos).toBe(3);
        expect(body.maxMb).toBe(2);
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({
            id: "photo-1",
            url: "/api/cleaning/evidence/photo-1",
        });
        expect(mocks.hasAccess).toHaveBeenCalledWith(
            expect.anything(),
            { roomId: "room-1", wibDate: "2026-09-21" }
        );
    });
});

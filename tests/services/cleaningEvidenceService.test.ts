import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock murni: tanpa tulis hris_local maupun filesystem asli.
vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningDailyChecklistItem: { findUnique: vi.fn() },
        cleaningEvidencePhoto: {
            count: vi.fn(),
            create: vi.fn(),
            findMany: vi.fn(),
        },
        appSetting: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock("node:fs/promises", () => ({
    mkdir: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
    writeFile: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import {
    CleaningEvidenceError,
    listCleaningEvidenceByItem,
    resolveCleaningEvidencePath,
    saveCleaningEvidence,
} from "@/lib/services/cleaningEvidenceService";
import {
    CLEANING_EVIDENCE_MAX_PHOTOS_KEY,
    invalidateCleaningEvidenceMaxPhotosCache,
    invalidateUploadLimitCache,
} from "@/lib/services/appSettingsService";

const findItem = () => prisma.cleaningDailyChecklistItem.findUnique as Mock;
const countPhotos = () => prisma.cleaningEvidencePhoto.count as Mock;
const createPhoto = () => prisma.cleaningEvidencePhoto.create as Mock;
const findManyPhotos = () => prisma.cleaningEvidencePhoto.findMany as Mock;
const findSetting = () => prisma.appSetting.findUnique as Mock;
const mkdirMock = () => mkdir as Mock;
const writeFileMock = () => writeFile as Mock;
const unlinkMock = () => unlink as Mock;

const ITEM_ID = "item-uuid-1";
// JPEG valid: header SOI + penanda akhir EOI (layak kamera asli).
const JPEG = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    Buffer.from([0xff, 0xd9]),
]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function mockItem() {
    findItem().mockResolvedValue({
        id: ITEM_ID,
        checklist: { roomId: "room-1", wibDate: "2026-09-21" },
    });
}

function mockLimits({ maxMb = "2", maxPhotos = "3" }: { maxMb?: string | null; maxPhotos?: string | null } = {}) {
    findSetting().mockImplementation(({ where }: { where: { key: string } }) => {
        if (where.key === "upload.cleaningEvidence.maxMb") {
            return Promise.resolve(maxMb === null ? null : { key: where.key, value: maxMb });
        }
        if (where.key === CLEANING_EVIDENCE_MAX_PHOTOS_KEY) {
            return Promise.resolve(maxPhotos === null ? null : { key: where.key, value: maxPhotos });
        }
        return Promise.resolve(null);
    });
}

function mockCreateSuccess() {
    createPhoto().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "photo-1", createdAt: new Date("2026-09-21T10:00:00+07:00"), ...data })
    );
}

async function saveError(input: Parameters<typeof saveCleaningEvidence>[0]) {
    try {
        await saveCleaningEvidence(input);
    } catch (error) {
        return error as Error & { statusCode?: number };
    }
    throw new Error("saveCleaningEvidence seharusnya menolak input ini.");
}

describe("cleaningEvidenceService Tahap 3 (mock-murni)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        invalidateUploadLimitCache();
        invalidateCleaningEvidenceMaxPhotosCache();
        mockItem();
        mockLimits();
        countPhotos().mockResolvedValue(0);
        mkdirMock().mockResolvedValue(undefined);
        writeFileMock().mockResolvedValue(undefined);
        unlinkMock().mockResolvedValue(undefined);
        mockCreateSuccess();
        // Transaksi kuota: teruskan ke mock top-level agar asersi create/count tetap berlaku.
        (prisma.$transaction as Mock).mockImplementation(async (callback: (tx: never) => Promise<unknown>) =>
            callback({
                $queryRaw: vi.fn().mockResolvedValue([]),
                cleaningEvidencePhoto: {
                    count: (...args: never[]) => countPhotos()(...args),
                    create: (...args: never[]) => createPhoto()(...args),
                },
            } as never)
        );
    });

    it("menolak magic non-JPEG (wajib JPEG saja, pola visitPhotoService)", async () => {
        const errPng = await saveError({
            checklistItemId: ITEM_ID,
            buffer: PNG,
            mime: "image/png",
            uploaderUserId: "worker-1",
        });
        expect(errPng).toBeInstanceOf(CleaningEvidenceError);
        expect(errPng.message).toMatch(/JPEG/);
        expect(errPng.statusCode).toBe(400);

        const errClaim = await saveError({
            checklistItemId: ITEM_ID,
            buffer: JPEG,
            mime: "image/png",
            uploaderUserId: "worker-1",
        });
        expect(errClaim.statusCode).toBe(400);
        expect(writeFileMock()).not.toHaveBeenCalled();
        expect(createPhoto()).not.toHaveBeenCalled();
    });

    it("menolak foto melebihi maxMb (413)", async () => {
        mockLimits({ maxMb: "1" });
        const big = Buffer.concat([JPEG, Buffer.alloc(1024 * 1024 + 1), Buffer.from([0xff, 0xd9])]);
        const err = await saveError({
            checklistItemId: ITEM_ID,
            buffer: big,
            mime: "image/jpeg",
            uploaderUserId: "worker-1",
        });
        expect(err).toBeInstanceOf(CleaningEvidenceError);
        expect(err.statusCode).toBe(413);
        expect(writeFileMock()).not.toHaveBeenCalled();
    });

    it("404 bila item checklist tidak ditemukan (tanpa tulis file)", async () => {
        findItem().mockResolvedValue(null);
        const err = await saveError({
            checklistItemId: "item-hilang",
            buffer: JPEG,
            mime: "image/jpeg",
            uploaderUserId: "worker-1",
        });
        expect(err.statusCode).toBe(404);
        expect(writeFileMock()).not.toHaveBeenCalled();
    });

    it("409 bila jumlah existing mencapai maxPhotos (penuh, tanpa tulis file)", async () => {
        mockLimits({ maxPhotos: "3" });
        countPhotos().mockResolvedValue(3);
        const err = await saveError({
            checklistItemId: ITEM_ID,
            buffer: JPEG,
            mime: "image/jpeg",
            uploaderUserId: "worker-1",
        });
        expect(err).toBeInstanceOf(CleaningEvidenceError);
        expect(err.statusCode).toBe(409);
        expect(err.message).toMatch(/3 foto/);
        expect(writeFileMock()).not.toHaveBeenCalled();
        expect(createPhoto()).not.toHaveBeenCalled();
    });

    it("menyimpan file wx + row lengkap, path lolos guard serve Tahap 1", async () => {
        const saved = await saveCleaningEvidence({
            checklistItemId: ITEM_ID,
            buffer: JPEG,
            mime: "image/jpeg",
            uploaderUserId: "worker-1",
            note: "<b>wastafel</b> bersih",
        });

        expect(writeFileMock()).toHaveBeenCalledTimes(1);
        const [writtenPath, writtenBuffer, options] = writeFileMock().mock.calls[0] as [string, Buffer, { flag: string }];
        expect(options).toEqual({ flag: "wx" });
        expect(writtenBuffer.equals(JPEG)).toBe(true);
        expect(mkdirMock()).toHaveBeenCalledTimes(1);

        expect(createPhoto()).toHaveBeenCalledTimes(1);
        const data = createPhoto().mock.calls[0][0].data as Record<string, unknown>;
        expect(data).toMatchObject({
            checklistItemId: ITEM_ID,
            roomId: "room-1",
            wibDate: "2026-09-21",
            mimeType: "image/jpeg",
            size: JPEG.length,
            uploadedByUserId: "worker-1",
        });
        expect(data.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(data.note).toBe("wastafel bersih");
        expect(typeof data.filePath).toBe("string");

        // Path baru wajib dapat diserve route Tahap 1 (guard tidak diubah).
        expect(resolveCleaningEvidencePath(saved.filePath)).toBe(writtenPath);
        expect(saved.filePath.startsWith(`${ITEM_ID}/`)).toBe(true);
    });

    it("cleanup-yatim: berkas dihapus bila insert DB gagal", async () => {
        createPhoto().mockRejectedValue(new Error("DB down"));
        const err = await saveError({
            checklistItemId: ITEM_ID,
            buffer: JPEG,
            mime: "image/jpeg",
            uploaderUserId: "worker-1",
        });
        expect(err.message).toBe("DB down");
        expect(writeFileMock()).toHaveBeenCalledTimes(1);
        const [writtenPath] = writeFileMock().mock.calls[0] as [string];
        expect(unlinkMock()).toHaveBeenCalledWith(writtenPath);
    });

    it("listCleaningEvidenceByItem mengembalikan foto per item terurut", async () => {
        const rows = [
            {
                id: "photo-1",
                checklistItemId: ITEM_ID,
                mimeType: "image/jpeg",
                size: 10,
                capturedAt: new Date("2026-09-21T10:00:00+07:00"),
                note: "wastafel",
                createdAt: new Date("2026-09-21T10:01:00+07:00"),
                uploadedBy: { displayName: "Heri" },
            },
            {
                id: "photo-2",
                checklistItemId: ITEM_ID,
                mimeType: "image/jpeg",
                size: 12,
                capturedAt: new Date("2026-09-21T10:02:00+07:00"),
                note: null,
                createdAt: new Date("2026-09-21T10:03:00+07:00"),
                uploadedBy: null,
            },
        ];
        findManyPhotos().mockResolvedValue(rows);
        await expect(listCleaningEvidenceByItem(ITEM_ID)).resolves.toEqual([
            {
                id: "photo-1",
                checklistItemId: ITEM_ID,
                mimeType: "image/jpeg",
                size: 10,
                capturedAt: rows[0].capturedAt,
                note: "wastafel",
                createdAt: rows[0].createdAt,
                uploaderName: "Heri",
            },
            {
                id: "photo-2",
                checklistItemId: ITEM_ID,
                mimeType: "image/jpeg",
                size: 12,
                capturedAt: rows[1].capturedAt,
                note: null,
                createdAt: rows[1].createdAt,
                uploaderName: null,
            },
        ]);
        expect(findManyPhotos()).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { checklistItemId: ITEM_ID },
                orderBy: { createdAt: "asc" },
            })
        );
    });
});

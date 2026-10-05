import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock prisma agar tidak menulis ke hris_local maupun database lain.
vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

import { prisma } from "@/lib/prisma";
import {
    AppSettingsError,
    CLEANING_EVIDENCE_MAX_PHOTOS_KEY,
    DEFAULT_CLEANING_EVIDENCE_MAX_PHOTOS,
    DEFAULT_UPLOAD_LIMITS_MB,
    UPLOAD_LIMIT_MAX_MB,
    UPLOAD_LIMIT_MIN_MB,
    clampCleaningEvidenceMaxPhotos,
    clampUploadLimitMb,
    getAllUploadLimits,
    getCleaningEvidenceMaxPhotos,
    getUploadLimit,
    invalidateCleaningEvidenceMaxPhotosCache,
    invalidateUploadLimitCache,
    isUploadLimitKey,
    updateCleaningEvidenceMaxPhotos,
    updateUploadLimit,
} from "@/lib/services/appSettingsService";

const findUnique = () => prisma.appSetting.findUnique as Mock;
const findMany = () => prisma.appSetting.findMany as Mock;
const upsert = () => prisma.appSetting.upsert as Mock;

describe("appSettingsService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        invalidateUploadLimitCache();
        invalidateCleaningEvidenceMaxPhotosCache();
    });

    describe("isUploadLimitKey / clampUploadLimitMb", () => {
        it("mengenali kunci yang terdaftar dan menolak kunci asing", () => {
            expect(isUploadLimitKey("upload.news.maxMb")).toBe(true);
            expect(isUploadLimitKey("upload.cleaningEvidence.maxMb")).toBe(true);
            expect(isUploadLimitKey("upload.lain.maxMb")).toBe(false);
            expect(isUploadLimitKey(CLEANING_EVIDENCE_MAX_PHOTOS_KEY)).toBe(false);
        });

        it("menjepit nilai ke rentang 0,5–50 MB", () => {
            expect(clampUploadLimitMb(100)).toBe(UPLOAD_LIMIT_MAX_MB);
            expect(clampUploadLimitMb(0.1)).toBe(UPLOAD_LIMIT_MIN_MB);
            expect(clampUploadLimitMb(10)).toBe(10);
        });
    });

    describe("getUploadLimit", () => {
        it("mengambil nilai dari DB lalu memakai cache pada panggilan kedua", async () => {
            findUnique().mockResolvedValue({ key: "upload.news.maxMb", value: "8" });

            const first = await getUploadLimit("upload.news.maxMb");
            const second = await getUploadLimit("upload.news.maxMb");

            expect(first).toBe(8);
            expect(second).toBe(8);
            expect(findUnique()).toHaveBeenCalledTimes(1);
        });

        it("membaca ulang DB setelah cache di-invalidasi", async () => {
            findUnique()
                .mockResolvedValueOnce({ key: "upload.news.maxMb", value: "8" })
                .mockResolvedValueOnce({ key: "upload.news.maxMb", value: "9" });

            expect(await getUploadLimit("upload.news.maxMb")).toBe(8);
            invalidateUploadLimitCache("upload.news.maxMb");
            expect(await getUploadLimit("upload.news.maxMb")).toBe(9);
            expect(findUnique()).toHaveBeenCalledTimes(2);
        });

        it("fallback ke DEFAULTS bila baris belum ada", async () => {
            findUnique().mockResolvedValue(null);

            expect(await getUploadLimit("upload.bast.maxMb")).toBe(DEFAULT_UPLOAD_LIMITS_MB["upload.bast.maxMb"]);
        });

        it("fallback ke DEFAULTS bila DB gagal dibaca", async () => {
            findUnique().mockRejectedValue(new Error("koneksi putus"));

            expect(await getUploadLimit("upload.avatar.maxMb")).toBe(DEFAULT_UPLOAD_LIMITS_MB["upload.avatar.maxMb"]);
        });

        it("fallback ke DEFAULTS bila nilai tersimpan rusak", async () => {
            findUnique().mockResolvedValue({ key: "upload.avatar.maxMb", value: "rusak" });

            expect(await getUploadLimit("upload.avatar.maxMb")).toBe(DEFAULT_UPLOAD_LIMITS_MB["upload.avatar.maxMb"]);
        });
    });

    describe("getAllUploadLimits", () => {
        it("menggabungkan nilai DB dengan DEFAULTS beserta penanda sumber", async () => {
            findMany().mockResolvedValue([{ key: "upload.news.maxMb", value: "8" }]);

            const limits = await getAllUploadLimits();
            const news = limits.find((item) => item.key === "upload.news.maxMb");
            const bast = limits.find((item) => item.key === "upload.bast.maxMb");

            expect(news).toMatchObject({ valueMb: 8, source: "database" });
            expect(bast).toMatchObject({
                valueMb: DEFAULT_UPLOAD_LIMITS_MB["upload.bast.maxMb"],
                source: "default",
            });
        });

        it("mengembalikan semua DEFAULTS bila DB gagal dibaca", async () => {
            findMany().mockRejectedValue(new Error("koneksi putus"));

            const limits = await getAllUploadLimits();

            expect(limits.length).toBeGreaterThan(0);
            for (const item of limits) {
                expect(item.valueMb).toBe(DEFAULT_UPLOAD_LIMITS_MB[item.key]);
                expect(item.source).toBe("default");
            }
        });
    });

    describe("updateUploadLimit", () => {
        it("menyimpan nilai sebagai string dan meng-invalidasi cache", async () => {
            findUnique().mockResolvedValue({ key: "upload.news.maxMb", value: "8" });
            upsert().mockResolvedValue({ key: "upload.news.maxMb", value: "7" });

            expect(await getUploadLimit("upload.news.maxMb")).toBe(8);

            const updated = await updateUploadLimit("upload.news.maxMb", 7, "user-1");

            expect(updated).toEqual({ key: "upload.news.maxMb", valueMb: 7 });
            expect(upsert()).toHaveBeenCalledWith({
                where: { key: "upload.news.maxMb" },
                update: { value: "7", updatedByUserId: "user-1" },
                create: { key: "upload.news.maxMb", value: "7", updatedByUserId: "user-1" },
            });

            findUnique().mockResolvedValue({ key: "upload.news.maxMb", value: "7" });
            expect(await getUploadLimit("upload.news.maxMb")).toBe(7);
            expect(findUnique()).toHaveBeenCalledTimes(2);
        });

        it("menjepit nilai terlalu besar dan terlalu kecil", async () => {
            upsert().mockImplementation((args: { create: { value: string } }) =>
                Promise.resolve({ key: "upload.news.maxMb", value: args.create.value })
            );

            expect((await updateUploadLimit("upload.news.maxMb", 100, "user-1")).valueMb).toBe(50);
            expect((await updateUploadLimit("upload.news.maxMb", 0.1, "user-1")).valueMb).toBe(0.5);
        });

        it("menolak kunci yang tidak dikenal", async () => {
            await expect(updateUploadLimit("kunci.asing", 5, "user-1")).rejects.toThrow(AppSettingsError);
            expect(upsert()).not.toHaveBeenCalled();
        });

        it("menolak nilai yang bukan angka hingga", async () => {
            await expect(updateUploadLimit("upload.news.maxMb", NaN, "user-1")).rejects.toThrow(
                "Batas upload harus berupa angka dalam MB."
            );
            expect(upsert()).not.toHaveBeenCalled();
        });
    });

    describe("Tahap 1: kunci cleaning evidence (mock-murni, tanpa tulis hris_local)", () => {
        it("upload.cleaningEvidence.maxMb terdaftar dengan default 2 MB", async () => {
            expect(isUploadLimitKey("upload.cleaningEvidence.maxMb")).toBe(true);
            expect(DEFAULT_UPLOAD_LIMITS_MB["upload.cleaningEvidence.maxMb"]).toBe(2);

            findUnique().mockResolvedValue(null);
            expect(await getUploadLimit("upload.cleaningEvidence.maxMb")).toBe(2);
        });

        it("getAllUploadLimits memuat kunci evidence baru beserta sumbernya", async () => {
            findMany().mockResolvedValue([{ key: "upload.cleaningEvidence.maxMb", value: "2" }]);

            const limits = await getAllUploadLimits();
            const evidence = limits.find((item) => item.key === "upload.cleaningEvidence.maxMb");

            expect(evidence).toMatchObject({ valueMb: 2, source: "database" });
        });

        it("getCleaningEvidenceMaxPhotos fallback ke default 3 bila baris belum ada / rusak / DB gagal", async () => {
            findUnique().mockResolvedValue(null);
            expect(await getCleaningEvidenceMaxPhotos()).toBe(DEFAULT_CLEANING_EVIDENCE_MAX_PHOTOS);

            invalidateCleaningEvidenceMaxPhotosCache();
            findUnique().mockResolvedValue({ key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY, value: "rusak" });
            expect(await getCleaningEvidenceMaxPhotos()).toBe(DEFAULT_CLEANING_EVIDENCE_MAX_PHOTOS);

            invalidateCleaningEvidenceMaxPhotosCache();
            findUnique().mockRejectedValue(new Error("koneksi putus"));
            expect(await getCleaningEvidenceMaxPhotos()).toBe(3);
        });

        it("getCleaningEvidenceMaxPhotos membaca nilai DB dan memakai cache", async () => {
            findUnique().mockResolvedValue({ key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY, value: "5" });

            expect(await getCleaningEvidenceMaxPhotos()).toBe(5);
            expect(await getCleaningEvidenceMaxPhotos()).toBe(5);
            expect(findUnique()).toHaveBeenCalledTimes(1);
            expect(findUnique()).toHaveBeenCalledWith({ where: { key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY } });
        });

        it("clampCleaningEvidenceMaxPhotos menjepit ke 1–10 integer", () => {
            expect(clampCleaningEvidenceMaxPhotos(100)).toBe(10);
            expect(clampCleaningEvidenceMaxPhotos(0)).toBe(1);
            expect(clampCleaningEvidenceMaxPhotos(2.6)).toBe(3);
        });

        it("updateCleaningEvidenceMaxPhotos menyimpan string integer dan meng-invalidasi cache", async () => {
            upsert().mockImplementation((args: { create: { value: string } }) =>
                Promise.resolve({ key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY, value: args.create.value })
            );

            expect((await updateCleaningEvidenceMaxPhotos(100, "user-1")).value).toBe(10);
            expect(upsert()).toHaveBeenCalledWith({
                where: { key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY },
                update: { value: "10", updatedByUserId: "user-1" },
                create: { key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY, value: "10", updatedByUserId: "user-1" },
            });

            findUnique().mockResolvedValue({ key: CLEANING_EVIDENCE_MAX_PHOTOS_KEY, value: "10" });
            expect(await getCleaningEvidenceMaxPhotos()).toBe(10);
        });

        it("updateCleaningEvidenceMaxPhotos menolak nilai bukan angka", async () => {
            await expect(updateCleaningEvidenceMaxPhotos(NaN, "user-1")).rejects.toThrow(
                "Batas jumlah foto harus berupa angka."
            );
            expect(upsert()).not.toHaveBeenCalled();
        });
    });
});

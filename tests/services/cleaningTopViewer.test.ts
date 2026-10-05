import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        employee: { findUnique: vi.fn() },
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import {
    CLEANING_TOP_VIEWER_KEY,
    getCleaningTopViewerEmployeeId,
    getCleaningTopViewerInfo,
    invalidateCleaningTopViewerCache,
    isCleaningTopViewer,
    updateCleaningTopViewer,
} from "@/lib/services/appSettingsService";

const mockedAppSetting = vi.mocked(prisma.appSetting);
const mockedEmployee = vi.mocked(prisma.employee);

function gmSession() {
    return { employeeId: "ID-24050016" } as never;
}

beforeEach(() => {
    vi.clearAllMocks();
    invalidateCleaningTopViewerCache();
});

describe("cleaning.topViewer.employeeId (mock murni)", () => {
    it("get: null bila belum ditunjuk; info null; guard false", async () => {
        mockedAppSetting.findUnique.mockResolvedValue(null);
        await expect(getCleaningTopViewerEmployeeId()).resolves.toBeNull();
        await expect(getCleaningTopViewerInfo()).resolves.toEqual({
            employeeId: null,
            name: null,
            isActive: null,
        });
        await expect(isCleaningTopViewer(gmSession())).resolves.toBe(false);
        await expect(isCleaningTopViewer(null)).resolves.toBe(false);
    });

    it("get: nilai tersimpan + info nama/status; guard cocok persis", async () => {
        mockedAppSetting.findUnique.mockResolvedValue({
            key: CLEANING_TOP_VIEWER_KEY,
            value: "ID-24050016",
        } as never);
        mockedEmployee.findUnique.mockResolvedValue({
            employeeId: "ID-24050016",
            name: "General Manager",
            isActive: true,
        } as never);
        await expect(getCleaningTopViewerEmployeeId()).resolves.toBe("ID-24050016");
        await expect(getCleaningTopViewerInfo()).resolves.toEqual({
            employeeId: "ID-24050016",
            name: "General Manager",
            isActive: true,
        });
        await expect(isCleaningTopViewer(gmSession())).resolves.toBe(true);
        await expect(isCleaningTopViewer({ employeeId: "ID-999" } as never)).resolves.toBe(false);
    });

    it("update: tolak kosong-nonstring? kosong mengosongkan; tolak nonaktif/outsource", async () => {
        mockedAppSetting.upsert.mockResolvedValue({} as never);
        const cleared = await updateCleaningTopViewer("   ", "wig002-id");
        expect(cleared).toEqual({ key: CLEANING_TOP_VIEWER_KEY, employeeId: null });

        mockedEmployee.findUnique.mockResolvedValue(null);
        await expect(updateCleaningTopViewer("ID-XXX", "wig002-id")).rejects.toMatchObject({ statusCode: 422 });

        mockedEmployee.findUnique.mockResolvedValue({
            employeeId: "ID-24050016",
            isActive: false,
            userAccount: { id: "u-1" },
        } as never);
        await expect(updateCleaningTopViewer("ID-24050016", "wig002-id")).rejects.toMatchObject({ statusCode: 422 });
    });

    it("update: terima employee aktif internal; cache di-invalidate", async () => {
        mockedAppSetting.upsert.mockResolvedValue({} as never);
        mockedEmployee.findUnique.mockResolvedValue({
            employeeId: "ID-24050016",
            isActive: true,
            userAccount: { id: "u-1" },
        } as never);
        const result = await updateCleaningTopViewer("  ID-24050016 ", "wig002-id");
        expect(result).toEqual({ key: CLEANING_TOP_VIEWER_KEY, employeeId: "ID-24050016" });
        expect(mockedAppSetting.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { key: CLEANING_TOP_VIEWER_KEY },
                update: expect.objectContaining({ value: "ID-24050016", updatedByUserId: "wig002-id" }),
            })
        );
    });
});

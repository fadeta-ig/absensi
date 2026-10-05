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
    CLEANING_DEFAULT_REVIEWERS_KEY,
    getCleaningDefaultReviewers,
    invalidateCleaningDefaultReviewersCache,
    updateCleaningDefaultReviewers,
} from "@/lib/services/appSettingsService";

const mockedAppSetting = vi.mocked(prisma.appSetting);
const mockedEmployee = vi.mocked(prisma.employee);

function activeEmployee(id: string) {
    return { employeeId: id, isActive: true, userAccount: { id: `user-${id}` } } as never;
}

beforeEach(() => {
    vi.clearAllMocks();
    invalidateCleaningDefaultReviewersCache();
});

describe("cleaning.defaultReviewers (mock murni)", () => {
    it("get: null-null bila kosong/rusak", async () => {
        mockedAppSetting.findUnique.mockResolvedValue(null);
        await expect(getCleaningDefaultReviewers()).resolves.toEqual({
            inspectedByEmployeeId: null,
            knownByEmployeeId: null,
        });

        mockedAppSetting.findUnique.mockResolvedValue({ key: CLEANING_DEFAULT_REVIEWERS_KEY, value: "bukan-json" } as never);
        invalidateCleaningDefaultReviewersCache();
        await expect(getCleaningDefaultReviewers()).resolves.toEqual({
            inspectedByEmployeeId: null,
            knownByEmployeeId: null,
        });
    });

    it("get: baca pasangan tersimpan", async () => {
        mockedAppSetting.findUnique.mockResolvedValue({
            key: CLEANING_DEFAULT_REVIEWERS_KEY,
            value: JSON.stringify({ inspectedByEmployeeId: "ID-1", knownByEmployeeId: "ID-2" }),
        } as never);
        await expect(getCleaningDefaultReviewers()).resolves.toEqual({
            inspectedByEmployeeId: "ID-1",
            knownByEmployeeId: "ID-2",
        });
    });

    it("update: tolak kosong, sama orang, nonaktif/outsource", async () => {
        mockedEmployee.findUnique.mockResolvedValue(activeEmployee("ID-1"));
        await expect(updateCleaningDefaultReviewers("", "ID-2", "u")).rejects.toMatchObject({ statusCode: 400 });
        await expect(updateCleaningDefaultReviewers("ID-1", "ID-1", "u")).rejects.toMatchObject({ statusCode: 422 });

        mockedEmployee.findUnique.mockResolvedValue(null);
        await expect(updateCleaningDefaultReviewers("ID-1", "ID-2", "u")).rejects.toMatchObject({ statusCode: 422 });

        mockedEmployee.findUnique.mockResolvedValue({ employeeId: "ID-1", isActive: false, userAccount: { id: "u" } } as never);
        await expect(updateCleaningDefaultReviewers("ID-1", "ID-2", "u")).rejects.toMatchObject({ statusCode: 422 });

        mockedEmployee.findUnique.mockResolvedValue({ employeeId: "ID-1", isActive: true, userAccount: null } as never);
        await expect(updateCleaningDefaultReviewers("ID-1", "ID-2", "u")).rejects.toMatchObject({ statusCode: 422 });
    });

    it("update: simpan pasangan valid + invalidate cache", async () => {
        mockedEmployee.findUnique.mockImplementation((async (args: unknown) => {
            const id = (args as { where: { employeeId: string } }).where.employeeId;
            return activeEmployee(id);
        }) as never);
        mockedAppSetting.upsert.mockResolvedValue({} as never);
        const result = await updateCleaningDefaultReviewers("  ID-1 ", "ID-2", "wig002-id");
        expect(result).toEqual({
            key: CLEANING_DEFAULT_REVIEWERS_KEY,
            inspectedByEmployeeId: "ID-1",
            knownByEmployeeId: "ID-2",
        });
        expect(mockedAppSetting.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { key: CLEANING_DEFAULT_REVIEWERS_KEY },
                update: expect.objectContaining({ updatedByUserId: "wig002-id" }),
            })
        );
    });
});

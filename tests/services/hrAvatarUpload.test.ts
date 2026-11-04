import { beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn() },
        employee: { findUnique: vi.fn(), update: vi.fn() },
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import { AVATAR_STORAGE_ROOT, normalizeAvatarBuffer, setEmployeeAvatarByHr } from "@/lib/services/avatarService";
import { invalidateUploadLimitCache } from "@/lib/services/appSettingsService";

const mocked = vi.mocked(prisma, true);
const TEST_NIP = "TEST-HR-AVATAR";

beforeEach(() => {
    vi.resetAllMocks();
    invalidateUploadLimitCache();
    mocked.appSetting.findUnique.mockResolvedValue({ value: "10" } as never);
});

async function tinyPngDataUrl(): Promise<string> {
    const buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } })
        .png()
        .toBuffer();
    return `data:image/png;base64,${buffer.toString("base64")}`;
}

describe("setEmployeeAvatarByHr", () => {
    it("karyawan tidak ada → 404", async () => {
        mocked.employee.findUnique.mockResolvedValue(null);
        await expect(setEmployeeAvatarByHr("missing-uuid", null)).rejects.toMatchObject({
            name: "AvatarUploadError",
            statusCode: 404,
        });
    });

    it("null mengosongkan kedua kolom avatar", async () => {
        mocked.employee.findUnique.mockResolvedValue({ id: "emp-1", employeeId: TEST_NIP } as never);
        mocked.employee.update.mockResolvedValue({ id: "emp-1", employeeId: TEST_NIP, avatarUrl: null } as never);
        const out = await setEmployeeAvatarByHr("emp-1", null);
        expect(mocked.employee.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "emp-1" }, data: { avatarUrl: null, avatarPath: null } })
        );
        expect(out.avatarUrl).toBeNull();
    });

    it("bukan data-URL (mis. https://) ditolak 400", async () => {
        mocked.employee.findUnique.mockResolvedValue({ id: "emp-1", employeeId: TEST_NIP } as never);
        await expect(setEmployeeAvatarByHr("emp-1", "https://contoh.test/foto.png")).rejects.toMatchObject({
            name: "AvatarUploadError",
            statusCode: 400,
        });
        expect(mocked.employee.update).not.toHaveBeenCalled();
    });

    it("data-URL valid disimpan ke folder NIP + update DB (selalu JPEG)", async () => {
        mocked.employee.findUnique.mockResolvedValue({ id: "emp-1", employeeId: TEST_NIP } as never);
        mocked.employee.update.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
            id: "emp-1",
            employeeId: TEST_NIP,
            ...data,
        })) as never);
        try {
            const out = await setEmployeeAvatarByHr("emp-1", await tinyPngDataUrl());
            expect(out.avatarUrl).toMatch(/^\/api\/auth\/avatar\/.+\.jpg$/);
            expect(mocked.employee.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        avatarUrl: expect.stringMatching(/^\/api\/auth\/avatar\//),
                        avatarPath: expect.stringMatching(new RegExp(`^${TEST_NIP}/.+\\.jpg$`)),
                    }),
                })
            );
        } finally {
            await rm(join(AVATAR_STORAGE_ROOT, TEST_NIP), { recursive: true, force: true });
        }
    });

    it("normalisasi: keluaran JPEG ≤1024px", async () => {
        const big = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 9, g: 9, b: 9 } } })
            .png()
            .toBuffer();
        const out = await normalizeAvatarBuffer(big);
        expect(out.mime).toBe("image/jpeg");
        expect(out.buffer[0]).toBe(0xff);
        expect(out.buffer[1]).toBe(0xd8);
        const meta = await sharp(out.buffer).metadata();
        expect(meta.width).toBeLessThanOrEqual(1024);
        expect(meta.height).toBeLessThanOrEqual(1024);
    });
});

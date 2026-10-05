import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertNotProduction, assertSafeToWipe } from "../../prisma/seedSafety";

function mockDb(employees: number, users: number, attendance: number) {
    return {
        employee: { count: vi.fn().mockResolvedValue(employees) },
        userAccount: { count: vi.fn().mockResolvedValue(users) },
        attendanceRecord: { count: vi.fn().mockResolvedValue(attendance) },
    } as never;
}

describe("seedSafety (mock murni)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.unstubAllEnvs();
        vi.stubEnv("ALLOW_DESTRUCTIVE_SEED", "");
        vi.stubEnv("NODE_ENV", "test");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("menolak di production tanpa kecuali", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("ALLOW_DESTRUCTIVE_SEED", "1");
        await expect(assertSafeToWipe(mockDb(0, 0, 0), "seed.ts")).rejects.toThrow(/production/);
        expect(() => assertNotProduction("seedDev.ts")).toThrow(/production/);
    });

    it("mengizinkan database kosong (alur setup awal)", async () => {
        await expect(assertSafeToWipe(mockDb(0, 0, 0), "seed.ts")).resolves.toBeUndefined();
    });

    it("menolak database berisi data tanpa env eksplisit", async () => {
        await expect(assertSafeToWipe(mockDb(61, 65, 710), "seed.ts")).rejects.toThrow(
            /karyawan: 61, akun: 65, presensi: 710/
        );
    });

    it("mengizinkan database berisi data bila ALLOW_DESTRUCTIVE_SEED=1", async () => {
        vi.stubEnv("ALLOW_DESTRUCTIVE_SEED", "1");
        await expect(assertSafeToWipe(mockDb(61, 65, 710), "seed.ts")).resolves.toBeUndefined();
    });
});

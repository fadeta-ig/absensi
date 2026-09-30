import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        employee: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
        userAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
        attendanceRecord: { count: vi.fn() },
        attendanceCorrection: { count: vi.fn() },
        leaveRequest: { count: vi.fn() },
        overtimeRequest: { count: vi.fn() },
        employeeDocument: { count: vi.fn() },
        shiftAssignment: { count: vi.fn() },
        asset: { count: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn(),
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
    },
}));
vi.mock("@/lib/auth", () => ({}));

import { prisma } from "@/lib/prisma";
import {
    canFixEmployeeNip,
    previewNipFixImpact,
    fixEmployeeNip,
    NipFixError,
} from "@/lib/services/employeeNipService";

const mocked = vi.mocked(prisma, true);

const WIG_SESSION = {
    userId: "wig002-id",
    username: "WIG001",
    permissions: ["hr.manage"],
} as never;

const OTHER_SESSION = {
    userId: "other-id",
    username: "HR001",
    permissions: ["hr.manage"],
} as never;

const ACTOR = { userId: "wig002-id", identifier: "WIG001", name: "Admin", role: "hr", type: "USER" } as const;

function mockCounts(value = 0) {
    mocked.attendanceRecord.count.mockResolvedValue(value);
    mocked.attendanceCorrection.count.mockResolvedValue(value);
    mocked.leaveRequest.count.mockResolvedValue(value);
    mocked.overtimeRequest.count.mockResolvedValue(value);
    mocked.employeeDocument.count.mockResolvedValue(value);
    mocked.shiftAssignment.count.mockResolvedValue(value);
    mocked.employee.count.mockResolvedValue(value);
    mocked.asset.count.mockResolvedValue(value);
}

beforeEach(() => {
    vi.clearAllMocks();
    mockCounts(0);
    mocked.employee.findUnique.mockImplementation((async (args: unknown) => {
        const where = (args as { where?: Record<string, unknown> }).where ?? {};
        if (typeof where.id === "string") {
            return { id: "uuid-1", employeeId: "ID-001", name: "Uji" };
        }
        return null;
    }) as never);
    mocked.userAccount.findUnique.mockResolvedValue(null);
});

describe("canFixEmployeeNip", () => {
    it("hanya WIG001 + hr.manage", () => {
        expect(canFixEmployeeNip(WIG_SESSION)).toBe(true);
        expect(canFixEmployeeNip(OTHER_SESSION)).toBe(false);
        expect(canFixEmployeeNip(null)).toBe(false);
    });
});

describe("previewNipFixImpact", () => {
    it("menolak format NIP buruk dan NIP sama", async () => {
        await expect(previewNipFixImpact("uuid-1", "ab")).rejects.toBeInstanceOf(NipFixError);
        await expect(previewNipFixImpact("uuid-1", "ID 001!")).rejects.toBeInstanceOf(NipFixError);
        await expect(previewNipFixImpact("uuid-1", "ID-001")).rejects.toMatchObject({ statusCode: 422 });
    });

    it("404 bila karyawan tidak ada; 409 bila target dipakai", async () => {
        mocked.employee.findUnique.mockImplementationOnce((async () => null) as never);
        await expect(previewNipFixImpact("uuid-x", "ID-002")).rejects.toMatchObject({ statusCode: 404 });

        mocked.userAccount.findUnique.mockResolvedValue({ id: "u-x", employeeId: "ID-999" } as never);
        const impact = await previewNipFixImpact("uuid-1", "ID-002");
        expect(impact.usernameClash).toBe(true);
        expect(impact.blockedReasons).toEqual([]);
    });

    it("menandai blocked bila ada pending", async () => {
        mocked.attendanceCorrection.count.mockResolvedValue(2);
        mocked.leaveRequest.count.mockResolvedValue(1);
        const impact = await previewNipFixImpact("uuid-1", "ID-002");
        expect(impact.blockedReasons.length).toBeGreaterThan(0);
    });
});

describe("fixEmployeeNip", () => {
    it("403 bila bukan WIG001", async () => {
        await expect(fixEmployeeNip("uuid-1", "ID-002", OTHER_SESSION, ACTOR)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("menjalankan transaksi + rename dilewati bila folder tak ada", async () => {
        mocked.$transaction.mockImplementation((async (cb: (tx: never) => Promise<unknown>) => {
            const tx = {
                $queryRaw: vi.fn().mockResolvedValue([]),
                employee: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
                userAccount: { findUnique: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({}) },
                attendanceCorrection: { count: vi.fn().mockResolvedValue(0) },
                leaveRequest: { count: vi.fn().mockResolvedValue(0) },
                overtimeRequest: { count: vi.fn().mockResolvedValue(0) },
                $executeRaw: vi.fn().mockResolvedValue(0),
                auditLog: { create: vi.fn().mockResolvedValue({}) },
            } as never;
            return cb(tx);
        }) as never);
        const result = await fixEmployeeNip("uuid-1", "ID-002", WIG_SESSION, ACTOR);
        expect(result).toEqual({ oldEmployeeId: "ID-001", newEmployeeId: "ID-002" });
        expect(mocked.$transaction).toHaveBeenCalledOnce();
    });
});

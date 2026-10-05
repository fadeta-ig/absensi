import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningRoom: { findUnique: vi.fn(), findMany: vi.fn() },
        cleaningMonthlyApproval: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), createMany: vi.fn() },
        auditLog: { create: vi.fn() },
        appSetting: { findUnique: vi.fn() },
        employee: { findFirst: vi.fn() },
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import { ensureMonthlyApproval, openAllMonthlyApprovals } from "@/lib/services/cleaningApprovalService";
import { makeWig002Session } from "../fixtures/cleaning";

const mocked = vi.mocked(prisma, true);

function mockDefaults(inspectedBy = "ID-1", knownBy = "ID-2") {
    mocked.appSetting.findUnique.mockResolvedValue({
        key: "x",
        value: JSON.stringify({ inspectedByEmployeeId: inspectedBy, knownByEmployeeId: knownBy }),
    } as never);
    mocked.employee.findFirst.mockImplementation((async (args: unknown) => {
        const where = (args as { where?: { OR?: unknown } }).where;
        void where;
        return { employeeId: "x", userAccount: { isActive: true } };
    }) as never);
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("ensureMonthlyApproval + openAllMonthlyApprovals (mock murni)", () => {
    it("ensure: kembalikan existing tanpa tulis", async () => {
        mocked.cleaningMonthlyApproval.findUnique.mockResolvedValue({ id: "appr-1" } as never);
        const result = await ensureMonthlyApproval(prisma, "room-1", "2026-10");
        expect(result).toEqual({ approval: { id: "appr-1" }, isNew: false });
        expect(mocked.cleaningMonthlyApproval.create).not.toHaveBeenCalled();
    });

    it("ensure: 422 bila default belum ditetapkan", async () => {
        mocked.cleaningMonthlyApproval.findUnique.mockResolvedValue(null);
        mocked.cleaningRoom.findUnique.mockResolvedValue({ id: "room-1", name: "R1", isActive: true } as never);
        mocked.appSetting.findUnique.mockResolvedValue(null);
        await expect(ensureMonthlyApproval(prisma, "room-1", "2026-10")).rejects.toMatchObject({ statusCode: 422 });
    });

    it("ensure: buat dari default + audit", async () => {
        mocked.cleaningMonthlyApproval.findUnique.mockResolvedValue(null);
        mocked.cleaningRoom.findUnique.mockResolvedValue({ id: "room-1", name: "R1", isActive: true } as never);
        mockDefaults();
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "ID-1" } as never);
        mocked.cleaningMonthlyApproval.create.mockResolvedValue({ id: "new-1" } as never);
        mocked.auditLog.create.mockResolvedValue({} as never);
        const result = await ensureMonthlyApproval(prisma, "room-1", "2026-10", {
            userId: "u",
            identifier: "WIG002",
        });
        expect(result.isNew).toBe(true);
        expect(mocked.cleaningMonthlyApproval.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    roomId: "room-1",
                    monthWib: "2026-10",
                    inspectedByEmployeeId: expect.any(String),
                }),
            })
        );
    });

    it("open-all: hitung created vs skipped", async () => {
        mocked.cleaningRoom.findMany.mockResolvedValue([
            { id: "r1", name: "R1" },
            { id: "r2", name: "R2" },
        ] as never);
        mocked.cleaningMonthlyApproval.findMany.mockResolvedValue([{ roomId: "r1" }] as never);
        mockDefaults();
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "ID-1" } as never);
        mocked.cleaningMonthlyApproval.createMany.mockResolvedValue({ count: 1 });
        mocked.auditLog.create.mockResolvedValue({} as never);
        const result = await openAllMonthlyApprovals(makeWig002Session(), "2026-10");
        expect(result.created).toBe(1);
        expect(result.skipped).toBe(1);
        expect(mocked.cleaningMonthlyApproval.createMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.any(Array) })
        );
    });
});

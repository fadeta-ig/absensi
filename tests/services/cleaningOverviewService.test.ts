import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningRoom: { findMany: vi.fn() },
        cleaningDailyChecklist: { findMany: vi.fn() },
        cleaningDailyParaf: { findMany: vi.fn() },
        cleaningMonthlyApproval: { findMany: vi.fn() },
        cleaningHoliday: { findMany: vi.fn() },
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import { getTopViewerOverview } from "@/lib/services/cleaningOverviewService";

const mocked = vi.mocked(prisma, true);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("getTopViewerOverview (mock murni)", () => {
    it("tolak format bulan buruk", async () => {
        await expect(getTopViewerOverview("2026-13")).rejects.toMatchObject({ statusCode: 400 });
        await expect(getTopViewerOverview("oktober")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("agregat checklist + paraf + reviewer + TTD per ruangan", async () => {
        mocked.cleaningRoom.findMany.mockResolvedValue([{ id: "room-1", name: "Ruang Direksi" }] as never);
        mocked.cleaningDailyChecklist.findMany.mockResolvedValue([
            { roomId: "room-1", wibDate: "2026-10-01", items: [{ isActive: true, isComplete: true }] },
            { roomId: "room-1", wibDate: "2026-10-01", items: [{ isActive: true, isComplete: false }] },
        ] as never);
        mocked.cleaningDailyParaf.findMany.mockResolvedValue([
            { roomId: "room-1", wibDate: "2026-10-01", signerRole: "INSPECTED_BY", signerEmployeeId: "EMP001", signerNameSnapshot: "Agus", status: "TERLAMBAT" },
            { roomId: "room-1", wibDate: "2026-10-01", signerRole: "KNOWN_BY", signerEmployeeId: "EMP002", signerNameSnapshot: "Dimas", status: "TEPAT" },
        ] as never);
        mocked.cleaningMonthlyApproval.findMany.mockResolvedValue([
            {
                roomId: "room-1",
                inspectedByEmployeeId: "EMP001",
                knownByEmployeeId: "EMP002",
                inspectedByEmployee: { employeeId: "EMP001", name: "Agus" },
                knownByEmployee: { employeeId: "EMP002", name: "Dimas" },
                signatures: [{ role: "INSPECTED_BY" }],
            },
        ] as never);
        mocked.cleaningHoliday.findMany.mockResolvedValue([]);

        const result = await getTopViewerOverview("2026-10");
        expect(result.monthWib).toBe("2026-10");
        expect(result.rooms).toHaveLength(1);
        const room = result.rooms[0];
        expect(room.checklist).toEqual({ total: 2, selesai: 1, belum: 1, percent: 50 });
        expect(room.paraf.tepat).toBe(1);
        expect(room.paraf.terlambat).toBe(1);
        expect(room.paraf.missing).toBe(0);
        expect(room.paraf.lateBySigner).toEqual([{ employeeId: "EMP001", name: "Agus", terlambat: 1, tepat: 0 }]);
        expect(room.reviewers?.inspectedByName).toBe("Agus");
        expect(room.signatures?.derivedStatus).toBe("PARTIALLY_SIGNED");
    });
});

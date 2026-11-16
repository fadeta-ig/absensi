import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    employeeFindUnique: vi.fn(),
    leaveFindMany: vi.fn(),
    leaveFindFirst: vi.fn(),
    leaveCreate: vi.fn(),
    resolveShiftsForRange: vi.fn(),
    countWorkingDaysForEmployee: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        employee: { findUnique: mocks.employeeFindUnique },
        leaveRequest: {
            findMany: mocks.leaveFindMany,
            findFirst: mocks.leaveFindFirst,
            create: mocks.leaveCreate,
        },
        $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    },
}));

vi.mock("@/lib/services/shiftAssignmentService", () => ({
    countWorkingDaysForEmployee: mocks.countWorkingDaysForEmployee,
    resolveShiftsForRange: mocks.resolveShiftsForRange,
}));

import {
    createLeaveRequestsBatch,
    LeaveValidationError,
} from "@/lib/services/leaveService";

function mockHealthyEmployee() {
    mocks.employeeFindUnique.mockResolvedValue({ totalLeave: 12, usedLeave: 0 });
    mocks.leaveFindMany.mockResolvedValue([]);
    mocks.leaveFindFirst.mockResolvedValue(null);
    // Rentang dinamis [min,max] tanpa libur (shift null + bukan Minggu dijamin
    // oleh tanggal uji yang dipilih; Minggu tetap terdeteksi off).
    mocks.resolveShiftsForRange.mockImplementation(
        async (_prisma: unknown, _emp: string, min: string, max: string) => {
            const out: Array<{ date: string; shift: null }> = [];
            let cur = min;
            for (let i = 0; i < 400; i++) {
                out.push({ date: cur, shift: null });
                if (cur === max) break;
                const d = new Date(`${cur}T00:00:00Z`);
                d.setUTCDate(d.getUTCDate() + 1);
                cur = d.toISOString().slice(0, 10);
            }
            return out;
        }
    );
    mocks.countWorkingDaysForEmployee.mockResolvedValue(1);
    mocks.leaveCreate.mockImplementation(async (args: {
        data: Record<string, unknown>;
    }) => ({
        id: `lr-${args.data["startDate"]}`,
        ...args.data,
        attachment: null,
        createdAt: new Date(),
    }));
}

describe("Leave anchor window (annual 30 hari inklusif dari tanggal pilihan)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockHealthyEmployee();
    });

    it("menerima tanggal dalam jendela patokan 2026-11-16 s/d 2026-12-15", async () => {
        const rows = await createLeaveRequestsBatch(
            {
                employeeId: "EMP001",
                type: "annual",
                dates: ["2026-11-16", "2026-11-17"],
                reason: "Liburan",
                status: "pending",
                anchorDate: "2026-11-16",
            },
            { todayWib: "2026-11-11" }
        );
        expect(rows).toHaveLength(2);
        expect(rows[0].startDate).toBe("2026-11-16");
    });

    it("menolak tanggal sebelum patokan (lock sebelumnya)", async () => {
        await expect(
            createLeaveRequestsBatch(
                {
                    employeeId: "EMP001",
                    type: "annual",
                    dates: ["2026-11-15"],
                    reason: "Liburan",
                    status: "pending",
                    anchorDate: "2026-11-16",
                },
                { todayWib: "2026-11-11" }
            )
        ).rejects.toThrowError(LeaveValidationError);
    });

    it("menolak tanggal setelah patokan+29 (2026-12-16)", async () => {
        await expect(
            createLeaveRequestsBatch(
                {
                    employeeId: "EMP001",
                    type: "annual",
                    dates: ["2026-12-16"],
                    reason: "Liburan",
                    status: "pending",
                    anchorDate: "2026-11-16",
                },
                { todayWib: "2026-11-11" }
            )
        ).rejects.toThrowError(/jendela patokan 2026-11-16 s\/d 2026-12-15/);
    });

    it("menolak patokan hari ini/masa lalu (minimal H+1)", async () => {
        await expect(
            createLeaveRequestsBatch(
                {
                    employeeId: "EMP001",
                    type: "annual",
                    dates: ["2026-11-11"],
                    reason: "Liburan",
                    status: "pending",
                    anchorDate: "2026-11-11",
                },
                { todayWib: "2026-11-11" }
            )
        ).rejects.toThrowError(/minimal .*H\+1/);
    });

    it("sick bebas dari patokan: tanggal jauh (2027-03-02) diterima, masa lalu ditolak", async () => {
        const rows = await createLeaveRequestsBatch(
            {
                employeeId: "EMP001",
                type: "sick",
                dates: ["2027-03-02"],
                reason: "Sakit",
                status: "pending",
            },
            { todayWib: "2026-11-11" }
        );
        expect(rows).toHaveLength(1);

        await expect(
            createLeaveRequestsBatch(
                {
                    employeeId: "EMP001",
                    type: "personal",
                    dates: ["2026-11-10"],
                    reason: "Pribadi",
                    status: "pending",
                },
                { todayWib: "2026-11-11" }
            )
        ).rejects.toThrowError(/sudah lewat/);
    });
});

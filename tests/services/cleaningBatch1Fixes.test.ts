import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    CLEANING_IDS,
    makeEmployeeSession,
    makeRoom,
    makeWig002Session,
    VALID_PNG_SIGNATURE,
} from "../fixtures/cleaning";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningRoom: { findUnique: vi.fn() },
        cleaningHoliday: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
        cleaningDailyChecklist: { findUnique: vi.fn(), findMany: vi.fn() },
        cleaningMonthlyApproval: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
        cleaningDailyParaf: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
        cleaningEvidencePhoto: { count: vi.fn(), create: vi.fn() },
        cleaningApprovalIdempotency: { findUnique: vi.fn(), create: vi.fn() },
        cleaningMonthlyApprovalSignature: { create: vi.fn() },
        employee: { findFirst: vi.fn(), findMany: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn(),
    },
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
    getCleaningPdfExportData,
    signApprovalPeriod,
} from "@/lib/services/cleaningApprovalService";
import {
    checkEvidenceVerificationStatus,
} from "@/lib/services/cleaningEvidenceService";
import {
    createCleaningHoliday,
    createCleaningHolidayRange,
    signDailyParaf,
} from "@/lib/services/cleaningParafService";

function mockTx(overrides: Record<string, unknown> = {}) {
    const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: "approval-1" }]),
        cleaningRoom: { findUnique: vi.fn() },
        cleaningHoliday: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn() },
        cleaningMonthlyApproval: { findUnique: vi.fn() },
        cleaningDailyChecklist: { findUnique: vi.fn() },
        employee: { findFirst: vi.fn() },
        cleaningDailyParaf: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        cleaningApprovalIdempotency: { create: vi.fn() },
        cleaningMonthlyApprovalSignature: { create: vi.fn() },
        auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
        ...overrides,
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: (txClient: never) => Promise<unknown>) => {
        return callback(tx as never);
    });
    return tx;
}

describe("Batch 1 — A1 PDF hanya reviewer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("menolak 403 karyawan yang bukan reviewer ruangan-bulan itu", async () => {
        const staff = makeEmployeeSession({ employeeId: "EMP999" });
        vi.mocked(prisma.cleaningMonthlyApproval.findFirst).mockResolvedValue(null);

        await expect(getCleaningPdfExportData(staff, CLEANING_IDS.room, "2026-09")).rejects.toMatchObject({
            statusCode: 403,
        });
    });
});

describe("Batch 1 — A2 kunci baris FOR UPDATE", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("mengunci baris approval di dalam transaksi sebelum cek duplikat", async () => {
        const empSession = makeEmployeeSession({ employeeId: "EMP999" });
        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.cleaningMonthlyApproval.findUnique).mockResolvedValue({ monthWib: "2026-09" } as never);
        const queryRaw = vi.fn().mockResolvedValue([{ id: "approval-1" }]);
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => {
            return callback({
                $queryRaw: queryRaw,
                employee: {
                    findFirst: vi.fn().mockResolvedValue({
                        employeeId: "EMP999",
                        name: "Wrong Emp",
                        isActive: true,
                        userAccount: { isActive: true },
                    }),
                },
                cleaningMonthlyApproval: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: "approval-1",
                        roomId: CLEANING_IDS.room,
                        monthWib: "2026-09",
                        inspectedByEmployeeId: "EMP001",
                        knownByEmployeeId: "EMP002",
                        signatures: [],
                    }),
                },
            } as never);
        });

        await expect(
            signApprovalPeriod(empSession, {
                approvalId: "approval-1",
                role: "INSPECTED_BY",
                signaturePayload: VALID_PNG_SIGNATURE,
            })
        ).rejects.toThrow("Anda tidak ditugaskan untuk menandatangani peran ini.");
        expect(queryRaw).toHaveBeenCalled();
    });
});

describe("Batch 1 — A3 flag foto susulan", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("needsReverify true bila tanggal sudah diparaf", async () => {
        vi.mocked(prisma.cleaningDailyParaf.findFirst).mockResolvedValue({ id: "paraf-1" } as never);
        vi.mocked(prisma.cleaningMonthlyApproval.findFirst).mockResolvedValue(null);

        const status = await checkEvidenceVerificationStatus(CLEANING_IDS.room, "2026-09-21");
        expect(status).toEqual({ parafExists: true, signedExists: false, needsReverify: true });
    });

    it("needsReverify true bila bulan sudah ditandatangani", async () => {
        vi.mocked(prisma.cleaningDailyParaf.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.cleaningMonthlyApproval.findFirst).mockResolvedValue({
            signatures: [{ id: "sig-1" }],
        } as never);

        const status = await checkEvidenceVerificationStatus(CLEANING_IDS.room, "2026-09-21");
        expect(status).toEqual({ parafExists: false, signedExists: true, needsReverify: true });
    });

    it("needsReverify false bila belum ada paraf maupun TTD", async () => {
        vi.mocked(prisma.cleaningDailyParaf.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.cleaningMonthlyApproval.findFirst).mockResolvedValue(null);

        const status = await checkEvidenceVerificationStatus(CLEANING_IDS.room, "2026-09-21");
        expect(status).toEqual({ parafExists: false, signedExists: false, needsReverify: false });
    });
});

describe("Batch 1 — A4 tolak libur yang sudah diparaf", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("single 409 bila tanggal sudah diparaf", async () => {
        const session = makeWig002Session();
        const tx = mockTx();
        tx.cleaningDailyParaf.findFirst.mockResolvedValue({ id: "paraf-1" });

        await expect(
            createCleaningHoliday(session, { wibDate: "2026-09-21", description: "Libur dadakan" })
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(tx.cleaningHoliday.create).not.toHaveBeenCalled();
    });

    it("range 409 menyebut tanggal konflik tanpa membuat baris", async () => {
        const session = makeWig002Session();
        const tx = mockTx();
        tx.cleaningHoliday.findMany.mockResolvedValue([]);
        tx.cleaningDailyParaf.findMany.mockResolvedValue([{ wibDate: "2026-12-25" }]);

        await expect(
            createCleaningHolidayRange(session, {
                startDate: "2026-12-24",
                endDate: "2026-12-26",
                description: "Libur bersama",
            })
        ).rejects.toThrow(/2026-12-25/);
        expect(tx.cleaningHoliday.create).not.toHaveBeenCalled();
    });
});

describe("Batch 1 — A5 tolak paraf tanggal depan", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("422 untuk wibDate jauh di masa depan tanpa menyentuh DB", async () => {
        await expect(
            signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: "2999-01-05", signerEmployeeId: "EMP001" })
        ).rejects.toMatchObject({ statusCode: 422 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("Batch 1 — A6 audit catat operator WIG002", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("audit menyimpan operator + penandatangan saat proksi", async () => {
        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
        const tx = mockTx();
        tx.cleaningRoom.findUnique.mockResolvedValue(makeRoom());
        tx.cleaningHoliday.findUnique.mockResolvedValue(null);
        tx.cleaningMonthlyApproval.findUnique.mockResolvedValue({
            inspectedByEmployeeId: "EMP001",
            knownByEmployeeId: "EMP002",
        });
        tx.cleaningDailyChecklist.findUnique.mockResolvedValue({
            id: "cl-1",
            items: [{ isActive: true, isComplete: true }],
        });
        tx.employee.findFirst.mockResolvedValue({ employeeId: "EMP001", name: "Atasan Satu" });
        tx.cleaningDailyParaf.findFirst.mockResolvedValue(null);
        tx.cleaningDailyParaf.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
            id: "paraf-baru",
            signedAt: new Date(),
            ...args.data,
        }));

        const result = await signDailyParaf({
            roomId: CLEANING_IDS.room,
            wibDate: "2026-01-05",
            signerEmployeeId: "EMP001",
            operator: { userId: "op-1", username: "WIG002", name: "Admin GA" },
        });

        expect(result.success).toBe(true);
        expect(tx.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: "SIGN_CLEANING_DAILY_PARAF",
                    actorUserId: "op-1",
                    actorIdentifier: "WIG002 untuk EMP001",
                }),
            })
        );
    });

    it("audit tetap anonim operator bila paraf mandiri", async () => {
        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
        const tx = mockTx();
        tx.cleaningRoom.findUnique.mockResolvedValue(makeRoom());
        tx.cleaningHoliday.findUnique.mockResolvedValue(null);
        tx.cleaningMonthlyApproval.findUnique.mockResolvedValue({
            inspectedByEmployeeId: "EMP001",
            knownByEmployeeId: "EMP002",
        });
        tx.cleaningDailyChecklist.findUnique.mockResolvedValue({
            id: "cl-1",
            items: [{ isActive: true, isComplete: true }],
        });
        tx.employee.findFirst.mockResolvedValue({ employeeId: "EMP001", name: "Atasan Satu" });
        tx.cleaningDailyParaf.findFirst.mockResolvedValue(null);
        tx.cleaningDailyParaf.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
            id: "paraf-baru",
            signedAt: new Date(),
            ...args.data,
        }));

        await signDailyParaf({
            roomId: CLEANING_IDS.room,
            wibDate: "2026-01-05",
            signerEmployeeId: "EMP001",
        });

        expect(tx.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    actorUserId: null,
                    actorIdentifier: "EMP001",
                }),
            })
        );
    });
});

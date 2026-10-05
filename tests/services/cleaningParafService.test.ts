import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLEANING_IDS, makeRoom } from "../fixtures/cleaning";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningRoom: { findUnique: vi.fn() },
        cleaningHoliday: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
        cleaningDailyChecklist: { findUnique: vi.fn() },
        cleaningMonthlyApproval: { findUnique: vi.fn() },
        cleaningDailyParaf: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
        cleaningApprovalIdempotency: { findUnique: vi.fn(), create: vi.fn() },
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
    CLEANING_DAILY_PARAF_SCOPE,
    getParafStatus,
    isWeekendWibDate,
    signDailyParaf,
} from "@/lib/services/cleaningParafService";
import { CleaningError } from "@/lib/services/cleaningService";

const MONDAY = "2026-09-21";
const SUNDAY = "2026-09-20";
const PAST_MONDAY = "2026-01-05";

function mockTx(overrides: Record<string, unknown> = {}) {
    const tx = {
        cleaningRoom: { findUnique: vi.fn() },
        cleaningHoliday: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
        cleaningMonthlyApproval: { findUnique: vi.fn() },
        cleaningDailyChecklist: { findUnique: vi.fn() },
        employee: { findFirst: vi.fn() },
        cleaningDailyParaf: { findFirst: vi.fn(), create: vi.fn() },
        cleaningApprovalIdempotency: { create: vi.fn() },
        auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
        ...overrides,
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: (txClient: typeof prisma) => Promise<unknown>) => {
        return callback(tx as never);
    });
    return tx as unknown as {
        cleaningRoom: { findUnique: ReturnType<typeof vi.fn> };
        cleaningHoliday: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
        cleaningMonthlyApproval: { findUnique: ReturnType<typeof vi.fn> };
        cleaningDailyChecklist: { findUnique: ReturnType<typeof vi.fn> };
        employee: { findFirst: ReturnType<typeof vi.fn> };
        cleaningDailyParaf: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
        cleaningApprovalIdempotency: { create: ReturnType<typeof vi.fn> };
        auditLog: { create: ReturnType<typeof vi.fn> };
    };
}

describe("cleaningParafService (mock murni)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.employee.findMany).mockResolvedValue([]);
    });
    it("mengenal akhir pekan sebagai bebas paraf", () => {
        expect(isWeekendWibDate(SUNDAY)).toBe(true);
        expect(isWeekendWibDate("2026-09-19")).toBe(true);
        expect(isWeekendWibDate(MONDAY)).toBe(false);
    });

    it("getParafStatus mengembalikan kebutuhan paraf + persen checklist", async () => {
        vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue(makeRoom() as never);
        vi.mocked(prisma.cleaningHoliday.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.cleaningDailyChecklist.findUnique).mockResolvedValue({
            id: "cl-1",
            items: [
                { isActive: true, isComplete: true },
                { isActive: true, isComplete: false },
                { isActive: false, isComplete: false },
            ],
        } as never);
        vi.mocked(prisma.cleaningMonthlyApproval.findUnique).mockResolvedValue({
            inspectedByEmployeeId: "EMP001",
            knownByEmployeeId: "EMP002",
        } as never);
        vi.mocked(prisma.employee.findMany).mockResolvedValue([
            { employeeId: "EMP001", name: "Atasan Satu" },
            { employeeId: "EMP002", name: "Atasan Dua" },
        ] as never);
        vi.mocked(prisma.cleaningDailyParaf.findMany).mockResolvedValue([
            {
                id: "paraf-1",
                signerRole: "INSPECTED_BY",
                signerEmployeeId: "EMP001",
                signerNameSnapshot: "Atasan Satu",
                signedAt: new Date("2026-09-21T02:00:00Z"),
                status: "TEPAT",
            },
        ] as never);

        const status = await getParafStatus(CLEANING_IDS.room, MONDAY);

        expect(status.isFree).toBe(false);
        expect(status.checklist.percent).toBe(50);
        expect(status.checklist.isComplete).toBe(false);
        expect(status.missingRoles).toEqual(["KNOWN_BY"]);
        expect(status.reviewers?.inspectedByEmployeeId).toBe("EMP001");
        expect(status.reviewers?.inspectedByName).toBe("Atasan Satu");
        expect(status.reviewers?.knownByName).toBe("Atasan Dua");
    });

    it("getParafStatus menandai libur WIG002 sebagai bebas paraf", async () => {
        vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue(makeRoom() as never);
        vi.mocked(prisma.cleaningHoliday.findUnique).mockResolvedValue({ description: "Libur nasional" } as never);
        vi.mocked(prisma.cleaningDailyChecklist.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.cleaningMonthlyApproval.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.cleaningDailyParaf.findMany).mockResolvedValue([]);

        const status = await getParafStatus(CLEANING_IDS.room, MONDAY);

        expect(status.isHoliday).toBe(true);
        expect(status.isFree).toBe(true);
        expect(status.holidayDescription).toBe("Libur nasional");
    });

    it("menolak paraf pada akhir pekan 422", async () => {
        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
        const tx = mockTx();
        tx.cleaningRoom.findUnique.mockResolvedValue(makeRoom());

        await expect(
            signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: SUNDAY, signerEmployeeId: "EMP001" })
        ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("menolak paraf pada hari libur 422", async () => {
        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
        const tx = mockTx();
        tx.cleaningRoom.findUnique.mockResolvedValue(makeRoom());
        tx.cleaningHoliday.findUnique.mockResolvedValue({ description: "Cuti bersama" });

        await expect(
            signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: MONDAY, signerEmployeeId: "EMP001" })
        ).rejects.toThrow(/hari libur/i);
    });

    it("menolak bila bukan reviewer bulan berjalan 403", async () => {
        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
        const tx = mockTx();
        tx.cleaningRoom.findUnique.mockResolvedValue(makeRoom());
        tx.cleaningHoliday.findUnique.mockResolvedValue(null);
        tx.cleaningMonthlyApproval.findUnique.mockResolvedValue({
            inspectedByEmployeeId: "EMP001",
            knownByEmployeeId: "EMP002",
        });

        await expect(
            signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: MONDAY, signerEmployeeId: "EMP999" })
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("menolak bila checklist belum 100% 409", async () => {
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
            items: [
                { isActive: true, isComplete: true },
                { isActive: true, isComplete: false },
            ],
        });

        await expect(
            signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: MONDAY, signerEmployeeId: "EMP001" })
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("menolak duplikat paraf per peran 409", async () => {
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
        tx.cleaningDailyParaf.findFirst.mockResolvedValue({ id: "existing" });

        await expect(
            signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: MONDAY, signerEmployeeId: "EMP001" })
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("memetakan P2002 menjadi 409", async () => {
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
        tx.cleaningDailyParaf.create.mockRejectedValue({ code: "P2002" });

        await expect(
            signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: MONDAY, signerEmployeeId: "EMP001" })
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("menandai TERLAMBAT bila lewat tengah malam WIB dan mencatat audit + idempotency", async () => {
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
            wibDate: PAST_MONDAY,
            signerEmployeeId: "EMP001",
            idempotencyKey: "kunci-123",
        });

        expect(result.success).toBe(true);
        expect(result.status).toBe("TERLAMBAT");
        expect(result.isLate).toBe(true);
        expect(result.role).toBe("INSPECTED_BY");
        expect(tx.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: "SIGN_CLEANING_DAILY_PARAF" }),
            })
        );
        expect(tx.cleaningApprovalIdempotency.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    actorId: "EMP001",
                    endpointScope: CLEANING_DAILY_PARAF_SCOPE,
                    idempotencyKey: "kunci-123",
                }),
            })
        );
    });

    it("mengembalikan hasil idempotency yang sama tanpa transaksi ulang", async () => {
        const cached = {
            success: true,
            parafId: "paraf-cached",
            roomId: CLEANING_IDS.room,
            wibDate: MONDAY,
            role: "INSPECTED_BY",
            status: "TEPAT",
            isLate: false,
            signedAt: new Date(),
        };
        const crypto = await import("node:crypto");
        const requestHash = crypto
            .createHash("sha256")
            .update(JSON.stringify({ roomId: CLEANING_IDS.room, wibDate: MONDAY, signerEmployeeId: "EMP001" }))
            .digest("hex");

        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue({
            requestHash,
            responsePayload: JSON.stringify(cached),
        } as never);

        const result = await signDailyParaf({
            roomId: CLEANING_IDS.room,
            wibDate: MONDAY,
            signerEmployeeId: "EMP001",
            idempotencyKey: "kunci-sama",
        });

        expect(result).toEqual(JSON.parse(JSON.stringify(cached)));
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("menolak idempotency key yang dipakai ulang untuk payload berbeda 409", async () => {
        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue({
            requestHash: "hash-lain",
            responsePayload: "{}",
        } as never);

        await expect(
            signDailyParaf({
                roomId: CLEANING_IDS.room,
                wibDate: MONDAY,
                signerEmployeeId: "EMP001",
                idempotencyKey: "kunci-beda",
            })
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("memvalidasi format tanggal dengan pesan Indonesia", async () => {
        await expect(getParafStatus(CLEANING_IDS.room, "2026-13-40")).rejects.toBeInstanceOf(CleaningError);
        await expect(
            signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: "bukan-tanggal", signerEmployeeId: "EMP001" })
        ).rejects.toThrow(/YYYY-MM-DD/);
    });
});

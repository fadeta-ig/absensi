import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CLEANING_IDS, makeChecklistItem, makeWorkerSession, makeWig002Session, makeEmployeeSession } from "../fixtures/cleaning";

const auditMocks = vi.hoisted(() => ({
    actorFromSession: vi.fn((session: { userId: string; username: string }) => ({
        userId: session.userId,
        identifier: session.username,
    })),
    logAction: vi.fn(),
}));

const settingsMocks = vi.hoisted(() => ({
    isCleaningTopViewer: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningWorkerAssignment: {
            findFirst: vi.fn(),
        },
        cleaningRoom: {
            findUnique: vi.fn(),
        },
        cleaningDailyChecklistItem: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock("@/lib/services/auditService", () => auditMocks);
vi.mock("@/lib/services/appSettingsService", () => settingsMocks);
vi.mock("@/lib/logger", () => ({
    default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { getUnavailableCandidates, updateChecklistItem } from "@/lib/services/cleaningService";

type PrismaMock = {
    [K in keyof typeof prisma]: typeof prisma[K];
};

const db = prisma as unknown as PrismaMock;

function mock(fn: unknown): Mock {
    return fn as unknown as Mock;
}

const WIB_TODAY = "2026-09-21";

function todayItem(overrides: Record<string, unknown> = {}) {
    return makeChecklistItem({
        checklist: { roomId: CLEANING_IDS.room, wibDate: WIB_TODAY },
        ...overrides,
    });
}

describe("cleaning unavailable marks", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-21T05:00:00.000Z"));
        auditMocks.logAction.mockResolvedValue(undefined);
        mock(db.$transaction).mockImplementation(async (callback: (tx: PrismaMock) => unknown) => callback(db));
        mock(db.cleaningWorkerAssignment.findFirst).mockResolvedValue({ id: CLEANING_IDS.assignment });
        mock(db.cleaningRoom.findUnique).mockResolvedValue({ isActive: true });
    });

    it("menandai tidak ada: mengosongkan isComplete dan mencatat audit", async () => {
        mock(db.cleaningDailyChecklistItem.findUnique).mockResolvedValue(todayItem({ isComplete: true }));
        mock(db.cleaningDailyChecklistItem.update).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => (
            todayItem({ ...data, lastChangedByUserId: CLEANING_IDS.workerUser, lastChangedAt: new Date() })
        ));
        mock(db.cleaningDailyChecklistItem.findMany).mockResolvedValue([
            todayItem({ isComplete: true }),
            todayItem({ isUnavailable: true }),
        ]);

        const result = await updateChecklistItem(makeWorkerSession(), CLEANING_IDS.checklistItem, { isUnavailable: true });

        expect(db.cleaningDailyChecklistItem.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ isComplete: false, isUnavailable: true }),
        }));
        expect(auditMocks.logAction).toHaveBeenCalledWith(
            "UPDATE_CLEANING_ITEM",
            "CLEANING_DAILY_CHECKLIST_ITEM",
            expect.anything(),
            CLEANING_IDS.checklistItem,
            expect.objectContaining({ isComplete: false, isUnavailable: true }),
        );
        expect(result.item).toMatchObject({ isComplete: false, isUnavailable: true });
        expect(result.derivedStatus).toBe("SELESAI");
    });

    it("menolak menyelesaikan item yang ditandai tidak ada (409)", async () => {
        mock(db.cleaningDailyChecklistItem.findUnique).mockResolvedValue(todayItem({ isUnavailable: true }));

        await expect(
            updateChecklistItem(makeWorkerSession(), CLEANING_IDS.checklistItem, { isComplete: true })
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(db.cleaningDailyChecklistItem.update).not.toHaveBeenCalled();
    });

    it("membatalkan tanda mengembalikan ke BELUM", async () => {
        mock(db.cleaningDailyChecklistItem.findUnique).mockResolvedValue(todayItem({ isUnavailable: true }));
        mock(db.cleaningDailyChecklistItem.update).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => (
            todayItem({ ...data, lastChangedByUserId: CLEANING_IDS.workerUser, lastChangedAt: new Date() })
        ));
        mock(db.cleaningDailyChecklistItem.findMany).mockResolvedValue([todayItem()]);

        const result = await updateChecklistItem(makeWorkerSession(), CLEANING_IDS.checklistItem, { isUnavailable: false });

        expect(result.item).toMatchObject({ isComplete: false, isUnavailable: false });
        expect(result.derivedStatus).toBe("BELUM");
    });

    it("menolak patch kosong (400)", async () => {
        mock(db.cleaningDailyChecklistItem.findUnique).mockResolvedValue(todayItem());

        await expect(
            updateChecklistItem(makeWorkerSession(), CLEANING_IDS.checklistItem, {})
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(db.cleaningDailyChecklistItem.update).not.toHaveBeenCalled();
    });
});

describe("getUnavailableCandidates", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        settingsMocks.isCleaningTopViewer.mockResolvedValue(false);
    });

    function candidateRow(roomId: string, roomName: string, wibDate: string, itemName: string, claimer: string | null) {
        return {
            templateItemId: `tpl-${itemName}`,
            itemNameSnapshot: itemName,
            lastChangedBy: claimer ? { displayName: claimer } : null,
            checklist: { roomId, wibDate, room: { name: roomName } },
        };
    }

    it("menolak non-WIG002 non-topViewer (403)", async () => {
        await expect(getUnavailableCandidates(makeEmployeeSession(), "2026-09")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("mengelompokkan per ruangan+item dan menyaring ambang minDays", async () => {
        const rows = [
            ...["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]
                .map((d) => candidateRow("room-1", "Resepsionis", d, "AC (Air Conditioner)", "Heri")),
            ...["2026-09-01", "2026-09-02"]
                .map((d) => candidateRow("room-1", "Resepsionis", d, "Kipas", "Ismail")),
        ];
        mock(db.cleaningDailyChecklistItem.findMany).mockResolvedValue(rows);

        const result = await getUnavailableCandidates(makeWig002Session(), "2026-09", 5);

        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({
            roomId: "room-1",
            roomName: "Resepsionis",
            itemName: "AC (Air Conditioner)",
            unavailableDays: 6,
        });
        expect(result.candidates[0].claimedBy).toContain("Heri");
    });

    it("menolak format bulan tidak valid (422)", async () => {
        await expect(getUnavailableCandidates(makeWig002Session(), "2026-13")).rejects.toMatchObject({ statusCode: 422 });
    });
});

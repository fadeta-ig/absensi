import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CLEANING_IDS, makeChecklist, makeChecklistItem, makeRoom, makeWig002Session, makeWorkerSession } from "../fixtures/cleaning";

const auditMocks = vi.hoisted(() => ({
    actorFromSession: vi.fn((session: { userId: string; username: string }) => ({
        userId: session.userId,
        identifier: session.username,
    })),
    logAction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningTemplate: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        cleaningTemplateItem: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        cleaningRoom: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        cleaningWorkerAssignment: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            delete: vi.fn(),
        },
        cleaningDailyChecklist: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
        },
        cleaningDailyChecklistItem: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
        },
        userAccount: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        role: {
            findUnique: vi.fn(),
        },
        userRoleAssignment: {
            findFirst: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock("@/lib/services/auditService", () => auditMocks);
vi.mock("@/lib/logger", () => ({
    default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
    CleaningError,
    createAssignment,
    endAssignment,
    createRoom,
    createTemplate,
    createTemplateItem,
    getChecklist,
    getChecklistDetail,
    getOrCreateDailyChecklist,
    getRecap,
    getWorkerRooms,
    getAvailableUsersForAssignment,
    isWig002,
    normalizeName,
    updateChecklistItem,
    updateTemplate,
    createOutsourceUser,
    listOutsourceUsers,
} from "@/lib/services/cleaningService";

type PrismaMock = {
    [K in keyof typeof prisma]: typeof prisma[K];
};

const db = prisma as unknown as PrismaMock;

function mock(fn: unknown): Mock {
    return fn as unknown as Mock;
}

function allowAssignedWorker() {
    mock(db.cleaningWorkerAssignment.findFirst).mockResolvedValue({ id: CLEANING_IDS.assignment });
}

function activeRoomWithItems() {
    return makeRoom({
        template: {
            id: CLEANING_IDS.template,
            name: "Template Test Cleaning",
            isActive: true,
            items: [{
                id: CLEANING_IDS.templateItem,
                name: "Lantai",
                sortOrder: 1,
                isActive: true,
            }],
        },
    });
}

describe("cleaningService contract", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-21T05:00:00.000Z"));
        auditMocks.logAction.mockResolvedValue(undefined);
        mock(db.$transaction).mockImplementation(async (callback: (tx: PrismaMock) => unknown) => callback(db));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("AC-5 normalizes trimmed Unicode names and collapses internal whitespace", () => {
        expect(normalizeName("  Ruang   Sanitasi  Élite  ")).toBe("ruang sanitasi élite");
    });

    it("AC-8 accepts only exact WIG002 with ga.manage", () => {
        expect(isWig002(makeWig002Session())).toBe(true);
        expect(isWig002(makeWig002Session({ username: "wig002" }))).toBe(false);
        expect(isWig002(makeWig002Session({ permissions: [] }))).toBe(false);
    });

    it("AC-1 lists only currently effective active room assignments", async () => {
        mock(db.cleaningWorkerAssignment.findMany).mockResolvedValue([
            { room: makeRoom() },
            { room: makeRoom({ id: CLEANING_IDS.inactiveRoom, isActive: false }) },
        ]);

        const rooms = await getWorkerRooms(makeWorkerSession());

        expect(db.cleaningWorkerAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                userId: CLEANING_IDS.workerUser,
                startsOnWibDate: { lte: "2026-09-21" },
                OR: [
                    { endsOnWibDate: null },
                    { endsOnWibDate: { gt: "2026-09-21" } },
                ],
            }),
        }));
        expect(rooms).toHaveLength(1);
        expect(rooms[0].id).toBe(CLEANING_IDS.room);
    });

    it("AC-8 rejects a caller without cleaning.execute before reading assignments", async () => {
        await expect(getWorkerRooms(makeWorkerSession({ permissions: [] }))).rejects.toMatchObject({
            statusCode: 403,
        });
        expect(db.cleaningWorkerAssignment.findMany).not.toHaveBeenCalled();
    });

    it("AC-8 rejects cleaning.execute when the Cleaning Worker role is absent", async () => {
        mock(db.cleaningWorkerAssignment.findMany).mockResolvedValue([]);

        await expect(getWorkerRooms(makeWorkerSession({ roles: [] }))).rejects.toMatchObject({
            statusCode: 403,
        });
    });

    it("AC-8 denies a worker who is not assigned to the requested room", async () => {
        mock(db.cleaningWorkerAssignment.findFirst).mockResolvedValue(null);

        await expect(getChecklist(
            makeWorkerSession(),
            CLEANING_IDS.room,
            "2026-09-21",
        )).rejects.toMatchObject({ statusCode: 403 });
        expect(db.cleaningDailyChecklist.findUnique).not.toHaveBeenCalled();
    });

    it.each([
        ["inactive template", makeRoom({ template: { isActive: false, items: [] } })],
        ["zero active items", makeRoom({ template: { isActive: true, items: [] } })],
    ])("AC-1 returns ROOM_NOT_READY for %s without creating a checklist", async (_label, room) => {
        allowAssignedWorker();
        mock(db.cleaningRoom.findUnique).mockResolvedValue(room);

        await expect(getOrCreateDailyChecklist(makeWorkerSession(), CLEANING_IDS.room)).rejects.toEqual(
            expect.objectContaining({ message: "ROOM_NOT_READY", statusCode: 422 }),
        );
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("AC-1 creates an immutable daily snapshot with untouched actor fields", async () => {
        allowAssignedWorker();
        mock(db.cleaningRoom.findUnique).mockResolvedValue(activeRoomWithItems());
        mock(db.cleaningDailyChecklist.findUnique).mockResolvedValue(null);
        mock(db.cleaningDailyChecklist.create).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
            ...makeChecklist(),
            roomNameSnapshot: data.roomNameSnapshot,
            items: [makeChecklistItem()],
        }));

        const result = await getOrCreateDailyChecklist(makeWorkerSession(), CLEANING_IDS.room);

        expect(db.cleaningDailyChecklist.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                roomId: CLEANING_IDS.room,
                wibDate: "2026-09-21",
                roomNameSnapshot: "Ruang Test Cleaning",
                items: {
                    create: [expect.objectContaining({
                        templateItemId: CLEANING_IDS.templateItem,
                        itemNameSnapshot: "Lantai",
                        isComplete: false,
                    })],
                },
            }),
        }));
        expect(result.items[0]).toMatchObject({ lastChangedBy: null, lastChangedAt: null });
        expect(result.derivedStatus).toBe("BELUM");
        expect(auditMocks.logAction).toHaveBeenCalledWith(
            "CREATE_CLEANING_CHECKLIST",
            "CLEANING_DAILY_CHECKLIST",
            expect.anything(),
            CLEANING_IDS.checklist,
            expect.objectContaining({ itemCount: 1 }),
        );
    });

    it("AC-3 returns an existing checklist without creating a duplicate", async () => {
        allowAssignedWorker();
        mock(db.cleaningRoom.findUnique).mockResolvedValue(activeRoomWithItems());
        mock(db.cleaningDailyChecklist.findUnique).mockResolvedValue(makeChecklist());

        const result = await getOrCreateDailyChecklist(makeWorkerSession(), CLEANING_IDS.room);

        expect(result.id).toBe(CLEANING_IDS.checklist);
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("AC-3 returns the same checklist to both concurrent first callers", async () => {
        allowAssignedWorker();
        mock(db.cleaningRoom.findUnique).mockResolvedValue(activeRoomWithItems());
        let created: ReturnType<typeof makeChecklist> | null = null;
        mock(db.cleaningDailyChecklist.findUnique).mockImplementation(async () => created);

        const create = vi.fn(async () => {
            if (created) {
                throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
            }
            created = makeChecklist();
            return created;
        });
        mock(db.$transaction).mockImplementation(async (callback: (tx: PrismaMock) => unknown) => callback({
            ...db,
            cleaningDailyChecklist: {
                ...db.cleaningDailyChecklist,
                create,
            },
        } as unknown as PrismaMock));

        const results = await Promise.all([
            getOrCreateDailyChecklist(makeWorkerSession(), CLEANING_IDS.room),
            getOrCreateDailyChecklist(makeWorkerSession(), CLEANING_IDS.room),
        ]);

        expect(results.map((result) => result.id)).toEqual([
            CLEANING_IDS.checklist,
            CLEANING_IDS.checklist,
        ]);
        expect(create).toHaveBeenCalledTimes(2);
    });

    it("AC-2 rejects mutation outside the current WIB date", async () => {
        mock(db.cleaningDailyChecklistItem.findUnique).mockResolvedValue(makeChecklistItem({
            checklist: { roomId: CLEANING_IDS.room, wibDate: "2026-09-20" },
        }));

        await expect(updateChecklistItem(makeWorkerSession(), CLEANING_IDS.checklistItem, true)).rejects.toEqual(
            expect.objectContaining({ statusCode: 422 }),
        );
        expect(db.cleaningDailyChecklistItem.update).not.toHaveBeenCalled();
    });

    it("AC-2 records the confirmed actor and server time and writes a safe audit record", async () => {
        const changedAt = new Date("2026-09-21T05:00:00.000Z");
        mock(db.cleaningDailyChecklistItem.findUnique).mockResolvedValue(makeChecklistItem({
            checklist: { roomId: CLEANING_IDS.room, wibDate: "2026-09-21" },
        }));
        allowAssignedWorker();
        mock(db.cleaningDailyChecklistItem.update).mockResolvedValue(makeChecklistItem({
            isComplete: true,
            lastChangedByUserId: CLEANING_IDS.workerUser,
            lastChangedAt: changedAt,
            lastChangedBy: { id: CLEANING_IDS.workerUser, displayName: "Cleaning Test Worker" },
        }));
        mock(db.cleaningDailyChecklistItem.findMany).mockResolvedValue([
            makeChecklistItem({ isComplete: true }),
        ]);

        const result = await updateChecklistItem(makeWorkerSession(), CLEANING_IDS.checklistItem, true);

        expect(db.cleaningDailyChecklistItem.update).toHaveBeenCalledWith(expect.objectContaining({
            data: {
                isComplete: true,
                lastChangedByUserId: CLEANING_IDS.workerUser,
                lastChangedAt: changedAt,
            },
        }));
        expect(result).toMatchObject({
            item: { isComplete: true, lastChangedByUserId: CLEANING_IDS.workerUser },
            derivedStatus: "SELESAI",
        });
        expect(auditMocks.logAction).toHaveBeenCalledWith(
            "UPDATE_CLEANING_ITEM",
            "CLEANING_DAILY_CHECKLIST_ITEM",
            expect.anything(),
            CLEANING_IDS.checklistItem,
            { checklistId: CLEANING_IDS.checklist, isComplete: true },
        );
    });

    it("AC-3 returns each concurrently confirmed item change with its saved state", async () => {
        mock(db.cleaningDailyChecklistItem.findUnique).mockResolvedValue(makeChecklistItem({
            checklist: { roomId: CLEANING_IDS.room, wibDate: "2026-09-21" },
        }));
        allowAssignedWorker();
        mock(db.cleaningDailyChecklistItem.update).mockImplementation(async ({ data }: { data: { isComplete: boolean } }) => (
            makeChecklistItem({
                isComplete: data.isComplete,
                lastChangedByUserId: CLEANING_IDS.workerUser,
                lastChangedAt: new Date(),
            })
        ));
        mock(db.cleaningDailyChecklistItem.findMany).mockResolvedValue([makeChecklistItem({ isComplete: false })]);

        const [completed, reopened] = await Promise.all([
            updateChecklistItem(makeWorkerSession(), CLEANING_IDS.checklistItem, true),
            updateChecklistItem(makeWorkerSession(), CLEANING_IDS.checklistItem, false),
        ]);

        expect(completed.item.isComplete).toBe(true);
        expect(reopened.item.isComplete).toBe(false);
        expect(completed.item.lastChangedAt).toBeInstanceOf(Date);
        expect(reopened.item.lastChangedAt).toBeInstanceOf(Date);
    });

    it.each([
        [[], "BELUM"],
        [[makeChecklistItem({ isActive: false, isComplete: true })], "BELUM"],
        [[makeChecklistItem({ isComplete: true })], "SELESAI"],
        [[makeChecklistItem({ isComplete: false })], "BELUM"],
    ])("AC-4 derives %s active item sets as %s", async (items, expected) => {
        allowAssignedWorker();
        mock(db.cleaningDailyChecklist.findUnique).mockResolvedValue(makeChecklist({ items }));

        const result = await getChecklist(makeWorkerSession(), CLEANING_IDS.room, "2026-09-21");

        expect(result?.derivedStatus).toBe(expected);
    });

    it("AC-5 rejects a duplicate room after normalized name comparison", async () => {
        mock(db.cleaningRoom.findUnique).mockResolvedValue(makeRoom());

        await expect(createRoom(makeWig002Session(), {
            name: "  RUANG   TEST CLEANING ",
            templateId: CLEANING_IDS.template,
        })).rejects.toEqual(expect.objectContaining({ statusCode: 409 }));
    });

    it("AC-5 refuses to deactivate a template used by an active room", async () => {
        mock(db.cleaningTemplate.findUnique).mockResolvedValue({
            id: CLEANING_IDS.template,
            _count: { rooms: 1 },
        });

        await expect(updateTemplate(makeWig002Session(), CLEANING_IDS.template, {
            isActive: false,
        })).rejects.toEqual(expect.objectContaining({ statusCode: 422 }));
        expect(db.cleaningTemplate.update).not.toHaveBeenCalled();
    });

    it("AC-5 enforces normalized item uniqueness inside one template", async () => {
        mock(db.cleaningTemplate.findUnique).mockResolvedValue({
            id: CLEANING_IDS.template,
            isActive: true,
        });
        mock(db.cleaningTemplateItem.findUnique).mockResolvedValue({
            id: CLEANING_IDS.templateItem,
        });

        await expect(createTemplateItem(makeWig002Session(), {
            templateId: CLEANING_IDS.template,
            name: "  LANTAI  ",
        })).rejects.toMatchObject({ statusCode: 409 });
        expect(db.cleaningTemplateItem.create).not.toHaveBeenCalled();
    });

    it("AC-5 and AC-7 read inactive room history through stored daily records", async () => {
        mock(db.cleaningRoom.findUnique).mockResolvedValue(makeRoom({
            id: CLEANING_IDS.inactiveRoom,
            isActive: false,
        }));
        mock(db.cleaningDailyChecklist.findUnique).mockResolvedValue(makeChecklist({
            roomId: CLEANING_IDS.inactiveRoom,
        }));

        const result = await getChecklistDetail(
            makeWig002Session(),
            CLEANING_IDS.inactiveRoom,
            "2026-08-20",
        );

        expect(result).toMatchObject({
            type: "record",
            checklist: { roomId: CLEANING_IDS.inactiveRoom },
        });
    });

    it("AC-6 keeps an existing daily snapshot unchanged after master item edits", async () => {
        allowAssignedWorker();
        mock(db.cleaningDailyChecklist.findUnique).mockResolvedValue(makeChecklist({
            items: [makeChecklistItem({ itemNameSnapshot: "Nama Lama" })],
        }));

        const result = await getChecklist(makeWorkerSession(), CLEANING_IDS.room, "2026-09-21");

        expect(result?.items[0].itemNameSnapshot).toBe("Nama Lama");
        expect(db.cleaningTemplateItem.findUnique).not.toHaveBeenCalled();
    });

    it("AC-6 creates a new assignment on the current WIB date and adds the worker role", async () => {
        mock(db.cleaningRoom.findUnique).mockResolvedValue(makeRoom());
        mock(db.userAccount.findUnique).mockResolvedValue({
            id: CLEANING_IDS.workerUser,
            isActive: true,
            employeeId: "employee-1",
            employee: { isActive: true },
            roles: [],
        });
        // hasOverlappingAssignment uses count (inside $transaction)
        mock(db.cleaningWorkerAssignment.count).mockResolvedValueOnce(0).mockResolvedValue(1);
        mock(db.cleaningWorkerAssignment.create).mockResolvedValue({
            id: CLEANING_IDS.assignment,
            startsOnWibDate: "2026-09-21",
            workerType: "INTERNAL",
        });
        mock(db.role.findUnique).mockResolvedValue({ id: "role-cleaning" });
        mock(db.userRoleAssignment.findFirst).mockResolvedValue(null);
        mock(db.userRoleAssignment.create).mockResolvedValue({});
        mock(db.userAccount.update).mockResolvedValue({});

        const result = await createAssignment(makeWig002Session(), {
            roomId: CLEANING_IDS.room,
            userId: CLEANING_IDS.workerUser,
            workerType: "INTERNAL",
            applyToToday: true,
        });

        expect(db.cleaningWorkerAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                startsOnWibDate: "2026-09-21",
                workerType: "INTERNAL",
            }),
        }));
        expect(db.userRoleAssignment.create).toHaveBeenCalledWith({
            data: { userId: CLEANING_IDS.workerUser, roleId: "role-cleaning" },
        });
        expect(db.cleaningWorkerAssignment.count).toHaveBeenLastCalledWith({
            where: {
                userId: CLEANING_IDS.workerUser,
                OR: [
                    { endsOnWibDate: null },
                    { endsOnWibDate: { gt: "2026-09-21" } },
                ],
            },
        });
        expect(result.startsOnWibDate).toBe("2026-09-21");
        expect(auditMocks.logAction).toHaveBeenCalledWith(
            "CREATE_CLEANING_ASSIGNMENT",
            "CLEANING_WORKER_ASSIGNMENT",
            expect.objectContaining({ identifier: "WIG002" }),
            CLEANING_IDS.assignment,
            expect.objectContaining({
                roomId: CLEANING_IDS.room,
                userId: CLEANING_IDS.workerUser,
                workerType: "INTERNAL",
            }),
        );
    });

    it("AC-6 schedules an unconfirmed assignment for the next WIB date at the day boundary", async () => {
        vi.setSystemTime(new Date("2026-09-21T16:59:59.000Z"));
        mock(db.cleaningRoom.findUnique).mockResolvedValue(makeRoom());
        mock(db.userAccount.findUnique).mockResolvedValue({
            id: CLEANING_IDS.workerUser,
            isActive: true,
            employeeId: "employee-1",
            employee: { isActive: true },
            roles: [],
        });
        mock(db.cleaningWorkerAssignment.count).mockResolvedValueOnce(0).mockResolvedValue(1);
        mock(db.cleaningWorkerAssignment.create).mockResolvedValue({
            id: CLEANING_IDS.assignment,
            startsOnWibDate: "2026-09-22",
            workerType: "INTERNAL",
        });
        mock(db.role.findUnique).mockResolvedValue({ id: "role-cleaning" });
        mock(db.userRoleAssignment.findFirst).mockResolvedValue({ userId: CLEANING_IDS.workerUser });

        await createAssignment(makeWig002Session(), {
            roomId: CLEANING_IDS.room,
            userId: CLEANING_IDS.workerUser,
            workerType: "INTERNAL",
            applyToToday: false,
        });

        expect(db.cleaningWorkerAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ startsOnWibDate: "2026-09-22", workerType: "INTERNAL" }),
        }));
    });

    it("rejects assigning an outsource account created by a different GA account", async () => {
        const wig002 = makeWig002Session();
        mock(db.cleaningRoom.findUnique).mockResolvedValue(makeRoom());
        mock(db.userAccount.findUnique).mockResolvedValue({
            id: CLEANING_IDS.workerUser,
            isActive: true,
            employeeId: null,
            employee: null,
            createdByUserId: "different-ga-user",
            roles: [],
        });

        await expect(createAssignment(wig002, {
            roomId: CLEANING_IDS.room,
            userId: CLEANING_IDS.workerUser,
            workerType: "OUTSOURCE",
            applyToToday: true,
        })).rejects.toMatchObject({ statusCode: 422 });
        expect(db.cleaningWorkerAssignment.create).not.toHaveBeenCalled();
    });

    it("AC-6 ends an assignment and removes the worker role when no active assignments remain", async () => {
        mock(db.cleaningWorkerAssignment.findUnique).mockResolvedValue({
            id: CLEANING_IDS.assignment,
            userId: CLEANING_IDS.workerUser,
            roomId: CLEANING_IDS.room,
            workerType: "INTERNAL",
            startsOnWibDate: "2026-09-20",
            endsOnWibDate: null,
        });
        mock(db.cleaningWorkerAssignment.update).mockResolvedValue({
            id: CLEANING_IDS.assignment,
            endsOnWibDate: "2026-09-21",
        });
        mock(db.cleaningWorkerAssignment.count).mockResolvedValue(0);
        mock(db.role.findUnique).mockResolvedValue({ id: "role-cleaning" });
        mock(db.userRoleAssignment.findFirst).mockResolvedValue({ userId: CLEANING_IDS.workerUser });
        mock(db.userRoleAssignment.delete).mockResolvedValue({});
        mock(db.userAccount.update).mockResolvedValue({});

        await endAssignment(makeWig002Session(), {
            assignmentId: CLEANING_IDS.assignment,
            applyToToday: true,
            reason: "Pindah tugas",
        });

        expect(db.cleaningWorkerAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ endsOnWibDate: "2026-09-21" }),
        }));
        expect(db.userRoleAssignment.delete).toHaveBeenCalledWith({
            where: { userId_roleId: { userId: CLEANING_IDS.workerUser, roleId: "role-cleaning" } },
        });
        expect(db.userAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { sessionVersion: { increment: 1 } },
        }));
    });

    it("keeps the worker role until a scheduled end date becomes effective", async () => {
        mock(db.cleaningWorkerAssignment.findUnique).mockResolvedValue({
            id: CLEANING_IDS.assignment,
            userId: CLEANING_IDS.workerUser,
            roomId: CLEANING_IDS.room,
            workerType: "INTERNAL",
            startsOnWibDate: "2026-09-20",
            endsOnWibDate: null,
        });
        mock(db.cleaningWorkerAssignment.update).mockResolvedValue({
            id: CLEANING_IDS.assignment,
            userId: CLEANING_IDS.workerUser,
            roomId: CLEANING_IDS.room,
            startsOnWibDate: "2026-09-20",
            endsOnWibDate: "2026-09-22",
        });
        mock(db.cleaningWorkerAssignment.count).mockResolvedValue(1);
        mock(db.role.findUnique).mockResolvedValue({ id: "role-cleaning" });
        mock(db.userRoleAssignment.findFirst).mockResolvedValue({ userId: CLEANING_IDS.workerUser });

        await endAssignment(makeWig002Session(), {
            assignmentId: CLEANING_IDS.assignment,
            applyToToday: false,
            reason: "Berakhir besok",
        });

        expect(db.cleaningWorkerAssignment.count).toHaveBeenCalledWith({
            where: {
                userId: CLEANING_IDS.workerUser,
                OR: [
                    { endsOnWibDate: null },
                    { endsOnWibDate: { gt: "2026-09-21" } },
                ],
            },
        });
        expect(db.userRoleAssignment.delete).not.toHaveBeenCalled();
    });

    it("reschedules an unstarted planned assignment to start today when applyToToday=true without conflict", async () => {
        vi.setSystemTime(new Date("2026-09-21T08:00:00.000Z"));
        mock(db.cleaningRoom.findUnique).mockResolvedValue(makeRoom());
        mock(db.userAccount.findUnique).mockResolvedValue({
            id: CLEANING_IDS.workerUser,
            isActive: true,
            employeeId: "employee-1",
            employee: { isActive: true },
            roles: [],
        });
        mock(db.cleaningWorkerAssignment.findFirst).mockResolvedValue({
            id: CLEANING_IDS.assignment,
            roomId: CLEANING_IDS.room,
            userId: CLEANING_IDS.workerUser,
            workerType: "INTERNAL",
            startsOnWibDate: "2026-09-22",
            endsOnWibDate: null,
        });
        mock(db.cleaningWorkerAssignment.update).mockResolvedValue({
            id: CLEANING_IDS.assignment,
            startsOnWibDate: "2026-09-21",
            workerType: "INTERNAL",
        });
        mock(db.role.findUnique).mockResolvedValue({ id: "role-cleaning" });
        mock(db.cleaningWorkerAssignment.count).mockResolvedValue(1);
        mock(db.userRoleAssignment.findFirst).mockResolvedValue(null);
        mock(db.userRoleAssignment.create).mockResolvedValue({});

        const result = await createAssignment(makeWig002Session(), {
            roomId: CLEANING_IDS.room,
            userId: CLEANING_IDS.workerUser,
            workerType: "INTERNAL",
            applyToToday: true,
        });

        expect(db.cleaningWorkerAssignment.update).toHaveBeenCalledWith({
            where: { id: CLEANING_IDS.assignment },
            data: {
                startsOnWibDate: "2026-09-21",
                workerType: "INTERNAL",
            },
        });
        expect(result.startsOnWibDate).toBe("2026-09-21");
    });

    it("cancels and deletes an unstarted planned assignment before it starts", async () => {
        vi.setSystemTime(new Date("2026-09-21T08:00:00.000Z"));
        mock(db.cleaningWorkerAssignment.findUnique).mockResolvedValue({
            id: CLEANING_IDS.assignment,
            userId: CLEANING_IDS.workerUser,
            roomId: CLEANING_IDS.room,
            workerType: "INTERNAL",
            startsOnWibDate: "2026-09-22", // starts tomorrow
            endsOnWibDate: null,
        });
        mock(db.cleaningWorkerAssignment.delete).mockResolvedValue({
            id: CLEANING_IDS.assignment,
        });
        mock(db.cleaningWorkerAssignment.count).mockResolvedValue(0);
        mock(db.role.findUnique).mockResolvedValue({ id: "role-cleaning" });
        mock(db.userRoleAssignment.findFirst).mockResolvedValue(null);

        await endAssignment(makeWig002Session(), {
            assignmentId: CLEANING_IDS.assignment,
            applyToToday: true,
            reason: "Dibatalkan oleh GA",
        });

        expect(db.cleaningWorkerAssignment.delete).toHaveBeenCalledWith({
            where: { id: CLEANING_IDS.assignment },
        });
        expect(auditMocks.logAction).toHaveBeenCalledWith(
            "CANCEL_CLEANING_ASSIGNMENT",
            "CLEANING_WORKER_ASSIGNMENT",
            expect.anything(),
            CLEANING_IDS.assignment,
            expect.objectContaining({
                plannedStartsOnWibDate: "2026-09-22",
                reason: "Dibatalkan oleh GA",
            }),
        );
    });

    it("AC-6 rolls back the staged assignment when role synchronization fails", async () => {
        mock(db.cleaningRoom.findUnique).mockResolvedValue(makeRoom());
        mock(db.userAccount.findUnique).mockResolvedValue({
            id: CLEANING_IDS.workerUser,
            isActive: true,
            employeeId: "employee-1",
            employee: { isActive: true },
            roles: [],
        });
        let persistedAssignment: object | null = null;

        mock(db.$transaction).mockImplementation(async (callback: (tx: PrismaMock) => unknown) => {
            let stagedAssignment = persistedAssignment;
            const tx = {
                ...db,
                cleaningWorkerAssignment: {
                    ...db.cleaningWorkerAssignment,
                    findFirst: vi.fn(async () => null),
                    count: vi.fn(async () => 0),   // overlap check passes
                    create: vi.fn(async () => {
                        stagedAssignment = { id: CLEANING_IDS.assignment };
                        return stagedAssignment;
                    }),
                },
                role: { findUnique: vi.fn(async () => null) },  // role not found → triggers 500
                userRoleAssignment: {
                    ...db.userRoleAssignment,
                    findFirst: vi.fn(),
                },
            } as unknown as PrismaMock;

            const result = await callback(tx);
            persistedAssignment = stagedAssignment;
            return result;
        });

        await expect(createAssignment(makeWig002Session(), {
            roomId: CLEANING_IDS.room,
            userId: CLEANING_IDS.workerUser,
            workerType: "INTERNAL",
            applyToToday: true,
        })).rejects.toEqual(expect.objectContaining({ statusCode: 500 }));

        expect(persistedAssignment).toBeNull();
        expect(auditMocks.logAction).not.toHaveBeenCalled();
    });

    it("AC-7 builds past missing, current stored, and future matrix cells deterministically", async () => {
        mock(db.cleaningRoom.findMany).mockResolvedValue([
            { id: CLEANING_IDS.room, name: "Ruang Test Cleaning" },
        ]);
        mock(db.cleaningDailyChecklist.findMany).mockResolvedValue([
            {
                roomId: CLEANING_IDS.room,
                wibDate: "2026-09-21",
                items: [makeChecklistItem({ isComplete: true })],
            },
        ]);

        const result = await getRecap(makeWig002Session(), "2026-09");
        const days = result.matrix[0].days;

        expect(days.find((day) => day.date === "2026-09-20")?.status).toBe("BELUM");
        expect(days.find((day) => day.date === "2026-09-21")?.status).toBe("SELESAI");
        expect(days.find((day) => day.date === "2026-09-22")?.status).toBe("FUTURE");
    });

    it("AC-7 returns a future template preview without creating a daily record", async () => {
        mock(db.cleaningRoom.findUnique).mockResolvedValue(activeRoomWithItems());
        mock(db.cleaningDailyChecklist.findUnique).mockResolvedValue(null);

        const result = await getChecklistDetail(
            makeWig002Session(),
            CLEANING_IDS.room,
            "2026-09-22",
        );

        expect(result).toMatchObject({
            type: "preview",
            preview: {
                date: "2026-09-22",
                items: [{ name: "Lantai", sortOrder: 1 }],
            },
        });
        expect(db.cleaningDailyChecklist.create).not.toHaveBeenCalled();
    });

    it("AC-7 returns an explicit no record result for a missing past date", async () => {
        mock(db.cleaningRoom.findUnique).mockResolvedValue(activeRoomWithItems());
        mock(db.cleaningDailyChecklist.findUnique).mockResolvedValue(null);

        const result = await getChecklistDetail(
            makeWig002Session(),
            CLEANING_IDS.room,
            "2026-09-20",
        );

        expect(result).toEqual({
            type: "no_record",
            message: "Tidak ada catatan checklist digital untuk tanggal ini.",
        });
    });

    it("AC-7 rejects malformed and future recap months", async () => {
        await expect(getRecap(makeWig002Session(), "2026-13")).rejects.toBeInstanceOf(CleaningError);
        await expect(getRecap(makeWig002Session(), "2026-10")).rejects.toEqual(
            expect.objectContaining({ statusCode: 422 }),
        );
    });

    it("AC-9 records configuration audit metadata without credentials", async () => {
        mock(db.cleaningTemplate.findUnique).mockResolvedValue(null);
        mock(db.cleaningTemplate.create).mockResolvedValue({
            id: CLEANING_IDS.template,
            name: "Template Test Cleaning",
        });

        await createTemplate(makeWig002Session(), { name: "Template Test Cleaning" });

        const details = auditMocks.logAction.mock.calls[0][4];
        expect(details).toEqual({ name: "Template Test Cleaning" });
        expect(JSON.stringify(details)).not.toMatch(/password|secret|token/i);
    });

    describe("outsource user management (WIG002)", () => {
        it("rejects non-WIG002 session from creating outsource user", async () => {
            const worker = makeWorkerSession();
            await expect(
                createOutsourceUser(worker, {
                    username: "outsource_test",
                    displayName: "Test Outsource",
                    password: "Secure123!",
                })
            ).rejects.toBeInstanceOf(CleaningError);
        });

        it("creates an outsource user with a hashed password without granting a role before assignment", async () => {
            const wig002 = makeWig002Session();
            mock(db.userAccount.findFirst).mockResolvedValue(null);

            const createdUser = {
                id: "user-outsource-1",
                username: "outsource_tono",
                displayName: "Tono (Outsource)",
                email: "outsource_tono@outsource.wig.co.id",
                isActive: true,
                createdAt: new Date(),
            };
            mock(db.userAccount.create).mockResolvedValue(createdUser);

            const result = await createOutsourceUser(wig002, {
                username: "OUTSOURCE_TONO",
                displayName: "Tono (Outsource)",
                password: "Secure123!",
            });

            expect(result.username).toBe("outsource_tono");
            expect(result.email).toBe("outsource_tono@outsource.wig.co.id");
            expect(db.userAccount.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    username: "outsource_tono",
                    createdByUserId: wig002.userId,
                    passwordHash: expect.not.stringMatching(/Secure123!/),
                }),
            }));
            expect(db.userRoleAssignment.create).not.toHaveBeenCalled();
            expect(auditMocks.logAction).toHaveBeenCalledWith(
                "CREATE_OUTSOURCE_USER",
                "USER_ACCOUNT",
                expect.anything(),
                "user-outsource-1",
                expect.objectContaining({ username: "outsource_tono" })
            );
        });

        it("rejects an outsource password shorter than eight characters", async () => {
            await expect(
                createOutsourceUser(makeWig002Session(), {
                    username: "outsource_test",
                    displayName: "Test Outsource",
                    password: "123",
                }),
            ).rejects.toMatchObject({ statusCode: 422 });
            expect(db.userAccount.create).not.toHaveBeenCalled();
        });

        it("maps a concurrent username or email collision to a domain conflict", async () => {
            mock(db.userAccount.findFirst).mockResolvedValue(null);
            mock(db.userAccount.create).mockRejectedValue({ code: "P2002" });

            await expect(
                createOutsourceUser(makeWig002Session(), {
                    username: "outsource_test",
                    displayName: "Test Outsource",
                    password: "Secure123!",
                }),
            ).rejects.toMatchObject({ statusCode: 409 });
        });

        it("lists outsource users with their active room assignments", async () => {
            const wig002 = makeWig002Session();
            mock(db.userAccount.findMany).mockResolvedValue([
                {
                    id: "user-1",
                    username: "outsource_budi",
                    displayName: "Budi (Outsource)",
                    email: "budi@outsource.wig.co.id",
                    isActive: true,
                    cleaningAssignments: [
                        { room: { id: "room-1", name: "Ruangan CEO" } },
                    ],
                },
            ]);

            const list = await listOutsourceUsers(wig002);
            expect(list).toHaveLength(1);
            expect(list[0].username).toBe("outsource_budi");
            expect(list[0].cleaningAssignments[0].room.name).toBe("Ruangan CEO");
            expect(db.userAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ createdByUserId: wig002.userId }),
            }));
        });

        it("limits assignable outsource accounts to those created by the GA account", async () => {
            const wig002 = makeWig002Session();
            mock(db.userAccount.findMany).mockResolvedValue([]);

            await getAvailableUsersForAssignment(wig002, "OUTSOURCE");

            expect(db.userAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    employeeId: null,
                    createdByUserId: wig002.userId,
                }),
            }));
        });
    });
});

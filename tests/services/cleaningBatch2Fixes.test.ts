import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    CLEANING_IDS,
    makeRoom,
    makeWig002Session,
    makeWorkerSession,
} from "../fixtures/cleaning";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        cleaningRoom: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
        cleaningTemplate: { findUnique: vi.fn(), create: vi.fn() },
        cleaningTemplateItem: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
        cleaningDailyChecklist: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
        cleaningDailyChecklistItem: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
        cleaningMonthlyApproval: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
        cleaningDailyParaf: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
        cleaningEvidencePhoto: { count: vi.fn(), create: vi.fn() },
        cleaningHoliday: { findMany: vi.fn() },
        cleaningWorkerAssignment: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        userAccount: { findUnique: vi.fn(), findMany: vi.fn() },
        userRoleAssignment: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
        role: { findUnique: vi.fn() },
        employee: { findFirst: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn(),
    },
}));

vi.mock("node:fs/promises", () => ({
    mkdir: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
    writeFile: vi.fn(),
}));

vi.mock("@/lib/services/auditService", () => ({
    actorFromSession: vi.fn((session: { userId: string; username: string }) => ({
        userId: session.userId,
        identifier: session.username,
    })),
    logAction: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { toWIBDateString } from "@/lib/timezone";
import {
    createRoom,
    createTemplateItem,
    deleteRoom,
    deleteTemplate,
    deleteTemplateItem,
    getChecklist,
    replaceAssignment,
    updateChecklistItem,
    updateRoom,
    updateTemplateItem,
} from "@/lib/services/cleaningService";
import { reopenApprovalSlot } from "@/lib/services/cleaningApprovalService";
import { getTopViewerOverview } from "@/lib/services/cleaningOverviewService";
import { saveCleaningEvidence } from "@/lib/services/cleaningEvidenceService";

const wig002 = () => makeWig002Session();
const worker = () => makeWorkerSession();

describe("Batch 2 — master WIG002", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("B4 menolak tambah item ke template nonaktif 422", async () => {
        vi.mocked(prisma.cleaningTemplate.findUnique).mockResolvedValue({ id: "tpl-1", isActive: false } as never);
        await expect(createTemplateItem(wig002(), { templateId: "tpl-1", name: "Baru" })).rejects.toMatchObject({
            statusCode: 422,
        });
        expect(prisma.cleaningTemplateItem.create).not.toHaveBeenCalled();
    });

    it("B3 menolak nonaktifkan ruangan yang masih dijaga 422", async () => {
        vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue({ id: "room-1", isActive: true } as never);
        vi.mocked(prisma.cleaningWorkerAssignment.count).mockResolvedValue(2);
        await expect(updateRoom(wig002(), "room-1", { isActive: false })).rejects.toThrow(/masih dijaga 2 petugas/);
        expect(prisma.cleaningRoom.update).not.toHaveBeenCalled();
    });

    it("B9 duplikat nama ruangan konkuren menjadi 409 (bukan 500)", async () => {
        vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.cleaningTemplate.findUnique).mockResolvedValue({ id: "tpl-1", isActive: true } as never);
        vi.mocked(prisma.cleaningRoom.create).mockRejectedValue({ code: "P2002" });
        await expect(createRoom(wig002(), { name: "Ruang Rapat", templateId: "tpl-1" })).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    it("B5 replace jadwal belum mulai menghapus baris lama (tanpa interval rusak)", async () => {
        const oldRow = {
            id: "asg-1",
            roomId: CLEANING_IDS.room,
            userId: "user-lama",
            startsOnWibDate: "2999-01-02",
            endsOnWibDate: null,
        };
        vi.mocked(prisma.userAccount.findUnique).mockResolvedValue({
            id: "user-baru",
            isActive: true,
            employeeId: null,
            createdByUserId: CLEANING_IDS.adminUser,
            roles: [],
        } as never);
        const txDelete = vi.fn().mockResolvedValue(oldRow);
        const txCreate = vi.fn().mockResolvedValue({ id: "asg-2" });
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => {
            return callback({
                cleaningWorkerAssignment: {
                    findUnique: vi.fn().mockResolvedValue(oldRow),
                    delete: txDelete,
                    update: vi.fn(),
                    create: txCreate,
                    count: vi.fn().mockResolvedValue(0),
                },
                role: { findUnique: vi.fn().mockResolvedValue({ id: "role-cleaning" }) },
                userRoleAssignment: {
                    findFirst: vi.fn().mockResolvedValue(null),
                    create: vi.fn().mockResolvedValue({}),
                },
                userAccount: { update: vi.fn().mockResolvedValue({}) },
            } as never);
        });

        const result = await replaceAssignment(wig002(), {
            assignmentId: "asg-1",
            newUserId: "user-baru",
            newWorkerType: "OUTSOURCE",
            reason: "Ganti petugas",
        });
        expect(txDelete).toHaveBeenCalledWith({ where: { id: "asg-1" } });
        expect(result.wasCancelled).toBe(true);
        expect(result.newAssignment).toEqual({ id: "asg-2" });
    });

    it("B19 menolak nonaktifkan item aktif terakhir pada template terpakai 422", async () => {
        vi.mocked(prisma.cleaningTemplateItem.findUnique).mockResolvedValue({
            id: "item-1",
            templateId: "tpl-1",
            isActive: true,
        } as never);
        vi.mocked(prisma.cleaningTemplateItem.count).mockResolvedValue(0);
        vi.mocked(prisma.cleaningRoom.count).mockResolvedValue(2);
        await expect(updateTemplateItem(wig002(), "item-1", { isActive: false })).rejects.toMatchObject({
            statusCode: 422,
        });
        expect(prisma.cleaningTemplateItem.update).not.toHaveBeenCalled();
    });
});

describe("Batch 2 — checklist worker", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("B13 menolak baca tanggal mendatang 422 tanpa DB", async () => {
        await expect(getChecklist(worker(), CLEANING_IDS.room, "2999-01-05")).rejects.toMatchObject({
            statusCode: 422,
        });
        expect(prisma.cleaningWorkerAssignment.findFirst).not.toHaveBeenCalled();
    });

    it("B11 menolak ubah item pada ruangan nonaktif 422", async () => {
        const today = toWIBDateString(new Date());
        vi.mocked(prisma.cleaningDailyChecklistItem.findUnique).mockResolvedValue({
            id: "item-1",
            checklistId: "cl-1",
            checklistItemId: null,
            isActive: true,
            isComplete: false,
            checklist: { roomId: "room-1", wibDate: today },
            lastChangedBy: null,
        } as never);
        vi.mocked(prisma.cleaningWorkerAssignment.findFirst).mockResolvedValue({ id: "asg-1" } as never);
        vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue({ isActive: false } as never);
        await expect(updateChecklistItem(worker(), "item-1", true)).rejects.toMatchObject({ statusCode: 422 });
        expect(prisma.cleaningDailyChecklistItem.update).not.toHaveBeenCalled();
    });

    it("Ringan idempoten: nilai sama tidak update DB maupun audit", async () => {
        const today = toWIBDateString(new Date());
        vi.mocked(prisma.cleaningDailyChecklistItem.findUnique).mockResolvedValue({
            id: "item-1",
            checklistId: "cl-1",
            isActive: true,
            isComplete: true,
            checklist: { roomId: "room-1", wibDate: today },
            lastChangedBy: null,
        } as never);
        vi.mocked(prisma.cleaningWorkerAssignment.findFirst).mockResolvedValue({ id: "asg-1" } as never);
        vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue({ isActive: true } as never);
        vi.mocked(prisma.cleaningDailyChecklistItem.findMany).mockResolvedValue([
            { isActive: true, isComplete: true },
        ] as never);

        const result = await updateChecklistItem(worker(), "item-1", true);
        expect(result.derivedStatus).toBe("SELESAI");
        expect(prisma.cleaningDailyChecklistItem.update).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("Batch 2 — approval & overview", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("getDaysInMonth murni kalender (kabisat)", async () => {
        const { getDaysInMonth: pure } = await import("@/lib/services/cleaningApprovalService");
        expect(pure("2026-10")).toBe(31);
        expect(pure("2026-02")).toBe(28);
        expect(pure("2024-02")).toBe(29);
    });

    it("B33 reopen tanpa TTD aktif menjadi 404", async () => {
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => {
            return callback({
                cleaningMonthlyApproval: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: "approval-1",
                        inspectedByEmployeeId: "EMP001",
                        knownByEmployeeId: "EMP002",
                        signatures: [],
                    }),
                },
                employee: {
                    findFirst: vi.fn().mockResolvedValue({
                        employeeId: "EMP001",
                        name: "Satu",
                        isActive: true,
                        userAccount: { isActive: true },
                    }),
                },
            } as never);
        });
        await expect(
            reopenApprovalSlot(wig002(), { approvalId: "approval-1", role: "INSPECTED_BY", reopenReason: "Alasan jelas" })
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("B32 overview reviewer hanya berisi ruangannya", async () => {
        vi.mocked(prisma.cleaningRoom.findMany).mockResolvedValue([
            { id: "room-a", name: "A" },
            { id: "room-b", name: "B" },
        ] as never);
        vi.mocked(prisma.cleaningMonthlyApproval.findMany).mockResolvedValue([
            {
                roomId: "room-a",
                inspectedByEmployeeId: "EMP001",
                knownByEmployeeId: "EMP002",
                inspectedByEmployee: { employeeId: "EMP001", name: "Satu" },
                knownByEmployee: { employeeId: "EMP002", name: "Dua" },
                signatures: [],
            },
        ] as never);
        vi.mocked(prisma.cleaningDailyChecklist.findMany).mockResolvedValue([]);
        vi.mocked(prisma.cleaningDailyParaf.findMany).mockResolvedValue([]);
        vi.mocked(prisma.cleaningHoliday.findMany).mockResolvedValue([]);

        const overview = await getTopViewerOverview("2026-09", "EMP001");
        expect(overview.rooms.map((r) => r.roomId)).toEqual(["room-a"]);
    });
});

describe("Batch 2 — evidence", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("B24 menolak JPEG palsu berheader saja 400", async () => {
        const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("hello")]);
        vi.mocked(prisma.cleaningDailyChecklistItem.findUnique).mockResolvedValue({
            id: "item-1",
            checklist: { roomId: "room-1", wibDate: "2026-09-21" },
        } as never);

        const { writeFile } = await import("node:fs/promises");
        await expect(
            saveCleaningEvidence({
                checklistItemId: "item-1",
                buffer: fake,
                mime: "image/jpeg",
                uploaderUserId: "user-1",
            })
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(writeFile).not.toHaveBeenCalled();
    });
});

describe("Batch 2 — fixtures", () => {
    it("makeRoom tersedia untuk mock", () => {
        expect(makeRoom()).toMatchObject({ id: expect.any(String) });
    });
});

describe("Bulk penugasan (UX WIG002)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("menolak input kosong dan kombinasi > 100 pasangan", async () => {
        const { createAssignmentsBulk } = await import("@/lib/services/cleaningService");
        await expect(
            createAssignmentsBulk(wig002(), { roomIds: [], userIds: ["u1"], workerType: "OUTSOURCE" })
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            createAssignmentsBulk(wig002(), {
                roomIds: Array.from({ length: 11 }, (_, i) => `room-${i}`),
                userIds: Array.from({ length: 10 }, (_, i) => `user-${i}`),
                workerType: "OUTSOURCE",
            })
        ).rejects.toMatchObject({ statusCode: 422 });
        expect(prisma.cleaningWorkerAssignment.create).not.toHaveBeenCalled();
    });

    it("1 ruangan × 2 petugas: berhasil + dilewati (sudah ada) + ruangan mati gagal", async () => {
        const { createAssignmentsBulk } = await import("@/lib/services/cleaningService");
        vi.mocked(prisma.cleaningRoom.findMany).mockResolvedValue([
            { id: "room-a", name: "A", isActive: true },
            { id: "room-b", name: "B", isActive: false },
        ] as never);
        vi.mocked(prisma.userAccount.findMany).mockResolvedValue([
            { id: "u1", displayName: "Petugas Satu" },
            { id: "u2", displayName: "Petugas Dua" },
        ] as never);
        vi.mocked(prisma.userAccount.findUnique).mockResolvedValue({
            id: "u-x",
            isActive: true,
            employeeId: null,
            createdByUserId: CLEANING_IDS.adminUser,
            roles: [],
        } as never);
        vi.mocked(prisma.cleaningRoom.findUnique).mockImplementation((async (args: never) => {
            const id = (args as { where: { id: string } }).where.id;
            if (id === "room-a") return { id: "room-a", name: "A", isActive: true } as never;
            return { id: "room-b", name: "B", isActive: false } as never;
        }) as never);
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => {
            return callback({
                cleaningWorkerAssignment: {
                    findFirst: vi.fn().mockResolvedValue(null),
                    count: vi.fn().mockImplementation(async (args: { where: { userId?: string } }) => {
                        return args?.where?.userId === "u2" ? 1 : 0;
                    }),
                    create: vi.fn().mockImplementation(async (args: { data: { roomId: string; userId: string } }) => ({
                        id: `asg-${args.data.roomId}-${args.data.userId}`,
                    })),
                },
                role: { findUnique: vi.fn().mockResolvedValue({ id: "role-cleaning" }) },
                userRoleAssignment: { findFirst: vi.fn().mockResolvedValue({}), create: vi.fn() },
                userAccount: { update: vi.fn().mockResolvedValue({}) },
            } as never);
        });

        const result = await createAssignmentsBulk(wig002(), {
            roomIds: ["room-a", "room-b"],
            userIds: ["u1", "u2"],
            workerType: "OUTSOURCE",
            applyToToday: true,
        });

        expect(result.created).toHaveLength(1);
        expect(result.created[0]).toMatchObject({ roomId: "room-a", userId: "u1" });
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0]).toMatchObject({ roomId: "room-a", userId: "u2" });
        expect(result.failed).toHaveLength(2);
        expect(result.failed.every((f) => f.roomId === "room-b")).toBe(true);
    });
});

describe("Keputusan B9 — hapus master yang belum dipakai", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("menolak hapus template yang masih dipakai ruangan 422", async () => {
        vi.mocked(prisma.cleaningTemplate.findUnique).mockResolvedValue({
            id: "tpl-1",
            name: "Toilet",
            _count: { rooms: 2 },
        } as never);
        await expect(deleteTemplate(wig002(), "tpl-1")).rejects.toMatchObject({ statusCode: 422 });
        expect(prisma.cleaningTemplate.delete).not.toHaveBeenCalled();
    });

    it("menghapus template + itemnya bila tidak dipakai", async () => {
        vi.mocked(prisma.cleaningTemplate.findUnique).mockResolvedValue({
            id: "tpl-1",
            name: "Lama",
            _count: { rooms: 0 },
        } as never);
        const txDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
        const txDelete = vi.fn().mockResolvedValue({ id: "tpl-1" });
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => {
            return callback({
                cleaningTemplateItem: { deleteMany: txDeleteMany },
                cleaningTemplate: { delete: txDelete },
            } as never);
        });
        const result = await deleteTemplate(wig002(), "tpl-1");
        expect(result).toEqual({ success: true, id: "tpl-1" });
        expect(txDeleteMany).toHaveBeenCalledWith({ where: { templateId: "tpl-1" } });
    });

    it("menolak hapus ruangan yang sudah punya data 422", async () => {
        vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue({ id: "room-1", name: "Arsip" } as never);
        vi.mocked(prisma.cleaningWorkerAssignment.count).mockResolvedValue(1);
        vi.mocked(prisma.cleaningDailyChecklist.count).mockResolvedValue(5);
        vi.mocked(prisma.cleaningMonthlyApproval.count).mockResolvedValue(0);
        vi.mocked(prisma.cleaningDailyParaf.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.cleaningDailyChecklist.findUnique).mockResolvedValue(null);
        await expect(deleteRoom(wig002(), "room-1")).rejects.toThrow(/penugasan.*checklist|checklist.*penugasan/);
        expect(prisma.cleaningRoom.delete).not.toHaveBeenCalled();
    });

    it("menolak hapus item yang sudah dipakai catatan 422", async () => {
        vi.mocked(prisma.cleaningTemplateItem.findUnique).mockResolvedValue({ id: "item-1", name: "Pel" } as never);
        vi.mocked(prisma.cleaningDailyChecklistItem.count).mockResolvedValue(3);
        await expect(deleteTemplateItem(wig002(), "item-1")).rejects.toMatchObject({ statusCode: 422 });
        expect(prisma.cleaningTemplateItem.delete).not.toHaveBeenCalled();
    });
});

describe("Keputusan B21 — paraf dinamis per tanggal", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function mockParafTx() {
        const tx = {
            cleaningRoom: { findUnique: vi.fn().mockResolvedValue(makeRoom()) },
            cleaningHoliday: { findUnique: vi.fn().mockResolvedValue(null) },
            cleaningMonthlyApproval: {
                findUnique: vi.fn().mockResolvedValue({
                    inspectedByEmployeeId: "EMP002",
                    knownByEmployeeId: "EMP003",
                }),
            },
            cleaningDailyChecklist: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "cl-1",
                    items: [{ isActive: true, isComplete: true }],
                }),
            },
            employee: { findFirst: vi.fn() },
            cleaningDailyParaf: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
            cleaningApprovalIdempotency: { create: vi.fn() },
            auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (txClient: never) => Promise<unknown>) => {
            return callback(tx as never);
        });
        return tx;
    }

    it("reviewer lama (A) ditolak 403 untuk tanggal setelah diganti", async () => {
        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
        mockParafTx();
        const { signDailyParaf } = await import("@/lib/services/cleaningParafService");
        await expect(
            signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: "2026-09-21", signerEmployeeId: "EMP001" })
        ).rejects.toThrow(/tidak ditugaskan sebagai reviewer/);
    });

    it("reviewer baru (B) bisa paraf tanggal baru; paraf lama A tidak tersentuh", async () => {
        vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
        const tx = mockParafTx();
        tx.employee.findFirst.mockResolvedValue({ employeeId: "EMP002", name: "Atasan Dua" });
        tx.cleaningDailyParaf.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
            id: "paraf-baru",
            signedAt: new Date(),
            ...args.data,
        }));
        const { signDailyParaf } = await import("@/lib/services/cleaningParafService");
        const result = await signDailyParaf({
            roomId: CLEANING_IDS.room,
            wibDate: "2026-09-21",
            signerEmployeeId: "EMP002",
        });
        expect(result.success).toBe(true);
        expect(result.role).toBe("INSPECTED_BY");
        // Tidak ada update/delete ke paraf lama.
        expect(tx.cleaningDailyParaf.create).toHaveBeenCalledTimes(1);
    });
});

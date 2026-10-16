import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn() },
        employee: { findMany: vi.fn(), findUnique: vi.fn() },
        userAccount: { findMany: vi.fn() },
        cleaningRoom: { findMany: vi.fn() },
        cleaningDailyChecklist: { findUnique: vi.fn() },
        equipmentInspection: { findMany: vi.fn(), count: vi.fn() },
        dailyRecapEmailLog: { create: vi.fn(), update: vi.fn() },
        pushSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

vi.mock("@/lib/services/emailService", () => ({
    sendDailyRecapEmail: vi.fn(),
}));

vi.mock("@/lib/services/cleaningParafService", () => ({
    getParafStatus: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { sendDailyRecapEmail } from "@/lib/services/emailService";
import {
    getDailyCleaningRecap,
    resolveTopViewerEmails,
    runDailyRecap,
} from "@/lib/services/recapEmailService";

const mocked = vi.mocked(prisma, true);
const mockedSend = vi.mocked(sendDailyRecapEmail);

function activeEmp(over: Record<string, unknown> = {}) {
    return {
        employeeId: "ID-24050016",
        name: "Anang",
        email: "anang@example.com",
        isActive: true,
        employmentStartDate: null,
        employmentEndDate: null,
        userAccount: { email: "anang@example.com", isActive: true },
        ...over,
    };
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("resolveTopViewerEmails", () => {
    it("gabung equipment + cleaning, hanya aktif beremail", async () => {
        mocked.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify(["ID-24050016", "ID-RESIGN", "ID-NOMAIL"]) } as never);
        const { getCleaningTopViewerEmployeeIds } = await import("@/lib/services/appSettingsService");
        void getCleaningTopViewerEmployeeIds;
        mocked.employee.findMany.mockResolvedValue([
            activeEmp(),
            activeEmp({ employeeId: "ID-RESIGN", name: "Resign", email: "r@example.com", isActive: false }),
            activeEmp({ employeeId: "ID-NOMAIL", name: "NoMail", email: "", userAccount: { email: "", isActive: true } }),
        ] as never);
        // cleaning ids kosong (mock default); hanya equipment dari appSetting
        const { to, missing } = await resolveTopViewerEmails();
        expect(to.map((r) => r.employeeId)).toEqual(["ID-24050016"]);
        expect(missing.map((m) => m.employeeId).sort()).toEqual(["ID-NOMAIL", "ID-RESIGN"]);
    });
});

describe("getDailyCleaningRecap", () => {
    it("satu baris per ruangan aktif", async () => {
        mocked.cleaningRoom.findMany.mockResolvedValue([
            { id: "r1", name: "Resepsionis" },
        ] as never);
        const { getParafStatus } = await import("@/lib/services/cleaningParafService");
        vi.mocked(getParafStatus).mockResolvedValue({
            roomName: "Resepsionis",
            isFree: false,
            checklist: { exists: true, activeCount: 3, completedCount: 3, percent: 100, isComplete: true },
            parafs: [{ id: "p1", signerName: "H. Aris Sudarisman", signerEmployeeId: "ID-1", signedAt: new Date("2026-10-14T02:20:00Z") }],
            missingRoles: ["KNOWN_BY"],
            reviewers: { inspectedByEmployeeId: "ID-1", inspectedByName: "H. Aris Sudarisman", knownByEmployeeId: "ID-2", knownByName: "Dicky" },
        } as never);
        mocked.cleaningDailyChecklist.findUnique.mockResolvedValue({
            items: [
                { itemNameSnapshot: "Kaca", sortOrder: 1, isActive: true, isComplete: false, isUnavailable: false },
                { itemNameSnapshot: "Lantai", sortOrder: 2, isActive: true, isComplete: true, isUnavailable: false },
            ],
        } as never);
        const out = await getDailyCleaningRecap("2026-10-12");
        expect(out.lines).toHaveLength(1);
        expect(out.lines[0]).toMatchObject({ roomName: "Resepsionis", complete: true, parafDone: 1 });
        expect(out.lines[0].doneParafs).toMatchObject([{ name: "Aris Sudarisman" }]);
        expect(out.lines[0].pendingNames).toEqual(["Dicky"]);
        expect(out.lines[0].pendingItems).toEqual(["Kaca"]);
    });
});

describe("runDailyRecap exactly-once", () => {
    it("duplikat tanggal dilewati (P2002)", async () => {
        mocked.dailyRecapEmailLog.create.mockRejectedValue({ code: "P2002" });
        const out = await runDailyRecap("2026-10-12", { toOverride: ["it@example.com"] });
        expect(out).toMatchObject({ sent: false, skipped: true });
        expect(mockedSend).not.toHaveBeenCalled();
    });

    it("kirim ke override + tandai SENT", async () => {
        mocked.dailyRecapEmailLog.create.mockResolvedValue({ id: "log1" } as never);
        mocked.equipmentInspection.findMany.mockResolvedValue([]);
        mocked.equipmentInspection.count.mockResolvedValue(0);
        mocked.cleaningRoom.findMany.mockResolvedValue([]);
        mocked.employee.findMany.mockImplementation((((args: { where?: { employeeId?: { in?: string[] } } }) => {
            const ids = args.where?.employeeId?.in ?? [];
            if (ids.includes("AP-001")) return Promise.resolve([{ employeeId: "AP-001", name: "Feri", isActive: true }]);
            return Promise.resolve([{ employeeId: "QC-001", name: "Fanisa Nur Jasiya Putri", isActive: true, email: "f@example.com" }]);
        }) as never) as never);
        mocked.appSetting.findUnique.mockImplementation((((args: { where: { key: string } }) => {
            const key = args.where.key;
            if (key === "equipment.qcMembers") return Promise.resolve({ value: JSON.stringify(["QC-001"]) });
            if (key === "equipment.approvers") return Promise.resolve({ value: JSON.stringify(["AP-001"]) });
            if (key === "equipment.approverId") return Promise.resolve(null);
            return Promise.resolve({ value: "[]" });
        }) as never) as never);
        mockedSend.mockResolvedValue(true);
        mocked.dailyRecapEmailLog.update.mockResolvedValue({} as never);
        const out = await runDailyRecap("2026-10-12", { toOverride: ["it@example.com"] });
        expect(out).toMatchObject({ sent: true, to: ["it@example.com"] });
        expect(mockedSend).toHaveBeenCalledTimes(1);
        expect(mockedSend).toHaveBeenCalledWith(
            expect.objectContaining({
                equipment: expect.objectContaining({ verifiers: ["Fanisa Nur Jasiya Putri"], approverNames: ["Feri"] }),
            })
        );
        expect(mocked.dailyRecapEmailLog.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { wibDate: "2026-10-12" } })
        );
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        employee: { findUnique: vi.fn(), findMany: vi.fn() },
        meetingTask: { findMany: vi.fn() },
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import {
    getMeetingTopViewerEmployeeIds,
    getMeetingTopViewerInfos,
    invalidateMeetingTopViewersCache,
    isMeetingTopViewer,
    removeMeetingTopViewer,
    setMeetingTopViewers,
} from "@/lib/services/appSettingsService";
import { getKinerjaPantau } from "@/lib/services/meetingTaskService";

const mocked = prisma as unknown as {
    appSetting: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
    employee: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    meetingTask: { findMany: ReturnType<typeof vi.fn> };
};

function empSession(over: Record<string, unknown> = {}) {
    return {
        userId: "u-7",
        username: "U7",
        primaryRole: "EMPLOYEE_USER",
        roles: ["EMPLOYEE_USER"],
        permissions: ["employee.self"],
        employeeId: "ID-007",
        ...over,
    } as never;
}

function monitorIds(ids: string[]) {
    mocked.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify(ids) } as never);
    mocked.employee.findUnique.mockResolvedValue({ isActive: true } as never);
}

const DAY = 86_400_000;
const emp = (name = "Tujuh") => ({
    name,
    isActive: true,
    departmentRel: { name: "Produksi", division: { name: "Operasional" } },
    divisionRel: null,
});

function taskRow(over: Record<string, unknown> = {}) {
    const now = Date.now();
    return {
        id: "t-1",
        title: "Tugas",
        appointmentId: "m-1",
        assignerEmployeeId: "ID-001",
        assigner: { name: "Satu" },
        appointment: { title: "Rapat" },
        assignees: [
            {
                employeeId: "ID-007",
                status: "OPEN",
                employee: emp(),
            },
        ],
        deadlineHistory: [{ sequence: 1, deadlineDate: new Date(now + 10 * DAY) }],
        submissions: [],
        ...over,
    };
}

function sub(employeeId: string, attemptNo: number, verdict: string, createdAt: Date, resubmitDueAt: Date | null = null) {
    return { employeeId, attemptNo, verdict, createdAt, resubmitDueAt };
}

beforeEach(() => {
    vi.resetAllMocks();
    invalidateMeetingTopViewersCache();
});

describe("meeting top viewers settings", () => {
    it("daftar kosong bila setting belum ada", async () => {
        mocked.appSetting.findUnique.mockResolvedValue(null);
        await expect(getMeetingTopViewerEmployeeIds()).resolves.toEqual([]);
    });
    it("bukan anggota daftar = bukan pemantau", async () => {
        monitorIds(["ID-001"]);
        await expect(isMeetingTopViewer(empSession())).resolves.toBe(false);
    });
    it("anggota aktif = pemantau", async () => {
        monitorIds(["ID-007"]);
        await expect(isMeetingTopViewer(empSession())).resolves.toBe(true);
    });
    it("anggota nonaktif = bukan pemantau", async () => {
        monitorIds(["ID-007"]);
        mocked.employee.findUnique.mockResolvedValue({ isActive: false } as never);
        await expect(isMeetingTopViewer(empSession())).resolves.toBe(false);
    });
    it("menolak lebih dari 5", async () => {
        await expect(setMeetingTopViewers(["1", "2", "3", "4", "5", "6"], "u-1")).rejects.toMatchObject({ statusCode: 409 });
    });
    it("setuju bila menulis daftar valid", async () => {
        mocked.employee.findUnique.mockResolvedValue({ employeeId: "ID-007", isActive: true, userAccount: { id: "u-7" } } as never);
        mocked.appSetting.upsert.mockResolvedValue({} as never);
        const out = await setMeetingTopViewers(["ID-007"], "u-1");
        expect(out.employeeIds).toEqual(["ID-007"]);
    });
    it("infos memetakan nama + status", async () => {
        monitorIds(["ID-007"]);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-007", name: "Tujuh", isActive: true, email: "a@b.c" }] as never);
        const infos = await getMeetingTopViewerInfos();
        expect(infos).toEqual([{ employeeId: "ID-007", name: "Tujuh", isActive: true, email: "a@b.c" }]);
    });
    it("remove mengeluarkan satu ID", async () => {
        monitorIds(["ID-007", "ID-008"]);
        mocked.appSetting.upsert.mockResolvedValue({} as never);
        const out = await removeMeetingTopViewer("ID-007", "u-1");
        expect(out.employeeIds).toEqual(["ID-008"]);
    });
});

describe("getKinerjaPantau", () => {
    it("bukan pemantau = 403", async () => {
        monitorIds(["ID-999"]);
        await expect(getKinerjaPantau(empSession(), {})).rejects.toMatchObject({ statusCode: 403 });
    });

    it("menghitung Tepat Waktu/Overdue/Tunggakan + strip bulan lalu", async () => {
        monitorIds(["ID-007"]);
        const now = Date.now();
        const rows = [
            // Tepat Waktu: kumpul sebelum deadline, tanpa revisi
            taskRow({ id: "t-tepat", submissions: [sub("ID-007", 1, "PENDING", new Date(now - 1 * DAY), null)] }),
            // Overdue: kumpul lewat deadline awal (cap menempel walau sudah dikerjakan)
            taskRow({
                id: "t-telat",
                deadlineHistory: [{ sequence: 1, deadlineDate: new Date(now - 3 * DAY) }],
                submissions: [sub("ID-007", 1, "PENDING", new Date(now - 1 * DAY), null)],
            }),
            // Overdue + menumpuk: tak pernah kumpul + sudah lewat
            taskRow({
                id: "t-tunggak",
                deadlineHistory: [{ sequence: 1, deadlineDate: new Date(now - 3 * DAY) }],
                submissions: [],
            }),
            // Tunggakan (antre): belum kumpul, deadline masih lama
            taskRow({ id: "t-antre" }),
            // Overdue + menumpuk: tepat lalu revisi tak dikerjakan sampai lewat tenggat
            taskRow({
                id: "t-rev-mangkir",
                submissions: [sub("ID-007", 1, "DIREVISI", new Date(now - 5 * DAY), new Date(now - 1 * DAY))],
            }),
            // Tunggakan (menunggu resubmit): tepat lalu revisi, tenggat masih lama
            taskRow({
                id: "t-rev-tunggu",
                submissions: [sub("ID-007", 1, "DIREVISI", new Date(now - 1 * DAY), new Date(now + 5 * DAY))],
            }),
            // Tepat Waktu: tepat, revisi, resubmit tepat
            taskRow({
                id: "t-rev-tepat",
                submissions: [
                    sub("ID-007", 1, "DIREVISI", new Date(now - 2 * DAY), new Date(now + 5 * DAY)),
                    sub("ID-007", 2, "PENDING", new Date(now - 1 * DAY), null),
                ],
            }),
            // Overdue: revisi dikerjakan ulang tapi telat
            taskRow({
                id: "t-rev-telat",
                submissions: [
                    sub("ID-007", 1, "DIREVISI", new Date(now - 9 * DAY), new Date(now - 8 * DAY)),
                    sub("ID-007", 2, "PENDING", new Date(now - 7 * DAY), null),
                ],
            }),
        ];
        mocked.meetingTask.findMany
            .mockResolvedValueOnce(rows as never)
            .mockResolvedValueOnce([
                taskRow({
                    id: "t-lama",
                    deadlineHistory: [{ sequence: 1, deadlineDate: new Date(now - 60 * DAY) }],
                    submissions: [],
                }),
            ] as never);
        const out = await getKinerjaPantau(empSession(), {});
        expect(out.data).toHaveLength(1);
        const row = out.data[0];
        expect(row.total).toBe(8);
        expect(row.tepat).toBe(2);
        expect(row.overdue).toBe(4);
        expect(row.tunggakan).toBe(4);
        expect(row.onProgress).toBe(2);
        expect(row.tingkatKetepatan).toBe(33.3);
        expect(row.rataPengumpulan).toBeGreaterThan(0);
        expect(row.tasks.find((t) => t.taskId === "t-antre")?.status).toBe("Tunggakan");
        expect(row.tasks.find((t) => t.taskId === "t-rev-tunggu")?.status).toBe("Tunggakan");
        expect(row.tasks.find((t) => t.taskId === "t-antre")?.masihBerjalan).toBe(true);
        expect(row.tasks.find((t) => t.taskId === "t-rev-tunggu")?.masihBerjalan).toBe(true);
        expect(row.tasks.find((t) => t.taskId === "t-tepat")?.masihBerjalan).toBe(false);
        expect(out.tunggakanLalu).toHaveLength(1);
        expect(out.tunggakanLalu[0].taskCount).toBe(1);
        expect(out.tunggakanLalu[0].employeeCount).toBe(1);
    });

    it("melewati karyawan nonaktif dan WIG", async () => {
        monitorIds(["ID-007"]);
        const off = taskRow({ id: "t-off", assignees: [{ employeeId: "ID-009", status: "OPEN", employee: { ...emp("Nonaktif"), isActive: false } }] });
        const wig = taskRow({ id: "t-wig", assignees: [{ employeeId: "WIG001", status: "OPEN", employee: emp("Wig") }] });
        mocked.meetingTask.findMany.mockResolvedValueOnce([off, wig] as never).mockResolvedValueOnce([] as never);
        const out = await getKinerjaPantau(empSession(), {});
        expect(out.data).toHaveLength(0);
    });

    it("tanggal tidak valid memakai bulan berjalan", async () => {
        monitorIds(["ID-007"]);
        mocked.meetingTask.findMany.mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);
        const out = await getKinerjaPantau(empSession(), { from: "salah", to: "salah" });
        expect(out.period.from).toMatch(/^\d{4}-\d{2}-01$/);
        expect(out.data).toEqual([]);
    });
});

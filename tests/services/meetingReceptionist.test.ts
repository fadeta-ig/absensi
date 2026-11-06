import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        employee: { findUnique: vi.fn(), findMany: vi.fn() },
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
    getMeetingReceptionistEmployeeIds,
    getMeetingReceptionistInfos,
    invalidateMeetingReceptionistsCache,
    isMeetingReceptionist,
    removeMeetingReceptionist,
    setMeetingReceptionists,
} from "@/lib/services/appSettingsService";

const mocked = prisma as unknown as {
    appSetting: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
    employee: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
};

function empSession(over: Record<string, unknown> = {}) {
    return {
        userId: "u-9",
        username: "ID-25020044",
        primaryRole: "EMPLOYEE_USER",
        roles: ["EMPLOYEE_USER"],
        permissions: ["employee.self"],
        employeeId: "ID-25020044",
        ...over,
    } as never;
}

function receptionistIds(ids: string[]) {
    mocked.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify(ids) } as never);
    mocked.employee.findUnique.mockResolvedValue({ isActive: true } as never);
}

beforeEach(() => {
    vi.resetAllMocks();
    invalidateMeetingReceptionistsCache();
});

describe("meeting receptionists settings", () => {
    it("daftar kosong bila setting belum ada", async () => {
        mocked.appSetting.findUnique.mockResolvedValue(null);
        await expect(getMeetingReceptionistEmployeeIds()).resolves.toEqual([]);
    });
    it("bukan anggota daftar = bukan resepsionis", async () => {
        receptionistIds(["ID-001"]);
        await expect(isMeetingReceptionist(empSession())).resolves.toBe(false);
    });
    it("anggota aktif = resepsionis", async () => {
        receptionistIds(["ID-25020044"]);
        await expect(isMeetingReceptionist(empSession())).resolves.toBe(true);
    });
    it("anggota nonaktif = bukan resepsionis", async () => {
        receptionistIds(["ID-25020044"]);
        mocked.employee.findUnique.mockResolvedValue({ isActive: false } as never);
        await expect(isMeetingReceptionist(empSession())).resolves.toBe(false);
    });
    it("tanpa employeeId = bukan resepsionis", async () => {
        receptionistIds(["ID-25020044"]);
        await expect(isMeetingReceptionist(empSession({ employeeId: null }))).resolves.toBe(false);
    });
    it("menolak lebih dari 5", async () => {
        await expect(setMeetingReceptionists(["1", "2", "3", "4", "5", "6"], "u-1")).rejects.toMatchObject({ statusCode: 409 });
    });
    it("setuju bila menulis daftar valid", async () => {
        mocked.employee.findUnique.mockResolvedValue({ employeeId: "ID-25020044", isActive: true, userAccount: { id: "u-9" } } as never);
        mocked.appSetting.upsert.mockResolvedValue({} as never);
        const out = await setMeetingReceptionists(["ID-25020044"], "u-1");
        expect(out.employeeIds).toEqual(["ID-25020044"]);
    });
    it("infos memetakan nama + status", async () => {
        receptionistIds(["ID-25020044"]);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-25020044", name: "Daffa", isActive: true, email: "a@b.c" }] as never);
        const infos = await getMeetingReceptionistInfos();
        expect(infos).toEqual([{ employeeId: "ID-25020044", name: "Daffa", isActive: true, email: "a@b.c" }]);
    });
    it("remove mengeluarkan satu ID", async () => {
        receptionistIds(["ID-25020044", "ID-008"]);
        mocked.appSetting.upsert.mockResolvedValue({} as never);
        const out = await removeMeetingReceptionist("ID-25020044", "u-1");
        expect(out.employeeIds).toEqual(["ID-008"]);
    });
});

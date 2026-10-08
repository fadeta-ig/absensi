import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        employee: { findUnique: vi.fn(), findMany: vi.fn() },
        meetingRoom: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        meetingAppointment: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            count: vi.fn(),
        },
        meetingAppointmentParticipant: { findMany: vi.fn(), update: vi.fn() },
        meetingAppointmentRevision: { count: vi.fn(), create: vi.fn() },
        employeeUnavailability: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
        leaveRequest: { findMany: vi.fn() },
        auditLog: { create: vi.fn() },
        userAccount: { findMany: vi.fn() },
        pushSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
        appointmentReminderLog: { create: vi.fn() },
        $transaction: vi.fn(),
        $queryRaw: vi.fn(),
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
    AppointmentError,
    MAX_APPOINTMENT_PICS,
    createAppointment,
    getAppointmentPicIds,
    getReminderOffsets,
    invalidateAppointmentPicCache,
    invalidateReminderOffsetsCache,
    isAppointmentPic,
    normalizeRoomName,
    rescheduleAppointment,
    setAppointmentPics,
    setReminderOffsets,
    slotToDates,
} from "@/lib/services/appointmentService";

const mocked = vi.mocked(prisma, true);

function empSession(over: Record<string, unknown> = {}) {    return {
        userId: "u-1",
        username: "ID-001",
        name: "Pegawai",
        primaryRole: "EMPLOYEE_USER",
        roles: ["EMPLOYEE_USER"],
        permissions: ["employee.self"],
        employeeId: "ID-001",
        ...over,
    } as never;
}

beforeEach(() => {
    vi.resetAllMocks();
    invalidateAppointmentPicCache();
    invalidateReminderOffsetsCache();
    mocked.appSetting.findUnique.mockResolvedValue(null);
    mocked.auditLog.create.mockResolvedValue({} as never);
    mocked.meetingAppointmentRevision.count.mockResolvedValue(0);
    mocked.meetingAppointmentRevision.create.mockResolvedValue({} as never);
});

describe("slotToDates", () => {
    it("full-day menjadi 00:00–23:59 WIB", () => {
        const { startAt, endAt } = slotToDates({ date: "2026-10-20", startTime: "00:00", endTime: "00:00", isFullDay: true });
        expect(startAt.getHours()).toBe(0);
        expect(endAt.getHours()).toBe(23);
    });
    it("end <= start ditolak 400", () => {
        expect(() => slotToDates({ date: "2026-10-20", startTime: "10:00", endTime: "09:00" })).toThrowError(AppointmentError);
    });
    it("tanggal invalid ditolak 400", () => {
        expect(() => slotToDates({ date: "2026-13-40", startTime: "10:00", endTime: "11:00" })).toThrowError(AppointmentError);
    });
});

describe("PIC max 2", () => {
    it(`menolak lebih dari ${MAX_APPOINTMENT_PICS}`, async () => {
        await expect(setAppointmentPics(["A", "B", "C"], { userId: "u", username: "WIG002" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("menolak kandidat nonaktif/outsource 422", async () => {
        mocked.employee.findUnique.mockResolvedValue(null);
        await expect(setAppointmentPics(["X"], { userId: "u", username: "WIG002" })).rejects.toMatchObject({ statusCode: 422 });
    });
    it("menyimpan daftar valid + invalidate cache", async () => {
        mocked.employee.findUnique.mockResolvedValue({ employeeId: "ID-002", isActive: true, userAccount: { id: "u2", username: "ID-002", isActive: true } } as never);
        const ids = await setAppointmentPics(["ID-002"], { userId: "u", username: "WIG002" });
        expect(ids).toEqual(["ID-002"]);
        expect(mocked.appSetting.upsert).toHaveBeenCalledTimes(1);
    });
    it("getAppointmentPicIds parse + cache", async () => {
        mocked.appSetting.findUnique.mockResolvedValue({ key: "k", value: JSON.stringify(["ID-002"]) } as never);
        await expect(getAppointmentPicIds()).resolves.toEqual(["ID-002"]);
        mocked.appSetting.findUnique.mockResolvedValue({ key: "k", value: JSON.stringify(["ZZZ"]) } as never);
        await expect(getAppointmentPicIds()).resolves.toEqual(["ID-002"]); // cache
    });
    it("isAppointmentPic false bila tidak terdaftar", async () => {
        mocked.appSetting.findUnique.mockResolvedValue({ key: "k", value: JSON.stringify(["ID-002"]) } as never);
        await expect(isAppointmentPic(empSession())).resolves.toBe(false);
    });
});

describe("createAppointment langsung SCHEDULED", () => {
    it("status selalu SCHEDULED + audit mencatatnya", async () => {
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        const tx = {
            meetingAppointment: {
                findFirst: vi.fn().mockResolvedValue(null),
                findMany: vi.fn().mockResolvedValue([]),
                create: vi.fn().mockResolvedValue({ id: "a9", status: "SCHEDULED" }),
            },
            employeeUnavailability: { findMany: vi.fn().mockResolvedValue([]) },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        const out = (await createAppointment(
            empSession(),
            { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [] },
            false
        )) as { status: string };
        expect(out.status).toBe("SCHEDULED");
        expect(tx.meetingAppointment.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: "SCHEDULED" }) })
        );
    });
});

describe("createAppointment", () => {
    it("tanpa room dan tanpa link ditolak 400", async () => {
        await expect(
            createAppointment(empSession(), { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", participants: [] }, false)
        ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("overlap ruangan ditolak 409 untuk employee", async () => {
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        mocked.meetingAppointment.findFirst.mockResolvedValue({ id: "bentrok" } as never);
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) =>
            callback({ meetingAppointment: mocked.meetingAppointment, auditLog: mocked.auditLog } as never)
        );
        await expect(
            createAppointment(empSession(), { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [] }, false)
        ).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe("rescheduleAppointment", () => {
    it("alasan pendek ditolak 400", async () => {
        await expect(
            rescheduleAppointment(empSession(), "a1", { date: "2026-12-02", startTime: "10:00", endTime: "11:00", changeReason: "x" }, { userId: "u", username: "ID-001" })
        ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("online tanpa link ditolak 400", async () => {
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            meetingAppointment: {
                findUnique: vi.fn().mockResolvedValue({ id: "a1", status: "APPROVED", requesterEmployeeId: "ID-001", roomId: "r1", meetingLink: null, startAt: new Date(Date.now() + 7200000), endAt: new Date(Date.now() + 10800000) }),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        const wig = empSession({ username: "WIG002", employeeId: null, permissions: ["ga.manage"] });
        await expect(
            rescheduleAppointment(wig, "a1", { date: "2026-12-02", startTime: "10:00", endTime: "11:00", roomId: null, changeReason: "pindah online" }, { userId: "u", username: "WIG002" })
        ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("absensi sebelum mulai ditolak 400", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1",
            requesterEmployeeId: "ID-001",
            startAt: new Date(Date.now() + 3600000),
            endAt: new Date(Date.now() + 7200000),
            status: "SCHEDULED",
            participants: [{ id: "p1" }],
        } as never);
        const { markAttendance } = await import("@/lib/services/appointmentService");
        await expect(
            markAttendance(empSession(), "a1", [{ participantId: "p1", attendance: "HADIR" }], { userId: "u", username: "ID-001" })
        ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("absensi saat berlangsung boleh", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1",
            requesterEmployeeId: "ID-001",
            startAt: new Date(Date.now() - 600000),
            endAt: new Date(Date.now() + 3600000),
            status: "SCHEDULED",
            participants: [{ id: "p1" }],
        } as never);
        mocked.meetingAppointmentParticipant.update.mockResolvedValue({ id: "p1" } as never);
        mocked.meetingAppointmentParticipant.findMany.mockResolvedValue([{ id: "p1", employeeId: "ID-001", guestName: null, attendance: "HADIR" }] as never);
        const { markAttendance } = await import("@/lib/services/appointmentService");
        const out = (await markAttendance(empSession(), "a1", [{ participantId: "p1", attendance: "HADIR" }], { userId: "u", username: "ID-001" })) as Array<{ id: string }>;
        expect(out).toHaveLength(1);
    });
});

describe("null employeeId tidak disamakan dengan pemilik", () => {
    it("markAttendance: sesi tanpa employeeId yang bukan operator ditolak 403", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1",
            requesterEmployeeId: null,
            endAt: new Date(Date.now() + 3600000),
            status: "APPROVED",
            participants: [{ id: "p1" }],
        } as never);
        const noEmp = empSession({ employeeId: null, username: "WIG999", permissions: [] });
        await expect(
            (async () => {
                const { markAttendance } = await import("@/lib/services/appointmentService");
                return markAttendance(noEmp, "a1", [{ participantId: "p1", attendance: "HADIR" }], { userId: "u", username: "WIG999" });
            })()
        ).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("reminder offsets", () => {
    it("default [1440] bila kosong", async () => {
        mocked.appSetting.findUnique.mockResolvedValue(null);
        await expect(getReminderOffsets()).resolves.toEqual([1440]);
    });
    it("menolak >5 entri 409", async () => {
        await expect(setReminderOffsets([1, 2, 3, 4, 5, 6].map((m) => m * 60), { userId: "u", username: "ID-002" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("normalizeRoomName", () => {
        expect(normalizeRoomName("  Ruang  Rapat ")).toBe("ruang rapat");
    });
});

describe("respondInvite (RSVP peserta)", () => {
    it("bukan peserta ditolak 403", async () => {
        const { respondInvite } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({ id: "a1", title: "R", status: "APPROVED", requesterEmployeeId: "ID-001", participants: [] } as never);
        await expect(respondInvite(empSession({ employeeId: "ID-009" }), "a1", "ACCEPT", null, { userId: "u", username: "ID-009" })).rejects.toMatchObject({ statusCode: 403 });
    });
    it("acara CANCELLED ditolak 409", async () => {
        const { respondInvite } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({ id: "a1", title: "R", status: "CANCELLED", requesterEmployeeId: "ID-001", participants: [{ id: "p1", inviteStatus: "PENDING" }] } as never);
        await expect(respondInvite(empSession(), "a1", "ACCEPT", null, { userId: "u", username: "ID-001" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("ACCEPT happy path menulis inviteStatus", async () => {
        const { respondInvite } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({ id: "a1", title: "R", status: "APPROVED", requesterEmployeeId: "ID-001", participants: [{ id: "p1", inviteStatus: "PENDING" }] } as never);
        mocked.meetingAppointmentParticipant.update.mockResolvedValue({ id: "p1", inviteStatus: "ACCEPTED" } as never);
        const out = (await respondInvite(empSession(), "a1", "ACCEPT", null, { userId: "u", username: "ID-001" })) as { inviteStatus: string };
        expect(out.inviteStatus).toBe("ACCEPTED");
        expect(mocked.meetingAppointmentParticipant.update).toHaveBeenCalledWith({
            where: { id: "p1" },
            data: { inviteStatus: "ACCEPTED", inviteRespondedAt: expect.any(Date), inviteNote: null },
        });
    });
});

describe("hasEmployeeOverlap", () => {    it("mendeteksi peserta bentrok", async () => {
        const { hasEmployeeOverlap } = await import("@/lib/services/appointmentService");
        const tx = {
            meetingAppointment: {
                findMany: vi.fn().mockResolvedValue([{ id: "b1", requesterEmployeeId: null, participants: [{ employeeId: "ID-002" }] }]),
            },
        };
        const out = await hasEmployeeOverlap(tx as never, ["ID-002"], new Date("2026-12-01T10:00:00+07:00"), new Date("2026-12-01T11:00:00+07:00"));
        expect(out).toEqual([{ appointmentId: "b1", employeeId: "ID-002" }]);
    });
    it("kosong bila tidak ada id", async () => {
        const { hasEmployeeOverlap } = await import("@/lib/services/appointmentService");
        const tx = { meetingAppointment: { findMany: vi.fn() } };
        await expect(hasEmployeeOverlap(tx as never, [], new Date(), new Date())).resolves.toEqual([]);
        expect(tx.meetingAppointment.findMany).not.toHaveBeenCalled();
    });
});

describe("respondInvite final", () => {
    it("respons kedua ditolak 409 (final)", async () => {
        const { respondInvite } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({ id: "a1", title: "R", status: "SCHEDULED", requesterEmployeeId: "ID-001", participants: [{ id: "p1", inviteStatus: "ACCEPTED" }] } as never);
        await expect(respondInvite(empSession(), "a1", "DECLINE", "Berubah pikiran", { userId: "u", username: "ID-001" })).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe("appointmentInviteResponseSchema", () => {    it("DECLINE wajib alasan min 5, ACCEPT boleh tanpa note, TENTATIVE ditolak", async () => {
        const { appointmentInviteResponseSchema } = await import("@/lib/validations/validationSchemas");
        expect(appointmentInviteResponseSchema.safeParse({ action: "ACCEPT" }).success).toBe(true);
        expect(appointmentInviteResponseSchema.safeParse({ action: "DECLINE", note: "x" }).success).toBe(false);
        expect(appointmentInviteResponseSchema.safeParse({ action: "DECLINE", note: "Bentrok dengan direksi" }).success).toBe(true);
        expect(appointmentInviteResponseSchema.safeParse({ action: "TENTATIVE" }).success).toBe(false);
    });
});

describe("EmployeeUnavailability (blokir sibuk mandiri)", () => {
    it("rentang terbalik ditolak 400", async () => {
        const { createUnavailability } = await import("@/lib/services/appointmentService");
        await expect(createUnavailability(empSession(), { startDate: "2026-12-05", endDate: "2026-12-01" })).rejects.toMatchObject({ statusCode: 400 });
    });
    it("overlap blokir sendiri ditolak 409", async () => {
        const { createUnavailability } = await import("@/lib/services/appointmentService");
        mocked.employeeUnavailability.findFirst.mockResolvedValue({ id: "b1" } as never);
        await expect(createUnavailability(empSession(), { startDate: "2026-12-01", endDate: "2026-12-03" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("hapus milik orang lain 404", async () => {
        const { deleteUnavailability } = await import("@/lib/services/appointmentService");
        mocked.employeeUnavailability.deleteMany.mockResolvedValue({ count: 0 } as never);
        await expect(deleteUnavailability(empSession(), "bx")).rejects.toMatchObject({ statusCode: 404 });
    });
    it("busyBlockEmployeeIds menemukan pemblokir", async () => {
        const { busyBlockEmployeeIds } = await import("@/lib/services/appointmentService");
        const tx = { employeeUnavailability: { findMany: vi.fn().mockResolvedValue([{ employeeId: "ID-002" }]) } };
        await expect(
            busyBlockEmployeeIds(tx as never, ["ID-002"], new Date("2026-12-01T10:00:00+07:00"), new Date("2026-12-01T11:00:00+07:00"))
        ).resolves.toEqual(["ID-002"]);
    });
});

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
    createAppointment,
    getReminderOffsets,
    invalidateReminderOffsetsCache,
    normalizeRoomName,
    rescheduleAppointment,
    setMeetingLeader,
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

beforeEach(async () => {
    vi.resetAllMocks();
    invalidateReminderOffsetsCache();
    const { invalidateMeetingReceptionistsCache } = await import("@/lib/services/appSettingsService");
    invalidateMeetingReceptionistsCache();
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

describe("createAppointment langsung SCHEDULED", () => {
    it("status selalu SCHEDULED + audit mencatatnya", async () => {
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-002", isActive: true }] as never);
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
            { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-002" }], notulisEmployeeId: "ID-002", leaderEmployeeId: "ID-002" },
            false
        )) as { status: string };
        expect(out.status).toBe("SCHEDULED");
        expect(tx.meetingAppointment.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: "SCHEDULED" }) })
        );
    });
});

describe("createAppointment", () => {
    it("tanpa ruangan ditolak 400", async () => {
        await expect(
            createAppointment(empSession(), { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", participants: [] }, false)
        ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("diri sendiri sebagai peserta ditolak 400", async () => {
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-001", isActive: true }] as never);
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        await expect(
            createAppointment(
                empSession(),
                { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-001" }] },
                false
            )
        ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("overlap ruangan ditolak 409 untuk employee", async () => {
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-002", isActive: true }] as never);
        mocked.meetingAppointment.findFirst.mockResolvedValue({ id: "bentrok" } as never);
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) =>
            callback({ meetingAppointment: mocked.meetingAppointment, auditLog: mocked.auditLog } as never)
        );
        await expect(
            createAppointment(empSession(), { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-002" }], notulisEmployeeId: "ID-002", leaderEmployeeId: "ID-002" }, false)
        ).rejects.toMatchObject({ statusCode: 409 });
    });
    it("duplikat insert konkuren (P2002) dipetakan 409", async () => {
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-002", isActive: true }] as never);
        const tx = {
            meetingAppointment: {
                findFirst: vi.fn().mockResolvedValue(null),
                findMany: vi.fn().mockResolvedValue([]),
                create: vi.fn().mockRejectedValue({ code: "P2002" }),
            },
            employeeUnavailability: { findMany: vi.fn().mockResolvedValue([]) },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        await expect(
            createAppointment(empSession(), { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-002" }], notulisEmployeeId: "ID-002", leaderEmployeeId: "ID-002" }, false)
        ).rejects.toMatchObject({ statusCode: 409 });
    });
    it("tanpa PIC notulensi ditolak 400", async () => {
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-002", isActive: true }] as never);
        await expect(
            createAppointment(empSession(), { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-002" }] }, false)
        ).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe("setMeetingLeader", () => {
    const leaderRow = () => {
        const now = Date.now();
        return {
            id: "a1", status: "SCHEDULED",
            startAt: new Date(now + 3600_000), endAt: new Date(now + 7200_000),
            requesterEmployeeId: "ID-001", leaderEmployeeId: null,
            participants: [{ employeeId: "ID-002" }, { employeeId: "ID-003" }],
        };
    };
    it("penyelenggara dapat menunjuk pimpinan rapat dari peserta", async () => {
        mocked.meetingAppointment.findUnique
            .mockResolvedValueOnce(leaderRow() as never)
            .mockResolvedValueOnce({ ...leaderRow(), leaderEmployeeId: "ID-002", room: null, requester: null } as never);
        mocked.meetingAppointment.update.mockResolvedValue({ id: "a1" } as never);
        await setMeetingLeader(empSession(), "a1", "ID-002", { userId: "u-1", username: "ID-001" });
        expect(mocked.meetingAppointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { leaderEmployeeId: "ID-002" } }));
    });
    it("bukan penyelenggara/pimpinan rapat ditolak 403", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(leaderRow() as never);
        await expect(setMeetingLeader(empSession({ employeeId: "ID-003", username: "ID-003" }), "a1", "ID-002", { userId: "u-3", username: "ID-003" })).rejects.toMatchObject({ statusCode: 403 });
    });
    it("pimpinan rapat di luar peserta ditolak 422", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(leaderRow() as never);
        await expect(setMeetingLeader(empSession(), "a1", "ID-999", { userId: "u-1", username: "ID-001" })).rejects.toMatchObject({ statusCode: 422 });
    });
    it("pimpinan rapat tidak dapat dikosongkan = 400", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(leaderRow() as never);
        await expect(setMeetingLeader(empSession(), "a1", "", { userId: "u-1", username: "ID-001" })).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe("rescheduleAppointment", () => {
    it("alasan pendek ditolak 400", async () => {
        await expect(
            rescheduleAppointment(empSession(), "a1", { date: "2026-12-02", startTime: "10:00", endTime: "11:00", changeReason: "x" }, { userId: "u", username: "ID-001" })
        ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("ruangan kosong saat jadwal ulang ditolak 400", async () => {
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            meetingAppointment: {
                findUnique: vi.fn().mockResolvedValue({ id: "a1", status: "APPROVED", requesterEmployeeId: "ID-001", roomId: "r1", meetingLink: null, startAt: new Date(Date.now() + 7200000), endAt: new Date(Date.now() + 10800000) }),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        const wig = empSession({ username: "WIG002", employeeId: null, permissions: ["ga.manage"] });
        await expect(
            rescheduleAppointment(wig, "a1", { date: "2026-12-02", startTime: "10:00", endTime: "11:00", roomId: null, changeReason: "pindah ruangan" }, { userId: "u", username: "WIG002" })
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
    it("menolak array kosong 400", async () => {
        await expect(setReminderOffsets([], { userId: "u", username: "ID-002" })).rejects.toMatchObject({ statusCode: 400 });
    });
    it("parseReminderOffsets: sort desc, dedup, slice 5, fallback default", async () => {
        const { parseReminderOffsets } = await import("@/lib/services/appointmentService");
        expect(parseReminderOffsets("[60,1440]")).toEqual([1440, 60]);
        expect(parseReminderOffsets("[30,30,60]")).toEqual([60, 30]);
        expect(parseReminderOffsets("[10,5]")).toEqual([]);
        expect(parseReminderOffsets("bukan-json")).toEqual([1440]);
        expect(parseReminderOffsets(null)).toEqual([1440]);
        expect(parseReminderOffsets("[1,2,3,4,5,6,7,8]".replace(/\d+/g, (m) => String(Number(m) * 60)))).toHaveLength(5);
    });
    it("isReminderOffsetDue: jendela (offset-15, offset]", async () => {
        const { isReminderOffsetDue } = await import("@/lib/services/appointmentService");
        expect(isReminderOffsetDue(60, 60)).toBe(true);
        expect(isReminderOffsetDue(60, 46)).toBe(true);
        expect(isReminderOffsetDue(60, 45)).toBe(false);
        expect(isReminderOffsetDue(60, 61)).toBe(false);
        expect(isReminderOffsetDue(60, 0)).toBe(false);
        expect(isReminderOffsetDue(1440, 1430)).toBe(true);
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
    it("DECLINE tanpa alasan ditolak 400 (defense-in-depth service)", async () => {
        const { respondInvite } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1",
            title: "R",
            status: "SCHEDULED",
            endAt: new Date(Date.now() + 3600000),
            requesterEmployeeId: "ID-009",
            participants: [{ id: "p1", inviteStatus: "PENDING" }],
        } as never);
        await expect(respondInvite(empSession(), "a1", "DECLINE", null, { userId: "u", username: "ID-001" })).rejects.toMatchObject({ statusCode: 400 });
        await expect(respondInvite(empSession(), "a1", "DECLINE", "ok", { userId: "u", username: "ID-001" })).rejects.toMatchObject({ statusCode: 400 });
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
        const tx = {
            employeeUnavailability: {
                findFirst: vi.fn().mockResolvedValue({ id: "b1" }),
                create: vi.fn(),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
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

describe("rescheduleAppointment saat berjalan", () => {
    it("IN_PROGRESS ditolak 409 dengan pesan jelas", async () => {
        const { rescheduleAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([{ id: "a1" }]),
            meetingAppointment: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "a1",
                    status: "SCHEDULED",
                    requesterEmployeeId: "ID-001",
                    roomId: "r1",
                    meetingLink: null,
                    startAt: new Date(Date.now() - 600000),
                    endAt: new Date(Date.now() + 3600000),
                }),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        await expect(
            rescheduleAppointment(empSession(), "a1", { date: "2026-12-02", startTime: "10:00", endTime: "11:00", roomId: "r1", changeReason: "perubahan mendesak" }, { userId: "u", username: "ID-001" })
        ).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe("getAppointments urutan & pagination riwayat", () => {
    it("riwayat terbaru dulu, deterministik, dan halaman dijepit ke rentang yang ada", async () => {
        const { getAppointments } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.count.mockResolvedValue(3 as never);
        mocked.meetingAppointment.findMany.mockResolvedValue([] as never);
        const result = await getAppointments(empSession(), { history: true, sort: "newest", page: 99, limit: 2 });
        expect(result).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
        expect(mocked.meetingAppointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: [{ startAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
            skip: 2,
            take: 2,
        }));
        const call = mocked.meetingAppointment.findMany.mock.calls.at(-1)?.[0] as { where: { AND: unknown[] } };
        expect(JSON.stringify(call.where.AND)).toContain("CANCELLED");
    });
    it("bawaan tetap terdekat dulu untuk meeting mendatang", async () => {
        const { getAppointments } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.count.mockResolvedValue(0 as never);
        mocked.meetingAppointment.findMany.mockResolvedValue([] as never);
        await getAppointments(empSession(), {});
        expect(mocked.meetingAppointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: [{ startAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        }));
    });
    it("jadwal non-history menyertakan meeting SCHEDULED aktif karyawan lain + detail dapat dibuka read-only", async () => {
        const { buildMeetingWhere, getAppointmentDetail } = await import("@/lib/services/appointmentService");
        const activeWhere = buildMeetingWhere(empSession({ employeeId: "ID-009" }), {}, false);
        expect(activeWhere.AND).toEqual([
            {
                OR: [
                    { status: "SCHEDULED", endAt: { gt: expect.any(Date) } },
                    { requesterEmployeeId: "ID-009" },
                    { participants: { some: { employeeId: "ID-009" } } },
                ],
            },
        ]);
        const historyWhere = buildMeetingWhere(empSession({ employeeId: "ID-009" }), { history: true }, false);
        expect(historyWhere.AND).toContainEqual({
            OR: [
                { requesterEmployeeId: "ID-009" },
                { participants: { some: { employeeId: "ID-009" } } },
            ],
        });

        const now = Date.now();
        mocked.meetingAppointment.findUnique.mockResolvedValueOnce({
            id: "a-other",
            title: "Meeting Divisi Lain",
            status: "SCHEDULED",
            startAt: new Date(now + 3600_000),
            endAt: new Date(now + 7200_000),
            requesterEmployeeId: "ID-001",
            requester: { name: "Employee A" },
            room: { id: "r1", name: "Ruang A", capacity: 10, location: "Lt 2" },
            participants: [{ id: "p1", employeeId: "ID-002", guestName: null, isExternal: false, attendance: "BELUM", inviteStatus: "ACCEPTED", inviteRespondedAt: null, inviteNote: null, employee: { name: "Employee C" } }],
        } as never);
        const detail = (await getAppointmentDetail(empSession({ employeeId: "ID-009" }), "a-other")) as { id: string; canAccessWorkspace: boolean };
        expect(detail.id).toBe("a-other");
        expect(detail.canAccessWorkspace).toBe(false);

        mocked.meetingAppointment.findUnique.mockResolvedValueOnce({
            id: "a-past-other",
            title: "Meeting Selesai",
            status: "COMPLETED",
            startAt: new Date(now - 7200_000),
            endAt: new Date(now - 3600_000),
            requesterEmployeeId: "ID-001",
            requester: { name: "Employee A" },
            room: { id: "r1", name: "Ruang A", capacity: 10, location: "Lt 2" },
            participants: [],
        } as never);
        await expect(getAppointmentDetail(empSession({ employeeId: "ID-009" }), "a-past-other")).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("rescheduleAppointment pimpinan rapat/PIC", () => {
    it("pimpinan rapat di luar peserta hasil edit ditolak 422", async () => {
        const { rescheduleAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-002", isActive: true }] as never);
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([{ id: "a1" }]),
            meetingAppointment: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "a1", title: "T", agenda: null, isFullDay: false, status: "SCHEDULED",
                    requesterEmployeeId: "ID-001", leaderEmployeeId: null, notulisEmployeeId: null,
                    roomId: "r1", meetingLink: null,
                    startAt: new Date("2027-01-01T03:00:00.000Z"), endAt: new Date("2027-01-01T04:00:00.000Z"),
                }),
            },
            meetingAppointmentParticipant: {
                findMany: vi.fn().mockResolvedValue([{ id: "p1", employeeId: "ID-002", guestName: null, isExternal: false }]),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        await expect(
            rescheduleAppointment(empSession(), "a1", {
                date: "2027-01-01", startTime: "10:00", endTime: "11:00", roomId: "r1",
                participants: [{ employeeId: "ID-002" }], leaderEmployeeId: "ID-999", notulisEmployeeId: "ID-002",
            }, { userId: "u", username: "ID-001" })
        ).rejects.toMatchObject({ statusCode: 422 });
    });
});

describe("completeAppointment", () => {
    it("bukan pembuat ditolak 403", async () => {
        const { completeAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1", title: "T", status: "SCHEDULED", requesterEmployeeId: "ID-002",
            roomId: null, startAt: new Date(Date.now() - 600000), endAt: new Date(Date.now() + 3600000),
        } as never);
        await expect(completeAppointment(empSession(), "a1", { userId: "u", username: "ID-001" })).rejects.toMatchObject({ statusCode: 403 });
    });
    it("belum mulai ditolak 409", async () => {
        const { completeAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1", title: "T", status: "SCHEDULED", requesterEmployeeId: "ID-001",
            roomId: null, startAt: new Date(Date.now() + 3600000), endAt: new Date(Date.now() + 7200000),
        } as never);
        await expect(completeAppointment(empSession(), "a1", { userId: "u", username: "ID-001" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("sudah selesai/dibatalkan ditolak 409", async () => {
        const { completeAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1", title: "T", status: "COMPLETED", requesterEmployeeId: "ID-001",
            roomId: null, startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000),
        } as never);
        await expect(completeAppointment(empSession(), "a1", { userId: "u", username: "ID-001" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("pembuat saat berjalan berhasil COMPLETED", async () => {
        const { completeAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1", title: "T", status: "SCHEDULED", requesterEmployeeId: "ID-001",
            roomId: null, startAt: new Date(Date.now() - 600000), endAt: new Date(Date.now() + 3600000),
        } as never);
        const tx = {
            meetingAppointment: {
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                findUnique: vi.fn().mockResolvedValue({ id: "a1", status: "COMPLETED" }),
            },
            meetingAppointmentRevision: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        const out = (await completeAppointment(empSession(), "a1", { userId: "u", username: "ID-001" })) as { status: string };
        expect(out.status).toBe("COMPLETED");
        expect(tx.meetingAppointment.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) })
        );
    });
});

describe("respondInvite kedaluwarsa", () => {
    it("lewat endAt ditolak 409", async () => {
        const { respondInvite } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1", title: "T", status: "SCHEDULED",
            endAt: new Date(Date.now() - 60000),
            requesterEmployeeId: "ID-002",
            participants: [{ id: "p1", inviteStatus: "PENDING" }],
        } as never);
        await expect(respondInvite(empSession(), "a1", "ACCEPT", null, { userId: "u", username: "ID-001" })).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe("rescheduleAppointment dengan tambah/hapus peserta", () => {
    it("menghapus peserta yang dikeluarkan, menambah peserta baru, dan mempertahankan peserta lama", async () => {
        mocked.employee.findMany.mockResolvedValue([
            { employeeId: "ID-002", isActive: true },
            { employeeId: "ID-004", isActive: true },
        ] as never);
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            meetingAppointment: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "a1",
                    status: "SCHEDULED",
                    requesterEmployeeId: "ID-001",
                    roomId: "r1",
                    meetingLink: null,
                    startAt: new Date(Date.now() + 7200000),
                    endAt: new Date(Date.now() + 10800000),
                }),
                findFirst: vi.fn().mockResolvedValue(null),
                findMany: vi.fn().mockResolvedValue([]),
                update: vi.fn().mockResolvedValue({ id: "a1", status: "SCHEDULED" }),
            },
            meetingAppointmentParticipant: {
                findMany: vi.fn().mockResolvedValue([
                    { id: "p-keep", employeeId: "ID-002", guestName: null, isExternal: false },
                    { id: "p-remove", employeeId: "ID-003", guestName: null, isExternal: false },
                ]),
                deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                create: vi.fn().mockResolvedValue({ id: "p-new" }),
                updateMany: vi.fn().mockResolvedValue({ count: 2 }),
            },
            appointmentReminderLog: {
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
            meetingAppointmentRevision: {
                count: vi.fn().mockResolvedValue(0),
                create: vi.fn().mockResolvedValue({}),
            },
            employeeUnavailability: {
                findMany: vi.fn().mockResolvedValue([]),
            },
            auditLog: {
                create: vi.fn().mockResolvedValue({}),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));

        await rescheduleAppointment(
            empSession(),
            "a1",
            {
                date: "2026-12-10",
                startTime: "10:00",
                endTime: "11:00",
                roomId: "r1",
                participants: [{ employeeId: "ID-002" }, { employeeId: "ID-004" }, { guestName: "Tamu Baru" }],
                changeReason: "Update peserta meeting",
            },
            { userId: "u-1", username: "ID-001" }
        );

        expect(tx.meetingAppointmentParticipant.deleteMany).toHaveBeenCalledWith({
            where: { id: { in: ["p-remove"] } },
        });
        expect(tx.meetingAppointmentParticipant.create).toHaveBeenCalledTimes(2);
        expect(tx.meetingAppointmentParticipant.create).toHaveBeenCalledWith({
            data: {
                appointmentId: "a1",
                employeeId: "ID-004",
                guestName: null,
                isExternal: false,
            },
        });
        expect(tx.meetingAppointmentParticipant.create).toHaveBeenCalledWith({
            data: {
                appointmentId: "a1",
                employeeId: null,
                guestName: "Tamu Baru",
                isExternal: true,
            },
        });
    });

    it("menolak apabila penyelenggara dimasukkan sebagai peserta saat edit", async () => {
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-001", isActive: true }] as never);
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            meetingAppointment: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "a1",
                    status: "SCHEDULED",
                    requesterEmployeeId: "ID-001",
                    roomId: "r1",
                    meetingLink: null,
                    startAt: new Date(Date.now() + 7200000),
                    endAt: new Date(Date.now() + 10800000),
                }),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));

        await expect(
            rescheduleAppointment(
                empSession(),
                "a1",
                {
                    date: "2026-12-10",
                    startTime: "10:00",
                    endTime: "11:00",
                    roomId: "r1",
                    participants: [{ employeeId: "ID-001" }],
                    changeReason: "Salah tambah penyelenggara",
                },
                { userId: "u-1", username: "ID-001" }
            )
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("mengizinkan tambah/hapus peserta tanpa lock (<60 menit atau sedang berlangsung) dan tanpa alasan manual bila jadwal tidak berubah", async () => {
        const { slotToDates } = await import("@/lib/services/appointmentService");
        const slot = slotToDates({ date: "2026-12-10", startTime: "10:00", endTime: "11:00", isFullDay: false });
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-005", isActive: true }] as never);
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            meetingAppointment: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "a1",
                    status: "SCHEDULED",
                    requesterEmployeeId: "ID-001",
                    roomId: "r1",
                    meetingLink: null,
                    isFullDay: false,
                    startAt: slot.startAt,
                    endAt: slot.endAt,
                }),
                findMany: vi.fn().mockResolvedValue([]),
                update: vi.fn().mockResolvedValue({ id: "a1", status: "SCHEDULED" }),
            },
            meetingAppointmentParticipant: {
                findMany: vi.fn().mockResolvedValue([
                    { id: "p-existing", employeeId: "ID-002", guestName: null, isExternal: false },
                ]),
                deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                create: vi.fn().mockResolvedValue({ id: "p-added" }),
            },
            appointmentReminderLog: {
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
            meetingAppointmentRevision: {
                count: vi.fn().mockResolvedValue(0),
                create: vi.fn().mockResolvedValue({}),
            },
            employeeUnavailability: {
                findMany: vi.fn().mockResolvedValue([]),
            },
            auditLog: {
                create: vi.fn().mockResolvedValue({}),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));

        await expect(
            rescheduleAppointment(
                empSession(),
                "a1",
                {
                    date: "2026-12-10",
                    startTime: "10:00",
                    endTime: "11:00",
                    isFullDay: false,
                    roomId: "r1",
                    participants: [{ employeeId: "ID-005" }],
                    changeReason: "",
                },
                { userId: "u-1", username: "ID-001" }
            )
        ).resolves.toMatchObject({ id: "a1" });

        expect(tx.meetingAppointmentParticipant.deleteMany).toHaveBeenCalledWith({
            where: { id: { in: ["p-existing"] } },
        });
        expect(tx.meetingAppointmentParticipant.create).toHaveBeenCalledWith({
            data: {
                appointmentId: "a1",
                employeeId: "ID-005",
                guestName: null,
                isExternal: false,
            },
        });
        expect(tx.meetingAppointmentRevision.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    changeReason: "Perubahan daftar peserta",
                }),
            })
        );
    });
});

describe("resepsionis e-meeting (penyelenggara untuk semua meeting)", () => {
    async function resetReceptionistCache(): Promise<void> {
        const { invalidateMeetingReceptionistsCache } = await import("@/lib/services/appSettingsService");
        invalidateMeetingReceptionistsCache();
    }

    function mockReceptionistListed(employeeId: string) {
        mocked.appSetting.findUnique.mockImplementation((async (args: { where?: { key?: string } }) => {
            if (args?.where?.key === "meeting.receptionists") return { value: JSON.stringify([employeeId]) };
            return null;
        }) as never);
        mocked.employee.findUnique.mockResolvedValue({ isActive: true } as never);
    }

    it("capabilities: resepsionis mendapat canManageAll", async () => {
        await resetReceptionistCache();
        mockReceptionistListed("ID-009");
        const { getEmployeeMeetingCapabilities } = await import("@/lib/services/appointmentService");
        await expect(getEmployeeMeetingCapabilities(empSession({ employeeId: "ID-009", username: "ID-009" }))).resolves.toEqual({
            canMonitor: false,
            canManageAll: true,
        });
    });

    it("getAppointments: resepsionis tanpa filter kepemilikan (termasuk history)", async () => {
        await resetReceptionistCache();
        mockReceptionistListed("ID-009");
        const { getAppointments } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.count.mockResolvedValue(0 as never);
        mocked.meetingAppointment.findMany.mockResolvedValue([] as never);
        await getAppointments(empSession({ employeeId: "ID-009", username: "ID-009" }), { history: true });
        const call = mocked.meetingAppointment.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
        expect(JSON.stringify(call.where)).not.toContain("requesterEmployeeId");
    });

    it("cancelAppointment: resepsionis boleh membatalkan meeting orang lain", async () => {
        await resetReceptionistCache();
        mockReceptionistListed("ID-009");
        const { cancelAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1", title: "T", agenda: null, isFullDay: false, status: "SCHEDULED",
            requesterEmployeeId: "ID-001", leaderEmployeeId: null, roomId: "r1",
            startAt: new Date(Date.now() + 3600000), endAt: new Date(Date.now() + 7200000),
        } as never);
        const tx = {
            meetingAppointment: {
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                findUnique: vi.fn().mockResolvedValue({ id: "a1", status: "CANCELLED" }),
            },
            meetingAppointmentRevision: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
            meetingTask: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
            meetingTaskAssignee: { updateMany: vi.fn() },
            meetingTaskRevision: { count: vi.fn(), create: vi.fn() },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        const out = (await cancelAppointment(empSession({ employeeId: "ID-009", username: "ID-009" }), "a1", "Dibatalkan atas permintaan atasan", { userId: "u-9", username: "ID-009" })) as { status: string };
        expect(out.status).toBe("CANCELLED");
    });

    it("cancelAppointment: bukan resepsionis/pemilik tetap 403", async () => {
        await resetReceptionistCache();
        mocked.appSetting.findUnique.mockResolvedValue(null);
        const { cancelAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1", title: "T", agenda: null, isFullDay: false, status: "SCHEDULED",
            requesterEmployeeId: "ID-001", leaderEmployeeId: null, roomId: "r1",
            startAt: new Date(Date.now() + 3600000), endAt: new Date(Date.now() + 7200000),
        } as never);
        await expect(
            cancelAppointment(empSession({ employeeId: "ID-009", username: "ID-009" }), "a1", "Coba batalkan meeting orang", { userId: "u-9", username: "ID-009" })
        ).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("D1: resepsionis bebas cek bentrok diri (ADR-020)", () => {
    function mockReceptionistListed(employeeId: string, active = true) {
        mocked.appSetting.findUnique.mockImplementation((async (args: { where?: { key?: string } }) => {
            if (args?.where?.key === "meeting.receptionists") return { value: JSON.stringify([employeeId]) };
            return null;
        }) as never);
        // findMany dipakai ganda: validasi peserta (tanpa isActive) + cek aktif drop (isActive: true).
        mocked.employee.findMany.mockImplementation((async (args: { where?: { isActive?: boolean } }) => {
            if (args?.where?.isActive === true) return active ? [{ employeeId }] : [];
            return [
                { employeeId: "ID-002", isActive: true },
                { employeeId, isActive: active },
            ];
        }) as never);
    }

    function mockCreateTx(over: Record<string, unknown> = {}) {
        const tx = {
            meetingAppointment: {
                findFirst: vi.fn().mockResolvedValue(null),
                findMany: vi.fn().mockResolvedValue([]),
                create: vi.fn().mockResolvedValue({ id: "a9", status: "SCHEDULED" }),
                ...((over.meetingAppointment ?? {}) as Record<string, unknown>),
            },
            employeeUnavailability: { findMany: vi.fn().mockResolvedValue([]) },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        return tx;
    }

    it("hasEmployeeOverlap: hit jalur requester resepsionis aktif diabaikan", async () => {
        mockReceptionistListed("ID-009");
        const { hasEmployeeOverlap } = await import("@/lib/services/appointmentService");
        const tx = {
            meetingAppointment: {
                findMany: vi.fn().mockResolvedValue([{ id: "b1", requesterEmployeeId: "ID-009", participants: [] }]),
            },
        };
        await expect(
            hasEmployeeOverlap(tx as never, ["ID-009"], new Date("2026-12-01T10:00:00+07:00"), new Date("2026-12-01T11:00:00+07:00"))
        ).resolves.toEqual([]);
    });

    it("hasEmployeeOverlap: hit jalur peserta resepsionis tetap memblokir", async () => {
        mockReceptionistListed("ID-009");
        const { hasEmployeeOverlap } = await import("@/lib/services/appointmentService");
        const tx = {
            meetingAppointment: {
                findMany: vi.fn().mockResolvedValue([{ id: "b1", requesterEmployeeId: "ID-001", participants: [{ employeeId: "ID-009" }] }]),
            },
        };
        await expect(
            hasEmployeeOverlap(tx as never, ["ID-009"], new Date("2026-12-01T10:00:00+07:00"), new Date("2026-12-01T11:00:00+07:00"))
        ).resolves.toEqual([{ appointmentId: "b1", employeeId: "ID-009" }]);
    });

    it("hasEmployeeOverlap: requester non-resepsionis tetap memblokir", async () => {
        mockReceptionistListed("ID-009");
        const { hasEmployeeOverlap } = await import("@/lib/services/appointmentService");
        const tx = {
            meetingAppointment: {
                findMany: vi.fn().mockResolvedValue([{ id: "b1", requesterEmployeeId: "ID-001", participants: [] }]),
            },
        };
        await expect(
            hasEmployeeOverlap(tx as never, ["ID-001"], new Date("2026-12-01T10:00:00+07:00"), new Date("2026-12-01T11:00:00+07:00"))
        ).resolves.toEqual([{ appointmentId: "b1", employeeId: "ID-001" }]);
    });

    it("hasEmployeeOverlap: resepsionis nonaktif tetap memblokir (mati sendiri)", async () => {
        mockReceptionistListed("ID-009", false);
        const { hasEmployeeOverlap } = await import("@/lib/services/appointmentService");
        const tx = {
            meetingAppointment: {
                findMany: vi.fn().mockResolvedValue([{ id: "b1", requesterEmployeeId: "ID-009", participants: [] }]),
            },
        };
        await expect(
            hasEmployeeOverlap(tx as never, ["ID-009"], new Date("2026-12-01T10:00:00+07:00"), new Date("2026-12-01T11:00:00+07:00"))
        ).resolves.toEqual([{ appointmentId: "b1", employeeId: "ID-009" }]);
    });

    it("createAppointment: ID pembuat resepsionis dikeluarkan dari cek orang", async () => {
        mockReceptionistListed("ID-009");
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        const tx = mockCreateTx();
        const out = (await createAppointment(
            empSession({ employeeId: "ID-009", username: "ID-009" }),
            { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-002" }], notulisEmployeeId: "ID-002", leaderEmployeeId: "ID-002" },
            false
        )) as { status: string };
        expect(out.status).toBe("SCHEDULED");
        const personCall = tx.meetingAppointment.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
        expect(JSON.stringify(personCall.where)).not.toContain("ID-009");
        expect(JSON.stringify(personCall.where)).toContain("ID-002");
        const busyCall = tx.employeeUnavailability.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
        expect(JSON.stringify(busyCall.where)).not.toContain("ID-009");
    });

    it("createAppointment: ID pembuat biasa tetap dicek (tidak berubah)", async () => {
        mocked.appSetting.findUnique.mockResolvedValue(null);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-002", isActive: true }] as never);
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        const tx = mockCreateTx();
        const out = (await createAppointment(
            empSession(),
            { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-002" }], notulisEmployeeId: "ID-002", leaderEmployeeId: "ID-002" },
            false
        )) as { status: string };
        expect(out.status).toBe("SCHEDULED");
        const personCall = tx.meetingAppointment.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
        expect(JSON.stringify(personCall.where)).toContain("ID-001");
    });

    it("createAppointment: resepsionis tetap ditolak bila ruangan bentrok", async () => {
        mockReceptionistListed("ID-009");
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        mockCreateTx({ meetingAppointment: { findFirst: vi.fn().mockResolvedValue({ id: "x" }) } });
        await expect(
            createAppointment(
                empSession({ employeeId: "ID-009", username: "ID-009" }),
                { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-002" }], notulisEmployeeId: "ID-002", leaderEmployeeId: "ID-002" },
                false
            )
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("createAppointment: resepsionis tetap ditolak bila peserta bentrok", async () => {
        mockReceptionistListed("ID-009");
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        mockCreateTx({
            meetingAppointment: {
                findMany: vi.fn().mockResolvedValue([{ id: "b1", requesterEmployeeId: "ID-007", participants: [{ employeeId: "ID-002" }] }]),
            },
        });
        await expect(
            createAppointment(
                empSession({ employeeId: "ID-009", username: "ID-009" }),
                { title: "Rapat", date: "2026-12-01", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-002" }], notulisEmployeeId: "ID-002", leaderEmployeeId: "ID-002" },
                false
            )
        ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("ID-002") as string });
    });

    it("rescheduleAppointment: requester resepsionis dikeluarkan dari cek saat jadwal berubah", async () => {
        mockReceptionistListed("ID-009");
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            meetingAppointment: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "a1",
                    title: "Rapat",
                    status: "SCHEDULED",
                    requesterEmployeeId: "ID-009",
                    leaderEmployeeId: null,
                    notulisEmployeeId: null,
                    roomId: "r1",
                    meetingLink: null,
                    isFullDay: false,
                    startAt: new Date(Date.now() + 7200000),
                    endAt: new Date(Date.now() + 10800000),
                }),
                findFirst: vi.fn().mockResolvedValue(null),
                findMany: vi.fn().mockResolvedValue([]),
                update: vi.fn().mockResolvedValue({ id: "a1", status: "SCHEDULED" }),
            },
            meetingAppointmentParticipant: {
                findMany: vi.fn().mockResolvedValue([{ id: "p1", employeeId: "ID-002", guestName: null, isExternal: false }]),
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
            meetingAppointmentRevision: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
            appointmentReminderLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            employeeUnavailability: { findMany: vi.fn().mockResolvedValue([]) },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        await rescheduleAppointment(
            empSession({ employeeId: "ID-009", username: "ID-009" }),
            "a1",
            { date: "2026-12-10", startTime: "10:00", endTime: "11:00", roomId: "r1", changeReason: "Pindah jadwal atas permintaan atasan" },
            { userId: "u-9", username: "ID-009" }
        );
        const personCall = tx.meetingAppointment.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
        expect(JSON.stringify(personCall.where)).not.toContain("ID-009");
        expect(JSON.stringify(personCall.where)).toContain("ID-002");
    });
});

describe("tiga peran meeting: PIC setara penyelenggara", () => {
    async function resetReceptionistCache(): Promise<void> {
        const { invalidateMeetingReceptionistsCache } = await import("@/lib/services/appSettingsService");
        invalidateMeetingReceptionistsCache();
    }

    it("setMeetingLeader: PIC boleh menunjuk pimpinan rapat", async () => {
        await resetReceptionistCache();
        mocked.appSetting.findUnique.mockResolvedValue(null);
        const { setMeetingLeader } = await import("@/lib/services/appointmentService");
        const row = {
            id: "a1", status: "SCHEDULED",
            startAt: new Date(Date.now() + 3600000), endAt: new Date(Date.now() + 7200000),
            requesterEmployeeId: "ID-007", leaderEmployeeId: null, notulisEmployeeId: "ID-001",
            participants: [{ employeeId: "ID-002" }],
        };
        mocked.meetingAppointment.findUnique
            .mockResolvedValueOnce(row as never)
            .mockResolvedValueOnce({ ...row, leaderEmployeeId: "ID-002" } as never);
        mocked.meetingAppointment.update.mockResolvedValue({ id: "a1" } as never);
        await setMeetingLeader(empSession(), "a1", "ID-002", { userId: "u-1", username: "ID-001" });
        expect(mocked.meetingAppointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { leaderEmployeeId: "ID-002" } }));
    });

    it("cancelAppointment: PIC boleh membatalkan meeting", async () => {
        await resetReceptionistCache();
        mocked.appSetting.findUnique.mockResolvedValue(null);
        const { cancelAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1", title: "T", agenda: null, isFullDay: false, status: "SCHEDULED",
            requesterEmployeeId: "ID-007", leaderEmployeeId: null, notulisEmployeeId: "ID-001", roomId: "r1",
            startAt: new Date(Date.now() + 3600000), endAt: new Date(Date.now() + 7200000),
        } as never);
        const tx = {
            meetingAppointment: {
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                findUnique: vi.fn().mockResolvedValue({ id: "a1", status: "CANCELLED" }),
            },
            meetingAppointmentRevision: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
            meetingTask: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
            meetingTaskAssignee: { updateMany: vi.fn() },
            meetingTaskRevision: { count: vi.fn(), create: vi.fn() },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        const out = (await cancelAppointment(empSession(), "a1", "Dibatalkan atas permintaan atasan", { userId: "u-1", username: "ID-001" })) as { status: string };
        expect(out.status).toBe("CANCELLED");
    });

    it("completeAppointment: PIC boleh menyelesaikan saat berjalan", async () => {
        await resetReceptionistCache();
        mocked.appSetting.findUnique.mockResolvedValue(null);
        const { completeAppointment } = await import("@/lib/services/appointmentService");
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            id: "a1", title: "T", status: "SCHEDULED", requesterEmployeeId: "ID-007", leaderEmployeeId: null, notulisEmployeeId: "ID-001",
            roomId: null, startAt: new Date(Date.now() - 600000), endAt: new Date(Date.now() + 3600000),
        } as never);
        const tx = {
            meetingAppointment: {
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                findUnique: vi.fn().mockResolvedValue({ id: "a1", status: "COMPLETED" }),
            },
            meetingAppointmentRevision: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        const out = (await completeAppointment(empSession(), "a1", { userId: "u-1", username: "ID-001" })) as { status: string };
        expect(out.status).toBe("COMPLETED");
    });

    it("rescheduleAppointment: PIC boleh ubah peserta", async () => {
        await resetReceptionistCache();
        mocked.appSetting.findUnique.mockResolvedValue(null);
        mocked.employee.findMany.mockResolvedValue([
            { employeeId: "ID-001", isActive: true },
            { employeeId: "ID-002", isActive: true },
        ] as never);
        mocked.meetingRoom.findUnique.mockResolvedValue({ id: "r1", isActive: true } as never);
        const { rescheduleAppointment } = await import("@/lib/services/appointmentService");
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            meetingAppointment: {
                findUnique: vi.fn().mockResolvedValue({
                    id: "a1", status: "SCHEDULED", requesterEmployeeId: "ID-007", leaderEmployeeId: null, notulisEmployeeId: "ID-001",
                    roomId: "r1", meetingLink: null, isFullDay: false,
                    startAt: new Date(Date.now() + 7200000), endAt: new Date(Date.now() + 10800000),
                }),
                findFirst: vi.fn().mockResolvedValue(null),
                findMany: vi.fn().mockResolvedValue([]),
                update: vi.fn().mockResolvedValue({ id: "a1", status: "SCHEDULED" }),
            },
            meetingAppointmentParticipant: {
                findMany: vi.fn().mockResolvedValue([
                    { id: "p-keep", employeeId: "ID-002", guestName: null, isExternal: false },
                    { id: "p-me", employeeId: "ID-001", guestName: null, isExternal: false },
                ]),
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
            meetingAppointmentRevision: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
            appointmentReminderLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            employeeUnavailability: { findMany: vi.fn().mockResolvedValue([]) },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (callback: (tx: never) => Promise<unknown>) => callback(tx as never));
        await rescheduleAppointment(
            empSession(),
            "a1",
            { date: "2026-12-10", startTime: "10:00", endTime: "11:00", roomId: "r1", participants: [{ employeeId: "ID-002" }, { employeeId: "ID-001" }], changeReason: "Update peserta meeting" },
            { userId: "u-1", username: "ID-001" }
        );
        expect(tx.meetingAppointmentParticipant.updateMany).toHaveBeenCalled();
    });
});

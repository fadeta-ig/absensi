import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock prisma for greenMeetingService unit testing
vi.mock("@/lib/prisma", () => ({
    prisma: {
        greenMeetingConfig: {
            findUnique: vi.fn(),
            create: vi.fn(),
            upsert: vi.fn(),
        },
        greenMeetingUnit: {
            findMany: vi.fn(),
            update: vi.fn(),
        },
        greenMeetingHoliday: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
        },
        greenMeetingSession: {
            findUnique: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
        },
        greenMeetingDeptIzin: {
            create: vi.fn(),
            delete: vi.fn(),
        },
        greenMeetingAttendance: {
            findUnique: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
        employee: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        greenMeetingNote: {
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
        },
        greenMeetingNoteRevision: {
            create: vi.fn(),
            count: vi.fn(),
        },
        greenMeetingNoteTarget: {
            deleteMany: vi.fn(),
        },
        greenMeetingDeadlineHistory: {
            create: vi.fn(),
        },
        department: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        division: {
            findUnique: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

import { prisma } from "@/lib/prisma";
import {
    canManageGreenMeeting,
    extendTaskDeadline,
    updateAttendance,
} from "@/lib/services/greenMeetingService";
import { SYSTEM_ROLES, PERMISSIONS } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/auth";



describe("Green Meeting Authorization & Logic", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should allow SUPER_ADMIN via role override", async () => {
        const adminSession = {
            id: "user-admin",
            userId: "user-admin",
            username: "admin_hr",
            name: "Admin HR",
            email: "hr@wig.co.id",
            employeeId: null,
            employeeRecordId: null,
            departmentId: null,
            divisionId: null,
            roles: [SYSTEM_ROLES.SUPER_ADMIN],
            permissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.USER_MANAGE],
            primaryRole: SYSTEM_ROLES.SUPER_ADMIN,
            role: "hr",
            sessionVersion: 1,
            hasSubordinates: false,
        } as SessionPayload;

        const canManage = await canManageGreenMeeting(adminSession);
        expect(canManage).toBe(true);
    });

    it("should allow GA_ADMIN with ga.manage permission", async () => {
        const gaSession = {
            id: "user-ga",
            userId: "user-ga",
            username: "admin_ga",
            name: "Admin GA",
            email: "ga@wig.co.id",
            employeeId: null,
            employeeRecordId: null,
            departmentId: null,
            divisionId: null,
            roles: [SYSTEM_ROLES.GA_ADMIN],
            permissions: [PERMISSIONS.GA_MANAGE],
            primaryRole: SYSTEM_ROLES.GA_ADMIN,
            role: "ga",
            sessionVersion: 1,
            hasSubordinates: false,
        } as SessionPayload;

        const canManage = await canManageGreenMeeting(gaSession);
        expect(canManage).toBe(true);
    });

    it("should disallow regular employee without ga.manage", async () => {
        const empSession = {
            id: "user-emp",
            userId: "user-emp",
            username: "emp_regular",
            name: "Karyawan Reguler",
            email: "karyawan@wig.co.id",
            employeeId: "WIG999",
            employeeRecordId: "rec-999",
            departmentId: "dept-sales",
            divisionId: "div-sales",
            roles: [SYSTEM_ROLES.EMPLOYEE_USER],
            permissions: [PERMISSIONS.EMPLOYEE_SELF],
            primaryRole: SYSTEM_ROLES.EMPLOYEE_USER,
            role: "employee",
            sessionVersion: 1,
            hasSubordinates: false,
        } as SessionPayload;

        const canManage = await canManageGreenMeeting(empSession);
        expect(canManage).toBe(false);
    });

    it("should reject IZIN per orang (izin kini level dept/divisi)", async () => {
        await expect(
            updateAttendance("att-1", { status: "IZIN" } as never, "Admin GA")
        ).rejects.toThrow(/HADIR atau ALPA/);
        expect(prisma.greenMeetingAttendance.update).not.toHaveBeenCalled();
    });

    it("should update person attendance HADIR with confirmed actor", async () => {
        (prisma.greenMeetingAttendance.findUnique as Mock).mockResolvedValue({
            id: "att-1",
            sessionId: "ses-1",
            status: "ALPA",
        });
        (prisma.greenMeetingAttendance.update as Mock).mockResolvedValue({ id: "att-1", status: "HADIR" });
        const result = await updateAttendance("att-1", { status: "HADIR" }, "WIG002");
        expect(result).toMatchObject({ id: "att-1", status: "HADIR" });
        expect(prisma.greenMeetingAttendance.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "att-1" },
                data: expect.objectContaining({ status: "HADIR", confirmedBy: "WIG002" }),
            })
        );
    });

    it("should create dept izin only for exactly one target with reason", async () => {
        const { createDeptIzin } = await import("@/lib/services/greenMeetingService");
        (prisma.greenMeetingSession.findUnique as Mock).mockResolvedValue({ id: "ses-1" });
        (prisma.department.findUnique as Mock).mockResolvedValue({ id: "dept-1" });
        (prisma.greenMeetingDeptIzin.create as Mock).mockResolvedValue({ id: "izin-1" });

        const result = await createDeptIzin(
            "ses-1",
            { departmentId: "dept-1", reason: "Dinas luar kota" },
            "WIG002"
        );
        expect(result).toMatchObject({ id: "izin-1" });

        await expect(
            createDeptIzin("ses-1", { reason: "Dinas luar kota" }, "WIG002")
        ).rejects.toThrow(/satu departemen/);
    });

    it("should compute dept representation HADIR/IZIN/ALPA", async () => {
        const { computeRepresentation } = await import("@/lib/services/greenMeetingService");
        const { departments } = computeRepresentation(
            [
                { employeeId: "E1", departmentId: "D1", departmentName: "IT", status: "HADIR" },
                { employeeId: "E2", departmentId: "D1", departmentName: "IT", status: "ALPA" },
                { employeeId: "E3", departmentId: "D2", departmentName: "HR", status: "ALPA" },
            ],
            [{ departmentId: "D2", reason: "Cuti bersama" }]
        );
        expect(departments.find((d) => d.departmentId === "D1")?.status).toBe("HADIR");
        expect(departments.find((d) => d.departmentId === "D2")?.status).toBe("IZIN");
        expect(departments.find((d) => d.departmentId === "D2")?.izinReason).toBe("Cuti bersama");
    });

    it("should separate archive stats from new person stats in recap", async () => {
        const { getMeetingRecap } = await import("@/lib/services/greenMeetingService");
        (prisma.greenMeetingSession.findMany as Mock).mockResolvedValue([
            {
                id: "ses-new",
                notes: [],
                attendances: [
                    { employeeId: "E1", employeeName: "Budi", departmentId: "D1", departmentName: "IT", divisionId: "V1", divisionName: "SGA", status: "HADIR" },
                ],
                deptIzins: [],
            },
            {
                id: "ses-old",
                notes: [],
                attendances: [
                    { employeeId: null, unitId: "unit-1", status: "ALPA", unit: { department: { id: "D1", name: "IT", division: { id: "V1", name: "SGA" } } } },
                ],
                deptIzins: [],
            },
        ]);

        const recap = await getMeetingRecap("2026-10-01", "2026-10-06");
        expect(recap.kpi.totalHadir).toBe(1);
        expect(recap.kpi.totalAlpa).toBe(0);
        expect(recap.memberStats).toHaveLength(1);
        expect(recap.deptStats.find((d) => d.departmentId === "D1")?.totalSesi).toBe(1);
        expect(recap.archiveStats.find((d) => d.departmentId === "D1")?.sesiAlpa).toBe(1);
        expect(recap.archiveSessions).toBe(1);
    });

    it("should quick-mark present by employeeId with auto dept", async () => {
        const { quickMarkPresentByEmployee } = await import("@/lib/services/greenMeetingService");
        (prisma.greenMeetingSession.findUnique as Mock).mockResolvedValue({ id: "ses-1" });
        (prisma.employee.findUnique as Mock).mockResolvedValue({
            employeeId: "E1",
            name: "Budi",
            isActive: true,
            departmentId: "D1",
            departmentRel: { name: "IT" },
        });
        (prisma.greenMeetingAttendance.upsert as Mock).mockResolvedValue({ id: "att-1", status: "HADIR" });

        const result = await quickMarkPresentByEmployee("ses-1", "E1", "WIG002");
        expect(result).toMatchObject({ id: "att-1", status: "HADIR" });
        expect(prisma.greenMeetingAttendance.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { sessionId_employeeId: { sessionId: "ses-1", employeeId: "E1" } },
                create: expect.objectContaining({
                    employeeId: "E1",
                    employeeName: "Budi",
                    departmentName: "IT",
                    status: "HADIR",
                }),
            })
        );
    });

    it("should reject quick-mark for inactive employee", async () => {
        const { quickMarkPresentByEmployee } = await import("@/lib/services/greenMeetingService");
        (prisma.greenMeetingSession.findUnique as Mock).mockResolvedValue({ id: "ses-1" });
        (prisma.employee.findUnique as Mock).mockResolvedValue({
            employeeId: "E9",
            name: "Resign",
            isActive: false,
            departmentId: "D1",
            divisionId: null,
            departmentRel: null,
            divisionRel: null,
        });

        await expect(quickMarkPresentByEmployee("ses-1", "E9", "WIG002")).rejects.toThrow(
            /tidak ditemukan atau sudah tidak aktif/
        );
        expect(prisma.greenMeetingAttendance.upsert).not.toHaveBeenCalled();
    });

    it("should reject extendTaskDeadline if max extension quota is reached", async () => {
        (prisma.greenMeetingConfig.upsert as Mock).mockResolvedValue({
            id: "default",
            maxDeadlineExtensions: 2, // Max 2 kali perpanjangan
        });

        (prisma.greenMeetingNote.findUnique as Mock).mockResolvedValue({
            id: "note-1",
            type: "TUGAS",
            deadlines: [
                { sequence: 1, deadlineDate: new Date(), reason: "Tenggat Awal" },
                { sequence: 2, deadlineDate: new Date(), reason: "Perpanjangan 1" },
                { sequence: 3, deadlineDate: new Date(), reason: "Perpanjangan 2" },
            ],
        });

        await expect(
            extendTaskDeadline("note-1", "2026-10-01", "Alasan molor lagi", "Admin GA")
        ).rejects.toThrow(/Batas toleransi perpanjangan telah tercapai/);
    });

    it("should reject bulk IDs asing lintas-sesi agar tidak sukses palsu", async () => {
        const { bulkUpdateAttendanceStatus } = await import("@/lib/services/greenMeetingService");
        (prisma.greenMeetingSession.findUnique as Mock).mockResolvedValue({ id: "ses-1", isCancelled: false });
        (prisma.greenMeetingAttendance.findMany as Mock).mockResolvedValue([{ id: "att-1" }]);
        await expect(bulkUpdateAttendanceStatus("ses-1", ["att-1", "att-asing"], "HADIR", "WIG002")).rejects.toThrow(
            /bukan milik sesi/
        );
        expect(prisma.greenMeetingAttendance.updateMany).not.toHaveBeenCalled();
    });

    it("should map deleteDeptIzin P2025 ke 404 tanpa samarkan outage", async () => {
        const { deleteDeptIzin } = await import("@/lib/services/greenMeetingService");
        const notFound = Object.assign(new Error("not found"), { code: "P2025" });
        (prisma.greenMeetingDeptIzin.delete as Mock).mockRejectedValueOnce(notFound);
        await expect(deleteDeptIzin("missing")).rejects.toThrow(/tidak ditemukan/);
        const outage = new Error("db down");
        (prisma.greenMeetingDeptIzin.delete as Mock).mockRejectedValueOnce(outage);
        await expect(deleteDeptIzin("x")).rejects.toThrow(/db down/);
    });

    it("should include izin-only dept di computeRepresentation", async () => {
        const { computeRepresentation } = await import("@/lib/services/greenMeetingService");
        const { departments } = computeRepresentation([], [{ departmentId: "D9", reason: "Dinas" }]);
        expect(departments.find((d) => d.departmentId === "D9")?.status).toBe("IZIN");
    });

    it("should reject createMeetingNote INFORMASI (writer TUGAS-only, arsip read-only)", async () => {
        const { createMeetingNote } = await import("@/lib/services/greenMeetingService");
        await expect(
            createMeetingNote("ses-1", { type: "INFORMASI", content: "Pengumuman lama" } as never, "WIG002")
        ).rejects.toThrow(/hanya bertipe Tugas/);
        expect(prisma.greenMeetingNote.create).not.toHaveBeenCalled();
    });
});

describe("Green Meeting Phase 4 & 5 Guards", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    

    it("should soft-exclude unit tanpa menghapus histori presensi", async () => {
        const { updateGreenMeetingUnit } = await import("@/lib/services/greenMeetingService");
        (prisma.greenMeetingUnit.update as Mock).mockResolvedValue({
            id: "unit-1",
            isActiveInMeeting: false,
        });

        const result = await updateGreenMeetingUnit("unit-1", { isActiveInMeeting: false });
        expect(result).toMatchObject({ id: "unit-1", isActiveInMeeting: false });
        expect(prisma.greenMeetingUnit.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "unit-1" } })
        );
    });

    it("should reject hari libur lampau dan duplikat tanggal", async () => {
        const { addGreenMeetingHoliday } = await import("@/lib/services/greenMeetingService");
        const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        await expect(
            addGreenMeetingHoliday({ date: pastDate, description: "Libur lampau" })
        ).rejects.toThrow(/masa lampau/);
        expect(prisma.greenMeetingHoliday.create).not.toHaveBeenCalled();

        (prisma.greenMeetingHoliday.findUnique as Mock).mockResolvedValue({ id: "h-1" });
        await expect(
            addGreenMeetingHoliday({ date: "2099-01-05", description: "Libur ganda" })
        ).rejects.toThrow(/sudah terdaftar/);
    });
});

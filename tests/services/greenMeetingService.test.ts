import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
    greenMeetingAttendanceUpdateSchema,
    greenMeetingNoteCreateSchema,
    greenMeetingNoteUpdateSchema,
    greenMeetingExtendDeadlineSchema,
    greenMeetingConfigSchema,
} from "@/lib/validations/validationSchemas";

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
            upsert: vi.fn(),
            delete: vi.fn(),
        },
        greenMeetingSession: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
        },
        greenMeetingAttendance: {
            update: vi.fn(),
            updateMany: vi.fn(),
            findMany: vi.fn(),
        },
        greenMeetingNote: {
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
        },
        greenMeetingDeadlineHistory: {
            create: vi.fn(),
        },
        department: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
    },
}));

import { prisma } from "@/lib/prisma";
import {
    canManageGreenMeeting,
    extendTaskDeadline,
    updateAttendance,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { SYSTEM_ROLES, PERMISSIONS } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/auth";

describe("Green Meeting Zod Schemas", () => {
    describe("greenMeetingAttendanceUpdateSchema", () => {
        it("should accept valid HADIR without permitReason", () => {
            const res = greenMeetingAttendanceUpdateSchema.safeParse({
                status: "HADIR",
                representativeName: "Budi",
            });
            expect(res.success).toBe(true);
        });

        it("should accept valid IZIN with permitReason", () => {
            const res = greenMeetingAttendanceUpdateSchema.safeParse({
                status: "IZIN",
                representativeName: "Budi",
                permitReason: "Sedang dinas luar kota menghadiri audit",
            });
            expect(res.success).toBe(true);
        });

        it("should reject IZIN if permitReason is empty or whitespace", () => {
            const res = greenMeetingAttendanceUpdateSchema.safeParse({
                status: "IZIN",
                permitReason: "   ",
            });
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.issues[0].message).toContain("Alasan izin wajib diisi");
            }
        });
    });

    describe("greenMeetingNoteCreateSchema", () => {
        it("should accept INFORMASI without initialDeadlineDate", () => {
            const res = greenMeetingNoteCreateSchema.safeParse({
                type: "INFORMASI",
                content: "Pengumuman libur bersama Idul Fitri",
                originType: "DIREKSI",
                originName: "Direksi",
                isAllTarget: true,
            });
            expect(res.success).toBe(true);
        });

        it.each([
            ["DIVISION", "Divisi SGA"],
            ["EMPLOYEE", "Daffa Ramadhan (IT Staff)"],
            ["LAINNYA", "Auditor Pajak Eksternal"],
        ])("should accept flexible origin type %s", (originType, originName) => {
            const res = greenMeetingNoteCreateSchema.safeParse({
                type: "INFORMASI",
                content: "Pembahasan koordinasi perusahaan",
                originType,
                originName,
                isAllTarget: true,
            });

            expect(res.success).toBe(true);
        });

        it("should accept multi-entity targets for KEPADA", () => {
            const res = greenMeetingNoteCreateSchema.safeParse({
                type: "INFORMASI",
                content: "Koordinasi lintas struktur organisasi",
                originType: "DEPARTMENT",
                originName: "Departemen HRGA",
                isAllTarget: false,
                targets: [
                    { targetType: "DEPARTMENT", departmentId: "dept-1", label: "HRGA" },
                    { targetType: "DIVISION", divisionId: "div-1", label: "Divisi SGA" },
                    { targetType: "EMPLOYEE", employeeId: "WIG-0010", label: "Bambang (CEO)" },
                ],
            });

            expect(res.success).toBe(true);
        });

        it("should reject TUGAS if initialDeadlineDate is missing", () => {
            const res = greenMeetingNoteCreateSchema.safeParse({
                type: "TUGAS",
                content: "Persiapan infrastruktur cloud server baru",
                originType: "DEPARTMENT",
                originName: "Teknologi Informasi",
                isAllTarget: false,
                targetDepartmentIds: ["dept-1", "dept-2"],
            });
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.issues[0].message).toContain("Tenggat waktu awal (Deadline 1) wajib diisi");
            }
        });

        it("should accept TUGAS if initialDeadlineDate is provided", () => {
            const res = greenMeetingNoteCreateSchema.safeParse({
                type: "TUGAS",
                content: "Persiapan infrastruktur cloud server baru",
                originType: "DEPARTMENT",
                originName: "Teknologi Informasi",
                isAllTarget: false,
                targetDepartmentIds: ["dept-1"],
                initialDeadlineDate: "2026-09-25",
            });
            expect(res.success).toBe(true);
        });
    });

    describe("greenMeetingNoteUpdateSchema", () => {
        it("should require a concrete change reason", () => {
            const result = greenMeetingNoteUpdateSchema.safeParse({
                type: "INFORMASI",
                content: "Informasi hasil konfirmasi terbaru dari pimpinan",
                originType: "DIREKSI",
                originName: "Direksi",
                isAllTarget: true,
                changeReason: "   ",
            });

            expect(result.success).toBe(false);
        });

        it("should accept a full flexible note correction", () => {
            const result = greenMeetingNoteUpdateSchema.safeParse({
                type: "INFORMASI",
                content: "Informasi hasil konfirmasi terbaru dari pimpinan",
                originType: "DIVISION",
                originName: "Divisi SGA",
                isAllTarget: false,
                targets: [{ targetType: "DEPARTMENT", departmentId: "dept-1", label: "HRGA" }],
                changeReason: "Koreksi sasaran setelah konfirmasi ulang",
            });

            expect(result.success).toBe(true);
        });
    });

    describe("greenMeetingExtendDeadlineSchema", () => {
        it("should accept valid extension with reason min 5 chars", () => {
            const res = greenMeetingExtendDeadlineSchema.safeParse({
                newDeadlineDate: "2026-09-30",
                reason: "Vendor pengadaan mengalami keterlambatan pengiriman suku cadang",
            });
            expect(res.success).toBe(true);
        });

        it("should reject extension if reason is too short", () => {
            const res = greenMeetingExtendDeadlineSchema.safeParse({
                newDeadlineDate: "2026-09-30",
                reason: "Late", // 4 chars, below min 5
            });
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error.issues[0].message).toContain("minimal 5 karakter");
            }
        });
    });

    describe("greenMeetingConfigSchema", () => {
        it("should validate time format HH:mm and extensions range", () => {
            const res = greenMeetingConfigSchema.safeParse({
                defaultRoom: "Ruang Rapat Utama",
                defaultTime: "08:30",
                maxDeadlineExtensions: 3,
                offDaysWeekly: "0,6",
            });
            expect(res.success).toBe(true);
        });

        it("should reject invalid time format", () => {
            const res = greenMeetingConfigSchema.safeParse({
                defaultRoom: "Ruang Rapat Utama",
                defaultTime: "8:30 AM",
                maxDeadlineExtensions: 3,
                offDaysWeekly: "0,6",
            });
            expect(res.success).toBe(false);
        });
    });
});

describe("Green Meeting Authorization & Logic", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should allow SUPER_ADMIN or HR_ADMIN to manage Green Meeting", async () => {
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

    it("should allow GA_ADMIN when picRole is GA", async () => {
        (prisma.greenMeetingConfig.findUnique as Mock).mockResolvedValue({
            id: "default",
            picRole: "GA",
            assignedPicUserId: null,
        });

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

    it("should disallow regular employee when picRole is GA", async () => {
        (prisma.greenMeetingConfig.findUnique as Mock).mockResolvedValue({
            id: "default",
            picRole: "GA",
            assignedPicUserId: null,
        });

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

    it("should throw error on updateAttendance if IZIN without permitReason", async () => {
        await expect(
            updateAttendance("att-1", { status: "IZIN", permitReason: "" }, "Admin GA")
        ).rejects.toThrow(GreenMeetingError);
    });

    it("should reject extendTaskDeadline if max extension quota is reached", async () => {
        (prisma.greenMeetingConfig.findUnique as Mock).mockResolvedValue({
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
});

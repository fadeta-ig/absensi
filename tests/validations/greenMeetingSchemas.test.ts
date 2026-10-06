import { describe, it, expect } from "vitest";
import {
    greenMeetingAttendanceUpdateSchema,
    greenMeetingNoteCreateSchema,
    greenMeetingNoteUpdateSchema,
    greenMeetingExtendDeadlineSchema,
    greenMeetingConfigSchema,
    greenMeetingTargetItemSchema,
} from "@/lib/validations/validationSchemas";

describe("Green Meeting Zod Schemas", () => {
    describe("greenMeetingAttendanceUpdateSchema", () => {
        it("should accept valid HADIR", () => {
            const res = greenMeetingAttendanceUpdateSchema.safeParse({
                status: "HADIR",
            });
            expect(res.success).toBe(true);
        });

        it("should accept valid ALPA", () => {
            const res = greenMeetingAttendanceUpdateSchema.safeParse({
                status: "ALPA",
            });
            expect(res.success).toBe(true);
        });

        it("should reject IZIN per orang (izin kini level dept/divisi)", () => {
            const res = greenMeetingAttendanceUpdateSchema.safeParse({
                status: "IZIN",
            });
            expect(res.success).toBe(false);
        });
    });

    describe("greenMeetingDeptIzinSchema", () => {
        it("should accept dept izin with reason", async () => {
            const { greenMeetingDeptIzinSchema } = await import("@/lib/validations/validationSchemas");
            const res = greenMeetingDeptIzinSchema.safeParse({
                sessionId: "123e4567-e89b-12d3-a456-426614174000",
                departmentId: "dept-1",
                reason: "Dinas luar kota",
            });
            expect(res.success).toBe(true);
        });

        it("should reject izin without dept or with unknown divisionId", async () => {
            const { greenMeetingDeptIzinSchema } = await import("@/lib/validations/validationSchemas");
            expect(
                greenMeetingDeptIzinSchema.safeParse({
                    sessionId: "123e4567-e89b-12d3-a456-426614174000",
                    reason: "Dinas luar kota",
                }).success
            ).toBe(false);
            expect(
                greenMeetingDeptIzinSchema.safeParse({
                    sessionId: "123e4567-e89b-12d3-a456-426614174000",
                    departmentId: "dept-1",
                    divisionId: "div-1",
                    reason: "Dinas luar kota",
                }).success
            ).toBe(false);
        });

        it("should reject short reason", async () => {
            const { greenMeetingDeptIzinSchema } = await import("@/lib/validations/validationSchemas");
            const res = greenMeetingDeptIzinSchema.safeParse({
                sessionId: "123e4567-e89b-12d3-a456-426614174000",
                departmentId: "dept-1",
                reason: "AB",
            });
            expect(res.success).toBe(false);
        });
    });

    describe("greenMeetingNoteCreateSchema", () => {
        it("should reject INFORMASI for new notes (arsip read-only, writer TUGAS-only)", () => {
            const res = greenMeetingNoteCreateSchema.safeParse({
                type: "INFORMASI",
                content: "Pengumuman libur bersama Idul Fitri",
                originType: "DIREKSI",
                originName: "Direksi",
                isAllTarget: true,
            });
            expect(res.success).toBe(false);
        });

        it.each([
            ["DIVISION", "Divisi SGA"],
            ["EMPLOYEE", "Daffa Ramadhan (IT Staff)"],
            ["LAINNYA", "Auditor Pajak Eksternal"],
        ])("should accept flexible origin type %s for TUGAS", (originType, originName) => {
            const res = greenMeetingNoteCreateSchema.safeParse({
                type: "TUGAS",
                content: "Pembahasan koordinasi perusahaan",
                originType,
                originName,
                isAllTarget: true,
                initialDeadlineDate: "2026-09-25",
            });

            expect(res.success).toBe(true);
        });

        it("should accept multi-entity targets for KEPADA (TUGAS)", () => {
            const res = greenMeetingNoteCreateSchema.safeParse({
                type: "TUGAS",
                content: "Koordinasi lintas struktur organisasi",
                originType: "DEPARTMENT",
                originName: "Departemen HRGA",
                isAllTarget: false,
                targets: [
                    { targetType: "DEPARTMENT", departmentId: "dept-1", label: "HRGA" },
                    { targetType: "DIVISION", divisionId: "div-1", label: "Divisi SGA" },
                    { targetType: "EMPLOYEE", employeeId: "WIG-0010", label: "Bambang (CEO)" },
                ],
                initialDeadlineDate: "2026-09-25",
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
                expect(res.error.issues[0].message).toContain("Tenggat waktu awal (Deadline 1)");
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
                type: "TUGAS",
                content: "Tugas hasil konfirmasi terbaru dari pimpinan",
                originType: "DIREKSI",
                originName: "Direksi",
                isAllTarget: true,
                initialDeadlineDate: "2026-09-25",
                changeReason: "   ",
            });

            expect(result.success).toBe(false);
        });

        it("should accept a full flexible note correction (TUGAS)", () => {
            const result = greenMeetingNoteUpdateSchema.safeParse({
                type: "TUGAS",
                content: "Tugas hasil konfirmasi terbaru dari pimpinan",
                originType: "DIVISION",
                originName: "Divisi SGA",
                isAllTarget: false,
                targets: [{ targetType: "DEPARTMENT", departmentId: "dept-1", label: "HRGA" }],
                initialDeadlineDate: "2026-09-25",
                changeReason: "Koreksi sasaran setelah konfirmasi ulang",
            });

            expect(result.success).toBe(true);
        });

        it("should allow archive INFORMASI content revision without type change", () => {
            const result = greenMeetingNoteUpdateSchema.safeParse({
                content: "Koreksi isi arsip informasi lama",
                changeReason: "Koreksi redaksional arsip",
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

describe("Green Meeting Target & Kalender", () => {
    it("should reject kalender tak nyata 2026-02-30 pada deadline catatan dan perpanjangan", () => {
        const noteRes = greenMeetingNoteCreateSchema.safeParse({
            type: "TUGAS",
            content: "Tugas dengan tanggal tak nyata",
            originType: "DEPARTMENT",
            originName: "Departemen IT",
            isAllTarget: true,
            initialDeadlineDate: "2026-02-30",
        });
        expect(noteRes.success).toBe(false);

        const extendRes = greenMeetingExtendDeadlineSchema.safeParse({
            newDeadlineDate: "2026-02-30",
            reason: "Alasan perpanjangan yang cukup panjang",
        });
        expect(extendRes.success).toBe(false);
    });

    it("should accept targetType enum DEPARTMENT/DIVISION/EMPLOYEE", () => {
        for (const targetType of ["DEPARTMENT", "DIVISION", "EMPLOYEE"] as const) {
            const res = greenMeetingTargetItemSchema.safeParse({ targetType });
            expect(res.success).toBe(true);
        }
    });

    it("should reject unknown targetType", () => {
        const res = greenMeetingTargetItemSchema.safeParse({ targetType: "UNIT" });
        expect(res.success).toBe(false);
    });
});

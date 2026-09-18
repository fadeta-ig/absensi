import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    getNormalizedShiftWindows,
    formatMinutes,
    resolveAttendanceTargetForEmployee,
    ScheduleDay,
    ShiftTolerance,
} from "@/lib/services/attendanceShiftHelper";
import * as attendanceService from "@/lib/services/attendanceService";
import type { AttendanceRecord } from "@/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FASE 3: VERIFICATION PLAN TEST SUITE (End-to-End Scenarios)
 * Skenario Pengujian Menyeluruh Sesuai Dokumen implementation_plan.md:
 * - Scenario 1: Clock-In jam 22:45 (Senin) -> Sukses tercatat di tanggal Senin
 * - Scenario 2: Clock-Out jam 07:05 (Selasa) -> Sukses menutup record Senin (H-1)
 * - Scenario 3: Keterlambatan Shift Malam: Masuk jam 23:30 -> Status 'late'
 * - Scenario 4: Pulang Terlalu Cepat: Pulang jam 05:00 -> Ditolak (Early Out Block)
 * - Scenario 5: Pulang Terlalu Lambat: Pulang jam 08:30 -> Ditolak (Late Out Block)
 * - Scenario 6: Transisi Rotasi Shift: Karyawan Pagi berpindah ke Malam
 * ═══════════════════════════════════════════════════════════════════════════
 */

describe("Fase 3: Verification Plan — Skenario Menyeluruh 3-Shift 24 Jam", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const shift3NightDays: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i,
        startTime: "23:00",
        endTime: "07:00",
        isOff: false,
    }));

    const shift3Tolerance: ShiftTolerance = {
        earlyCheckIn: 30,  // Boleh clock-in mulai 22:30
        lateCheckIn: 15,   // Batas tepat waktu 23:15
        earlyCheckOut: 0,  // Jam pulang minimal 07:00 (H+1)
        lateCheckOut: 60,  // Batas maksimal pulang 08:00 (H+1)
    };

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 1: Clock-In jam 22:45 (Senin) -> Sukses tercatat di tanggal Senin
    // ──────────────────────────────────────────────────────────────────────────
    it("Scenario 1: Clock-In jam 22:45 WIB di hari Senin harus diatribusikan ke tanggal Senin dan berstatus 'present'", async () => {
        vi.spyOn(attendanceService, "getAttendanceByDate").mockResolvedValue(undefined);

        // Monday 22:45 WIB (15:45 UTC)
        const mondayNight = new Date("2026-09-14T15:45:00.000Z");

        const target = await resolveAttendanceTargetForEmployee("EMP_NOC_01", mondayNight, shift3NightDays);

        expect(target.mode).toBe("CLOCK_IN");
        expect(target.shiftDate).toBe("2026-09-14"); // Atribusi ke tanggal Senin!
        expect(target.isOvernight).toBe(true);

        const windows = getNormalizedShiftWindows(target.scheduleDay!, shift3Tolerance);

        // Jam masuk aktual: 22:45 = 1365 menit
        expect(target.relativeClockMinutes).toBe(1365);
        // Jendela masuk: 22:30 (1350m) s/d 23:15 (1395m)
        expect(target.relativeClockMinutes).toBeGreaterThanOrEqual(windows.earliestInMinutes);
        expect(target.relativeClockMinutes).toBeLessThanOrEqual(windows.lateDeadlineMinutes);

        // Evaluasi status kehadiran
        const status = target.relativeClockMinutes > windows.lateDeadlineMinutes ? "late" : "present";
        expect(status).toBe("present");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 2: Clock-Out jam 07:05 (Selasa) -> Sukses menutup record Senin
    // ──────────────────────────────────────────────────────────────────────────
    it("Scenario 2: Clock-Out jam 07:05 WIB di hari Selasa pagi harus menutup rekor Senin (H-1) tanpa membuka rekor baru", async () => {
        const mockMondayRecord: AttendanceRecord = {
            id: "att-rec-monday-001",
            employeeId: "EMP_NOC_01",
            date: "2026-09-14",
            clockIn: "2026-09-14T15:45:00.000Z", // 22:45 WIB
            clockOut: null,
            status: "present",
            notes: null,
            isOffDay: false,
        };

        vi.spyOn(attendanceService, "getAttendanceByDate").mockImplementation(async (_empId, date) => {
            if (date === "2026-09-14") return mockMondayRecord;
            return undefined;
        });

        // Tuesday 07:05 WIB (00:05 UTC)
        const tuesdayMorning = new Date("2026-09-15T00:05:00.000Z");

        const target = await resolveAttendanceTargetForEmployee("EMP_NOC_01", tuesdayMorning, shift3NightDays);

        expect(target.mode).toBe("CLOCK_OUT");
        expect(target.shiftDate).toBe("2026-09-14"); // Diarahkan ke shift Senin!
        expect(target.isOvernight).toBe(true);

        if (target.mode === "CLOCK_OUT") {
            expect(target.existingRecord.id).toBe("att-rec-monday-001");
            // Relatif menit kepulangan hari H+1: (7 + 24) * 60 + 5 = 1865 menit
            expect(target.relativeClockMinutes).toBe(1865);

            const windows = getNormalizedShiftWindows(target.scheduleDay!, shift3Tolerance);
            // Batas minimal pulang 07:00 H+1 = (7 + 24) * 60 = 1860 menit
            expect(windows.earliestOutMinutes).toBe(1860);
            // Batas maksimal toleransi pulang 08:00 H+1 = 1920 menit
            expect(windows.latestOutMinutes).toBe(1920);

            // 1865 >= 1860 dan <= 1920 -> Clock-Out diizinkan!
            expect(target.relativeClockMinutes >= windows.earliestOutMinutes).toBe(true);
            expect(target.relativeClockMinutes <= windows.latestOutMinutes).toBe(true);
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 3: Keterlambatan Shift Malam (Masuk 23:30) -> Status 'late'
    // ──────────────────────────────────────────────────────────────────────────
    it("Scenario 3: Clock-In jam 23:30 WIB (melewati batas lateCheckIn 23:15) harus diberi status 'late'", async () => {
        vi.spyOn(attendanceService, "getAttendanceByDate").mockResolvedValue(undefined);

        // Monday 23:30 WIB (16:30 UTC)
        const lateClockInTime = new Date("2026-09-14T16:30:00.000Z");

        const target = await resolveAttendanceTargetForEmployee("EMP_NOC_01", lateClockInTime, shift3NightDays);

        expect(target.mode).toBe("CLOCK_IN");
        const windows = getNormalizedShiftWindows(target.scheduleDay!, shift3Tolerance);

        // Jam masuk aktual: 23:30 = 1410 menit
        expect(target.relativeClockMinutes).toBe(1410);
        // Deadline toleransi masuk: 23:15 = 1395 menit
        expect(windows.lateDeadlineMinutes).toBe(1395);

        // 1410 > 1395 -> Harus divonis 'late'
        expect(target.relativeClockMinutes > windows.lateDeadlineMinutes).toBe(true);
        const status = target.relativeClockMinutes > windows.lateDeadlineMinutes ? "late" : "present";
        expect(status).toBe("late");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 4: Pulang Terlalu Cepat (Jam 05:00) -> Ditolak (Early Out Block)
    // ──────────────────────────────────────────────────────────────────────────
    it("Scenario 4: Upaya Clock-Out jam 05:00 WIB (sebelum 07:00) harus ditolak oleh Early Out Check", async () => {
        const mockMondayRecord: AttendanceRecord = {
            id: "att-rec-monday-001",
            employeeId: "EMP_NOC_01",
            date: "2026-09-14",
            clockIn: "2026-09-14T15:45:00.000Z",
            clockOut: null,
            status: "present",
            notes: null,
            isOffDay: false,
        };

        vi.spyOn(attendanceService, "getAttendanceByDate").mockImplementation(async (_empId, date) => {
            if (date === "2026-09-14") return mockMondayRecord;
            return undefined;
        });

        // Tuesday 05:00 WIB (22:00 UTC Senin)
        const earlyTuesdayMorning = new Date("2026-09-14T22:00:00.000Z");

        const target = await resolveAttendanceTargetForEmployee("EMP_NOC_01", earlyTuesdayMorning, shift3NightDays);

        expect(target.mode).toBe("CLOCK_OUT");
        const windows = getNormalizedShiftWindows(target.scheduleDay!, shift3Tolerance);

        // Relatif menit 05:00 H+1: (5 + 24) * 60 = 1740 menit
        expect(target.relativeClockMinutes).toBe(1740);
        // Earliest Out: 07:00 H+1 = 1860 menit
        expect(windows.earliestOutMinutes).toBe(1860);

        // 1740 < 1860 -> Harus terblokir (tidak boleh pulang duluan)
        const isAllowedToClockOut = target.relativeClockMinutes >= windows.earliestOutMinutes;
        expect(isAllowedToClockOut).toBe(false);

        const errorMessage = `Belum waktunya clock-out. Anda bisa pulang mulai pukul ${formatMinutes(windows.earliestOutMinutes)}.`;
        expect(errorMessage).toBe("Belum waktunya clock-out. Anda bisa pulang mulai pukul 07:00.");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 5: Pulang Terlalu Lambat (Jam 08:30) -> Ditolak (Late Out Block)
    // ──────────────────────────────────────────────────────────────────────────
    it("Scenario 5: Upaya Clock-Out jam 08:30 WIB (melewati lateCheckOut 08:00) harus ditolak oleh Late Out Check", async () => {
        const mockMondayRecord: AttendanceRecord = {
            id: "att-rec-monday-001",
            employeeId: "EMP_NOC_01",
            date: "2026-09-14",
            clockIn: "2026-09-14T15:45:00.000Z",
            clockOut: null,
            status: "present",
            notes: null,
            isOffDay: false,
        };

        vi.spyOn(attendanceService, "getAttendanceByDate").mockImplementation(async (_empId, date) => {
            if (date === "2026-09-14") return mockMondayRecord;
            return undefined;
        });

        // Tuesday 08:30 WIB (01:30 UTC Selasa)
        const tooLateTuesdayMorning = new Date("2026-09-15T01:30:00.000Z");

        const target = await resolveAttendanceTargetForEmployee("EMP_NOC_01", tooLateTuesdayMorning, shift3NightDays);

        expect(target.mode).toBe("CLOCK_OUT");
        const windows = getNormalizedShiftWindows(target.scheduleDay!, shift3Tolerance);

        // Relatif menit 08:30 H+1: (8 + 24) * 60 + 30 = 1950 menit
        expect(target.relativeClockMinutes).toBe(1950);
        // Latest Out: 08:00 H+1 = 1920 menit
        expect(windows.latestOutMinutes).toBe(1920);

        // 1950 > 1920 -> Melewati batas toleransi kepulangan
        const isWithinLateCheckOut = target.relativeClockMinutes <= windows.latestOutMinutes;
        expect(isWithinLateCheckOut).toBe(false);

        const errorMessage = `Waktu clock-out sudah melewati batas pukul ${formatMinutes(windows.latestOutMinutes)}. Hubungi HR.`;
        expect(errorMessage).toBe("Waktu clock-out sudah melewati batas pukul 08:00. Hubungi HR.");
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SCENARIO 6: Rotasi Shift (Pagi -> Malam)
    // ──────────────────────────────────────────────────────────────────────────
    it("Scenario 6: Karyawan yang dirotasi dari Shift Pagi ke Shift Malam bertransisi dengan mulus tanpa konflik", async () => {
        // 1. Senin: Shift Pagi selesai
        const mockMondayMorningRecord: AttendanceRecord = {
            id: "att-rec-morning-001",
            employeeId: "EMP_ROTA_02",
            date: "2026-09-14",
            clockIn: "2026-09-14T00:00:00.000Z", // 07:00 WIB
            clockOut: "2026-09-14T08:00:00.000Z", // 15:00 WIB (selesai)
            status: "present",
            notes: null,
            isOffDay: false,
        };

        vi.spyOn(attendanceService, "getAttendanceByDate").mockImplementation(async (_empId, date) => {
            if (date === "2026-09-14") return mockMondayMorningRecord;
            return undefined;
        });

        // 2. Selasa malam: Karyawan dirotasi ke Shift 3 (Malam 23:00 - 07:00)
        // Karyawan masuk Selasa 22:50 WIB (15:50 UTC)
        const tuesdayNight = new Date("2026-09-15T15:50:00.000Z");

        const target = await resolveAttendanceTargetForEmployee("EMP_ROTA_02", tuesdayNight, shift3NightDays);

        // Rekor Senin sudah ditutup (clockOut ada), sehingga Selasa malam diidentifikasi sebagai CLOCK_IN baru
        expect(target.mode).toBe("CLOCK_IN");
        expect(target.shiftDate).toBe("2026-09-15");
        expect(target.isOvernight).toBe(true);
    });
});

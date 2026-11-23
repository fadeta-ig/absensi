import { beforeEach, describe, expect, it, vi } from "vitest";
import { toUTCDateKey } from "@/lib/timezone";

const prismaMock = vi.hoisted(() => ({
    appSetting: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
    },
    attendanceRecord: {
        findUnique: vi.fn(),
        count: vi.fn(),
    },
    stressmeterCheckin: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
    },
    stressmeterAnonymousShare: {
        create: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
        groupBy: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    department: {
        findMany: vi.fn(),
    },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
    getEmployeeTodayCheckinStatus,
    getHrStressmeterOverview,
    submitAnonymousShare,
    submitEmployeeCheckin,
} from "@/lib/services/stressmeterService";

describe("stressmeterService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("memunculkan pop-up hanya jika aktif, sudah Clock In, dan belum ada respons hari ini", async () => {
        prismaMock.appSetting.findUnique.mockResolvedValue({ value: "true" });
        prismaMock.attendanceRecord.findUnique.mockResolvedValue({ clockIn: new Date() });
        prismaMock.stressmeterCheckin.findUnique.mockResolvedValue(null);

        const active = await getEmployeeTodayCheckinStatus("EMP-001", "2026-11-23");
        expect(active.shouldPrompt).toBe(true);
        expect(active.hasClockedIn).toBe(true);
        expect(active.hasSubmitted).toBe(false);

        // Bila fitur dijeda HR → shouldPrompt = false
        prismaMock.appSetting.findUnique.mockResolvedValue({ value: "false" });
        const paused = await getEmployeeTodayCheckinStatus("EMP-001", "2026-11-23");
        expect(paused.shouldPrompt).toBe(false);

        // Bila sudah pernah skip/isi → shouldPrompt = false
        prismaMock.appSetting.findUnique.mockResolvedValue({ value: "true" });
        prismaMock.stressmeterCheckin.findUnique.mockResolvedValue({
            id: "chk-1",
            rating: null,
            skipped: true,
        });
        const alreadySkipped = await getEmployeeTodayCheckinStatus("EMP-001", "2026-11-23");
        expect(alreadySkipped.shouldPrompt).toBe(false);
        expect(alreadySkipped.hasSubmitted).toBe(true);
    });

    it("mencatat rating maupun SKIP secara idempoten per employeeId + shiftDate", async () => {
        prismaMock.stressmeterCheckin.findUnique.mockResolvedValueOnce(null);
        prismaMock.stressmeterCheckin.create.mockResolvedValueOnce({
            id: "chk-skip",
            rating: null,
            skipped: true,
        });

        const skippedRes = await submitEmployeeCheckin("EMP-001", {
            shiftDate: "2026-11-23",
            skipped: true,
        });
        expect(skippedRes.alreadySubmitted).toBe(false);
        expect(skippedRes.checkin.skipped).toBe(true);
        expect(skippedRes.checkin.rating).toBeNull();

        // Panggilan kedua di tanggal yang sama mengembalikan data lama tanpa create ulang
        prismaMock.stressmeterCheckin.findUnique.mockResolvedValueOnce({
            id: "chk-skip",
            rating: null,
            skipped: true,
        });
        const duplicate = await submitEmployeeCheckin("EMP-001", {
            shiftDate: "2026-11-23",
            skipped: false,
            rating: 5,
        });
        expect(duplicate.alreadySubmitted).toBe(true);
        expect(prismaMock.stressmeterCheckin.create).toHaveBeenCalledTimes(1);
    });

    it("menyimpan curhat anonim tanpa employeeId, userId, maupun checkinId", async () => {
        prismaMock.stressmeterAnonymousShare.create.mockResolvedValue({
            id: "anon-1",
            submittedWibDate: "2026-11-23",
            topic: "WORKLOAD",
        });

        await submitAnonymousShare({
            topic: "WORKLOAD",
            message: "  Beban kerja akhir bulan cukup padat dan butuh prioritas jelas.  ",
        });

        expect(prismaMock.stressmeterAnonymousShare.create).toHaveBeenCalledTimes(1);
        const callArg = prismaMock.stressmeterAnonymousShare.create.mock.calls[0][0];
        expect(callArg.data).toMatchObject({
            topic: "WORKLOAD",
            message: "Beban kerja akhir bulan cukup padat dan butuh prioritas jelas.",
            status: "NEW",
        });
        expect(callArg.data).not.toHaveProperty("employeeId");
        expect(callArg.data).not.toHaveProperty("userId");
        expect(callArg.data).not.toHaveProperty("checkinId");
    });

    it("menghitung KPI, partisipasi, breakdown departemen, dan deteksi dini karyawan", async () => {
        const d1 = toUTCDateKey("2026-11-22");
        const d2 = toUTCDateKey("2026-11-23");

        prismaMock.appSetting.findUnique.mockResolvedValue({ value: "true" });
        prismaMock.attendanceRecord.count.mockResolvedValue(4);
        prismaMock.stressmeterAnonymousShare.count.mockResolvedValue(2);
        prismaMock.department.findMany.mockResolvedValue([
            { id: "dept-ops", name: "Operasional" },
            { id: "dept-it", name: "IT" },
        ]);

        const periodRows = [
            {
                id: "c1",
                employeeId: "EMP-A",
                shiftDate: d1,
                rating: 1,
                skipped: false,
                employee: { name: "Budi", departmentId: "dept-ops", departmentRel: { name: "Operasional" } },
            },
            {
                id: "c2",
                employeeId: "EMP-A",
                shiftDate: d2,
                rating: 2,
                skipped: false,
                employee: { name: "Budi", departmentId: "dept-ops", departmentRel: { name: "Operasional" } },
            },
            {
                id: "c3",
                employeeId: "EMP-B",
                shiftDate: d2,
                rating: 5,
                skipped: false,
                employee: { name: "Sari", departmentId: "dept-it", departmentRel: { name: "IT" } },
            },
            {
                id: "c4",
                employeeId: "EMP-C",
                shiftDate: d2,
                rating: null,
                skipped: true,
                employee: { name: "Rina", departmentId: "dept-it", departmentRel: { name: "IT" } },
            },
        ];

        prismaMock.stressmeterCheckin.findMany
            .mockResolvedValueOnce(periodRows)
            .mockResolvedValueOnce(periodRows.filter((r) => !r.skipped));

        const overview = await getHrStressmeterOverview({
            from: "2026-11-01",
            to: "2026-11-23",
        });

        expect(overview.kpi.totalRated).toBe(3);
        expect(overview.kpi.totalSkipped).toBe(1);
        expect(overview.kpi.averageRating).toBe(2.7); // (1 + 2 + 5) / 3 = 2.666 -> 2.7
        expect(overview.kpi.participationRate).toBe(75); // 3 / 4 * 100
        expect(overview.kpi.lowMoodCount).toBe(2);
        expect(overview.kpi.newAnonymousShares).toBe(2);

        // Departemen terendah tampil pertama
        expect(overview.departmentBreakdown[0].departmentName).toBe("Operasional");
        expect(overview.departmentBreakdown[0].averageRating).toBe(1.5);

        // Budi tercatat di deteksi dini (2x skor rendah)
        expect(overview.attentionList).toHaveLength(1);
        expect(overview.attentionList[0]).toMatchObject({
            employeeId: "EMP-A",
            employeeName: "Budi",
            lowCount: 2,
            latestRating: 2,
        });
    });
});

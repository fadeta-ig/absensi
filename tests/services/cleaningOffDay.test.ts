import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CLEANING_IDS, makeRoom, makeWig002Session } from "../fixtures/cleaning";

// Mock-murni: tanpa tulis hris_local maupun database lain.
vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
        cleaningRoom: { findUnique: vi.fn() },
        cleaningHoliday: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
        cleaningDailyChecklist: { findUnique: vi.fn() },
        cleaningMonthlyApproval: { findUnique: vi.fn() },
        cleaningDailyParaf: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
        cleaningApprovalIdempotency: { findUnique: vi.fn(), create: vi.fn() },
        employee: { findFirst: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn(),
    },
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
    CLEANING_WEEKLY_OFF_DAYS_KEY,
    DEFAULT_CLEANING_WEEKLY_OFF_DAYS,
    getCleaningWeeklyOffDays,
    invalidateCleaningWeeklyOffDaysCache,
    normalizeCleaningWeeklyOffDays,
    parseCleaningWeeklyOffDays,
    updateCleaningWeeklyOffDays,
    validateCleaningWeeklyOffDaysInput,
} from "@/lib/services/appSettingsService";
import {
    CLEANING_HOLIDAY_RANGE_MAX_DAYS,
    createCleaningHolidayRange,
    expandHolidayDateRange,
    getCleaningOffDayStatus,
    getParafStatus,
    isCleaningOffDay,
    isWeekendWibDate,
    isWibDateInWeeklyOffDays,
    signDailyParaf,
} from "@/lib/services/cleaningParafService";

const appSettingFindUnique = () => prisma.appSetting.findUnique as Mock;
const appSettingUpsert = () => prisma.appSetting.upsert as Mock;
const holidayFindUnique = () => prisma.cleaningHoliday.findUnique as Mock;

const MONDAY = "2026-09-21";
const TUESDAY = "2026-09-22";
const WEDNESDAY = "2026-09-23";
const SATURDAY = "2026-09-19";
const SUNDAY = "2026-09-20";

function mockTx(overrides: Record<string, unknown> = {}) {
    const tx = {
        cleaningRoom: { findUnique: vi.fn() },
        cleaningHoliday: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
        cleaningMonthlyApproval: { findUnique: vi.fn() },
        cleaningDailyChecklist: { findUnique: vi.fn() },
        employee: { findFirst: vi.fn() },
        cleaningDailyParaf: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        cleaningApprovalIdempotency: { create: vi.fn() },
        auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
        ...overrides,
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: (txClient: never) => Promise<unknown>) => {
        return callback(tx as never);
    });
    return tx as unknown as {
        cleaningRoom: { findUnique: ReturnType<typeof vi.fn> };
        cleaningHoliday: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
        cleaningMonthlyApproval: { findUnique: ReturnType<typeof vi.fn> };
        cleaningDailyChecklist: { findUnique: ReturnType<typeof vi.fn> };
        employee: { findFirst: ReturnType<typeof vi.fn> };
        cleaningDailyParaf: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
        auditLog: { create: ReturnType<typeof vi.fn> };
    };
}

describe("cleaning off-day dinamis (mock murni)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        invalidateCleaningWeeklyOffDaysCache();
    });

    describe("AppSetting cleaning.weeklyOffDays", () => {
        it("default [0,6] bila baris belum ada / rusak / DB gagal", async () => {
            appSettingFindUnique().mockResolvedValue(null);
            expect(await getCleaningWeeklyOffDays()).toEqual([0, 6]);

            invalidateCleaningWeeklyOffDaysCache();
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "rusak" });
            expect(await getCleaningWeeklyOffDays()).toEqual([...DEFAULT_CLEANING_WEEKLY_OFF_DAYS]);

            invalidateCleaningWeeklyOffDaysCache();
            appSettingFindUnique().mockRejectedValue(new Error("koneksi putus"));
            expect(await getCleaningWeeklyOffDays()).toEqual([0, 6]);
        });

        it("parse custom Rab–Min dinamis terurut", () => {
            expect(parseCleaningWeeklyOffDays("3,4,5,6,0")).toEqual([0, 3, 4, 5, 6]);
            expect(parseCleaningWeeklyOffDays("")).toEqual([]);
            expect(parseCleaningWeeklyOffDays(null)).toEqual([0, 6]);
            expect(normalizeCleaningWeeklyOffDays([3, 0, 3])).toEqual([0, 3]);
        });

        it("validasi menolak format di luar 0–6", () => {
            expect(() => validateCleaningWeeklyOffDaysInput("7")).toThrow(/Format hari libur mingguan/);
            expect(() => validateCleaningWeeklyOffDaysInput("a,b")).toThrow(/Format hari libur mingguan/);
            expect(() => validateCleaningWeeklyOffDaysInput("1,,2")).toThrow(/Format hari libur mingguan/);
            expect(() => validateCleaningWeeklyOffDaysInput([1, 7])).toThrow(/Format hari libur mingguan/);
            expect(validateCleaningWeeklyOffDaysInput(" 0, 6 ")).toEqual([0, 6]);
            expect(validateCleaningWeeklyOffDaysInput([])).toEqual([]);
        });

        it("update menyimpan CSV ternormalisasi", async () => {
            appSettingUpsert().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "0,3" });

            const updated = await updateCleaningWeeklyOffDays("3,0,3", "user-1");

            expect(updated).toEqual({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: [0, 3], csv: "0,3" });
            expect(appSettingUpsert()).toHaveBeenCalledWith({
                where: { key: CLEANING_WEEKLY_OFF_DAYS_KEY },
                update: { value: "0,3", updatedByUserId: "user-1" },
                create: { key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "0,3", updatedByUserId: "user-1" },
            });
        });
    });

    describe("isWibDateInWeeklyOffDays (murni, tanpa DB)", () => {
        it("setting custom Rab–Min: Rabu off, Selasa kerja", () => {
            const rabMin = [3, 4, 5, 6, 0];
            expect(isWibDateInWeeklyOffDays(WEDNESDAY, rabMin)).toBe(true);
            expect(isWibDateInWeeklyOffDays(SUNDAY, rabMin)).toBe(true);
            expect(isWibDateInWeeklyOffDays(TUESDAY, rabMin)).toBe(false);
            expect(isWibDateInWeeklyOffDays(MONDAY, rabMin)).toBe(false);
        });

        it("kompat isWeekendWibDate tetap Sab–Min default", () => {
            expect(isWeekendWibDate(SUNDAY)).toBe(true);
            expect(isWeekendWibDate(SATURDAY)).toBe(true);
            expect(isWeekendWibDate(MONDAY)).toBe(false);
        });
    });

    describe("isCleaningOffDay gabungan", () => {
        it("true via setting custom walau tanpa tanggal khusus", async () => {
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "3" });
            holidayFindUnique().mockResolvedValue(null);

            expect(await isCleaningOffDay(WEDNESDAY)).toBe(true);
            invalidateCleaningWeeklyOffDaysCache();
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "3" });
            expect(await isCleaningOffDay(TUESDAY)).toBe(false);
        });

        it("true via tanggal spesifik walau bukan hari mingguan", async () => {
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "" });
            holidayFindUnique().mockResolvedValue({ description: "Cuti bersama" } as never);

            const status = await getCleaningOffDayStatus(TUESDAY);
            expect(status.isOff).toBe(true);
            expect(status.isWeeklyOff).toBe(false);
            expect(status.isHoliday).toBe(true);
        });

        it("kombinasi mingguan + spesifik tetap off", async () => {
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "3,4,5,6,0" });
            holidayFindUnique().mockResolvedValue({ description: "Libur nasional" } as never);

            expect(await isCleaningOffDay(WEDNESDAY)).toBe(true);

            invalidateCleaningWeeklyOffDaysCache();
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "" });
            holidayFindUnique().mockResolvedValue(null);
            expect(await isCleaningOffDay(TUESDAY)).toBe(false);
        });
    });

    describe("getParafStatus memakai helper dinamis", () => {
        function mockStatusBase() {
            vi.mocked(prisma.cleaningRoom.findUnique).mockResolvedValue(makeRoom() as never);
            vi.mocked(prisma.cleaningDailyChecklist.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.cleaningMonthlyApproval.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.cleaningDailyParaf.findMany).mockResolvedValue([]);
        }

        it("Senin bebas bila setting mingguan [1]", async () => {
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "1" });
            mockStatusBase();
            holidayFindUnique().mockResolvedValue(null);

            const status = await getParafStatus(CLEANING_IDS.room, MONDAY);

            expect(status.isWeeklyOff).toBe(true);
            expect(status.isWeekend).toBe(true);
            expect(status.isFree).toBe(true);
            expect(status.weeklyOffDays).toEqual([1]);
        });

        it("Senin wajib paraf bila setting kosong dan tanpa libur khusus", async () => {
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "" });
            mockStatusBase();
            holidayFindUnique().mockResolvedValue(null);

            const status = await getParafStatus(CLEANING_IDS.room, MONDAY);

            expect(status.isWeeklyOff).toBe(false);
            expect(status.isFree).toBe(false);
        });
    });

    describe("signDailyParaf tolak-di-libur + pesan dinamis", () => {
        it("menolak pola mingguan custom 422 dengan pesan dinamis", async () => {
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "3" });
            vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
            const tx = mockTx();
            tx.cleaningRoom.findUnique.mockResolvedValue(makeRoom());
            tx.cleaningHoliday.findUnique.mockResolvedValue(null);

            const err = await signDailyParaf({
                roomId: CLEANING_IDS.room,
                wibDate: WEDNESDAY,
                signerEmployeeId: "EMP001",
            }).catch((e) => e);

            expect(err.statusCode).toBe(422);
            expect(err.message).toBe("Hari libur, tidak perlu paraf.");
            expect(err.message).not.toMatch(/Sabtu|Minggu|akhir pekan/i);
        });

        it("menolak tanggal spesifik 422 dengan deskripsi libur", async () => {
            appSettingFindUnique().mockResolvedValue({ key: CLEANING_WEEKLY_OFF_DAYS_KEY, value: "" });
            vi.mocked(prisma.cleaningApprovalIdempotency.findUnique).mockResolvedValue(null);
            const tx = mockTx();
            tx.cleaningRoom.findUnique.mockResolvedValue(makeRoom());
            tx.cleaningHoliday.findUnique.mockResolvedValue({ description: "Cuti bersama" });

            await expect(
                signDailyParaf({ roomId: CLEANING_IDS.room, wibDate: TUESDAY, signerEmployeeId: "EMP001" })
            ).rejects.toThrow(/hari libur.*Cuti bersama/i);
        });
    });

    describe("expandHolidayDateRange", () => {
        it("single dan rentang pendek", () => {
            expect(expandHolidayDateRange("2026-12-24")).toEqual(["2026-12-24"]);
            expect(expandHolidayDateRange("2026-12-24", "2026-12-26")).toEqual([
                "2026-12-24",
                "2026-12-25",
                "2026-12-26",
            ]);
        });

        it("melewati batas bulan", () => {
            expect(expandHolidayDateRange("2026-01-30", "2026-02-02")).toEqual([
                "2026-01-30",
                "2026-01-31",
                "2026-02-01",
                "2026-02-02",
            ]);
        });

        it("maks 62 hari lolos, 63 ditolak", () => {
            expect(CLEANING_HOLIDAY_RANGE_MAX_DAYS).toBe(62);
            // 2026 bukan kabisat: Jan 31 + Feb 28 + Mar 3 = 62 hari inklusif.
            const dates62 = expandHolidayDateRange("2026-01-01", "2026-03-03");
            expect(dates62).toHaveLength(62);
            expect(() => expandHolidayDateRange("2026-01-01", "2026-03-04")).toThrow(/maksimal 62 hari/);
        });

        it("menolak akhir sebelum mulai dan format rusak", () => {
            expect(() => expandHolidayDateRange("2026-12-26", "2026-12-24")).toThrow(/tidak boleh sebelum/);
            expect(() => expandHolidayDateRange("bukan-tanggal")).toThrow(/YYYY-MM-DD/);
        });
    });

    describe("createCleaningHolidayRange (upsert-skip)", () => {
        const session = makeWig002Session();

        it("expand rentang dan skip tanggal yang sudah ada", async () => {
            const tx = mockTx();
            tx.cleaningHoliday.findMany.mockResolvedValue([{ wibDate: "2026-12-25" }]);
            tx.cleaningHoliday.create.mockImplementation(async (args: { data: { wibDate: string; description: string } }) => ({
                id: `id-${args.data.wibDate}`,
                wibDate: args.data.wibDate,
                description: args.data.description,
                createdByUserId: session.userId,
                createdAt: new Date(),
            }));

            const result = await createCleaningHolidayRange(session, {
                startDate: "2026-12-24",
                endDate: "2026-12-26",
                description: "Libur bersama",
            });

            expect(result.startDate).toBe("2026-12-24");
            expect(result.endDate).toBe("2026-12-26");
            expect(result.created.map((r) => r.wibDate)).toEqual(["2026-12-24", "2026-12-26"]);
            expect(result.skipped).toEqual(["2026-12-25"]);
            expect(tx.cleaningHoliday.create).toHaveBeenCalledTimes(2);
        });

        it("single yang sudah ada tetap 409", async () => {
            const tx = mockTx();
            tx.cleaningHoliday.findMany.mockResolvedValue([{ wibDate: "2026-12-25" }]);

            await expect(
                createCleaningHolidayRange(session, { startDate: "2026-12-25", description: "Natal" })
            ).rejects.toMatchObject({ statusCode: 409 });
            expect(tx.cleaningHoliday.create).not.toHaveBeenCalled();
        });

        it("menolak rentang > 62 hari tanpa menyentuh DB", async () => {
            await expect(
                createCleaningHolidayRange(session, {
                    startDate: "2026-01-01",
                    endDate: "2026-03-04",
                    description: "Terlalu panjang",
                })
            ).rejects.toThrow(/maksimal 62 hari/);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });
});

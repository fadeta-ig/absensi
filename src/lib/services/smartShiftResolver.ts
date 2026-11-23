import {
    addCalendarDays,
    getWIBDayOfWeek,
    getWIBHoursMinutes,
    toUTCDateKey,
    toWIBDateString,
} from "@/lib/timezone";
import type {
    AttendanceActionTarget,
    AttendanceTargetRecords,
    NormalizedShiftWindows,
    ScheduleDay,
    ShiftTolerance,
} from "@/lib/services/attendanceShiftHelper";

interface ShiftClient {
    workShift?: {
        findMany?: (args: { include: { days: true } }) => Promise<RawWorkShiftLike[]>;
    };
}

function parseTimeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
}

function isOvernightSchedule(startTime: string, endTime: string): boolean {
    return parseTimeToMinutes(endTime) < parseTimeToMinutes(startTime);
}

function getNormalizedShiftWindows(
    scheduleDay: ScheduleDay,
    tolerance?: ShiftTolerance
): NormalizedShiftWindows {
    const startMinutes = parseTimeToMinutes(scheduleDay.startTime);
    let endMinutes = parseTimeToMinutes(scheduleDay.endTime);
    const isOvernight = endMinutes < startMinutes;
    if (isOvernight) {
        endMinutes += 24 * 60;
    }
    const earlyIn = tolerance?.earlyCheckIn ?? 0;
    const lateIn = tolerance?.lateCheckIn ?? 0;
    const earlyOut = tolerance?.earlyCheckOut ?? 0;
    const lateOut = tolerance?.lateCheckOut ?? 0;
    return {
        startMinutes,
        endMinutes,
        isOvernight,
        earliestInMinutes: startMinutes - earlyIn,
        lateDeadlineMinutes: startMinutes + lateIn,
        earliestOutMinutes: endMinutes - earlyOut,
        latestOutMinutes: endMinutes + lateOut,
    };
}

export type SmartShiftNumber = 1 | 2 | 3;

export interface StrictShiftTolerance {
    earlyCheckIn: number;
    lateCheckIn: number;
    earlyCheckOut: number;
    lateCheckOut: number;
}

export interface SmartShiftDefinition {
    shiftNumber: SmartShiftNumber;
    id: string;
    name: string;
    shortLabel: string;
    tolerance: StrictShiftTolerance;
    days: ScheduleDay[];
}

export interface SmartShiftOptionDTO {
    shiftNumber: SmartShiftNumber;
    shiftId: string;
    name: string;
    shortLabel: string;
    startTime: string;
    endTime: string;
    isOvernight: boolean;
    isOff: boolean;
    isAvailable: boolean;
    lockedReason: string | null;
}

export interface SmartShiftMomentResolution {
    shiftDate: string;
    isOffDay: boolean;
    activeShift: SmartShiftDefinition | null;
    activeScheduleDay: ScheduleDay | null;
    isOvernight: boolean;
    relativeClockMinutes: number;
    options: SmartShiftOptionDTO[];
}

export interface SmartAttendanceTargetResult {
    target: AttendanceActionTarget;
    activeShift: SmartShiftDefinition | null;
    options: SmartShiftOptionDTO[];
    isOffDay: boolean;
}

/**
 * Toleransi baku lapangan untuk Rotasi 3-Shift sesuai ketetapan operasional:
 * - Boleh masuk lebih awal: 120 menit (2 jam)
 * - Toleransi terlambat masuk: 0 menit
 * - Boleh pulang lebih awal: 0 menit
 * - Boleh pulang lebih lambat: 120 menit (2 jam)
 */
export const SMART_SHIFT_FIELD_TOLERANCE: StrictShiftTolerance = {
    earlyCheckIn: 120,
    lateCheckIn: 0,
    earlyCheckOut: 0,
    lateCheckOut: 120,
};

function buildCanonicalDays(
    weekdayStart: string,
    weekdayEnd: string,
    saturdayStart: string,
    saturdayEnd: string
): ScheduleDay[] {
    return Array.from({ length: 7 }, (_, dayOfWeek) => {
        if (dayOfWeek === 0) {
            return { dayOfWeek: 0, startTime: weekdayStart, endTime: weekdayEnd, isOff: true };
        }
        if (dayOfWeek === 6) {
            return { dayOfWeek: 6, startTime: saturdayStart, endTime: saturdayEnd, isOff: false };
        }
        return { dayOfWeek, startTime: weekdayStart, endTime: weekdayEnd, isOff: false };
    });
}

export const CANONICAL_SMART_SHIFTS: readonly SmartShiftDefinition[] = [
    {
        shiftNumber: 1,
        id: "smart-shift-1",
        name: "Shift 1 — Pagi",
        shortLabel: "Shift 1",
        tolerance: { ...SMART_SHIFT_FIELD_TOLERANCE },
        days: buildCanonicalDays("07:00", "15:00", "07:00", "12:00"),
    },
    {
        shiftNumber: 2,
        id: "smart-shift-2",
        name: "Shift 2 — Siang",
        shortLabel: "Shift 2",
        tolerance: { ...SMART_SHIFT_FIELD_TOLERANCE },
        days: buildCanonicalDays("15:00", "23:00", "12:00", "17:00"),
    },
    {
        shiftNumber: 3,
        id: "smart-shift-3",
        name: "Shift 3 — Malam",
        shortLabel: "Shift 3",
        tolerance: { ...SMART_SHIFT_FIELD_TOLERANCE },
        days: buildCanonicalDays("23:00", "07:00", "17:00", "22:00"),
    },
];

type RawWorkShiftLike = {
    id: string;
    name: string;
    earlyCheckIn?: number | null;
    lateCheckIn?: number | null;
    earlyCheckOut?: number | null;
    lateCheckOut?: number | null;
    days?: ScheduleDay[];
};

function detectShiftNumber(raw: RawWorkShiftLike): SmartShiftNumber | null {
    if (/host\s*live/i.test(raw.name)) return null;
    if (/\bshift\s*1\b/i.test(raw.name)) return 1;
    if (/\bshift\s*2\b/i.test(raw.name)) return 2;
    if (/\bshift\s*3\b/i.test(raw.name)) return 3;

    const monday = raw.days?.find((d) => d.dayOfWeek === 1 && !d.isOff);
    if (!monday) return null;
    if (monday.startTime === "07:00" && monday.endTime === "15:00") return 1;
    if (monday.startTime === "15:00" && monday.endTime === "23:00") return 2;
    if (monday.startTime === "23:00" && monday.endTime === "07:00") return 3;
    return null;
}

/**
 * Mendeteksi apakah baris shift di DB masih berupa seed 24/7 generasi lama
 * (earlyCheckIn=30, lateCheckIn=15, earlyCheckOut=0, lateCheckOut=60, Minggu isOff=false, Sabtu 8 jam).
 * Bila ya, gunakan jadwal & toleransi kanonik lapangan (Sen-Jum 8 jam, Sabtu 5 jam, Minggu Libur, 120/0/0/120)
 * agar deploy ke VPS produksi langsung aman tanpa wajib menjalankan seed CLI (sesuai WORKFLOWS.md §4.7).
 */
function isLegacyUnsynced3ShiftPreset(raw: RawWorkShiftLike): boolean {
    if (
        raw.earlyCheckIn !== 30 ||
        raw.lateCheckIn !== 15 ||
        raw.earlyCheckOut !== 0 ||
        raw.lateCheckOut !== 60
    ) {
        return false;
    }
    const sun = raw.days?.find((d) => d.dayOfWeek === 0);
    const mon = raw.days?.find((d) => d.dayOfWeek === 1);
    const sat = raw.days?.find((d) => d.dayOfWeek === 6);
    if (!sun || !mon || !sat) return false;
    return !sun.isOff && sat.startTime === mon.startTime && sat.endTime === mon.endTime;
}

function formatMinutesToHHMM(totalMinutes: number): string {
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getShiftDayOpeningInfo(shift: SmartShiftDefinition, dayOfWeek: number) {
    const day = shift.days.find((d) => d.dayOfWeek === dayOfWeek) ?? shift.days[1];
    const startMinutes = parseTimeToMinutes(day.startTime);
    const endMinutes = parseTimeToMinutes(day.endTime);
    const earlyCheckIn = shift.tolerance.earlyCheckIn ?? SMART_SHIFT_FIELD_TOLERANCE.earlyCheckIn;
    const openMinutes = Math.max(0, startMinutes - earlyCheckIn);
    const isOvernight = !day.isOff && endMinutes < startMinutes;
    return {
        day,
        startMinutes,
        endMinutes,
        earlyCheckIn,
        openMinutes,
        isOvernight,
    };
}

/**
 * Memetakan daftar WorkShift dari database (Pengaturan Jam Kerja) ke 3 definisi Smart Shift (Shift 1, 2, 3).
 * Mengikuti secara langsung jam masuk, jam pulang, hari libur, serta pengaturan toleransi dari Master Jam Kerja DB
 * (dengan CANONICAL_SMART_SHIFTS sebagai fallback bila shift belum ada di DB).
 */
export function mapToThreeSmartShifts(
    rawShifts: RawWorkShiftLike[] = []
): [SmartShiftDefinition, SmartShiftDefinition, SmartShiftDefinition] {
    const byNumber = new Map<SmartShiftNumber, RawWorkShiftLike>();
    for (const raw of rawShifts) {
        const num = detectShiftNumber(raw);
        if (num && !byNumber.has(num)) {
            byNumber.set(num, raw);
        }
    }

    const mapped = ([1, 2, 3] as const).map((num): SmartShiftDefinition => {
        const canonical = CANONICAL_SMART_SHIFTS[num - 1];
        const found = byNumber.get(num);
        if (!found) return canonical;

        if (isLegacyUnsynced3ShiftPreset(found)) {
            return {
                ...canonical,
                id: found.id,
                name: found.name,
            };
        }

        return {
            shiftNumber: num,
            id: found.id,
            name: found.name,
            shortLabel: `Shift ${num}`,
            tolerance: {
                earlyCheckIn:
                    typeof found.earlyCheckIn === "number"
                        ? found.earlyCheckIn
                        : SMART_SHIFT_FIELD_TOLERANCE.earlyCheckIn,
                lateCheckIn:
                    typeof found.lateCheckIn === "number"
                        ? found.lateCheckIn
                        : SMART_SHIFT_FIELD_TOLERANCE.lateCheckIn,
                earlyCheckOut:
                    typeof found.earlyCheckOut === "number"
                        ? found.earlyCheckOut
                        : SMART_SHIFT_FIELD_TOLERANCE.earlyCheckOut,
                lateCheckOut:
                    typeof found.lateCheckOut === "number"
                        ? found.lateCheckOut
                        : SMART_SHIFT_FIELD_TOLERANCE.lateCheckOut,
            },
            days: canonical.days.map((canonDay) => {
                const dbDay = found.days?.find((d) => d.dayOfWeek === canonDay.dayOfWeek);
                if (!dbDay) return canonDay;
                return {
                    dayOfWeek: dbDay.dayOfWeek,
                    startTime: dbDay.startTime,
                    endTime: dbDay.endTime,
                    isOff: Boolean(dbDay.isOff),
                };
            }),
        };
    });

    return [mapped[0], mapped[1], mapped[2]];
}

/** Memuat 3 shift rotasi dari database (fallback aman ke CANONICAL_SMART_SHIFTS). */
export async function loadThreeRotationShifts(
    client?: ShiftClient | null
): Promise<[SmartShiftDefinition, SmartShiftDefinition, SmartShiftDefinition]> {
    try {
        if (!client?.workShift?.findMany) {
            return mapToThreeSmartShifts([]);
        }
        const rows = await client.workShift.findMany({
            include: { days: true },
        });
        return mapToThreeSmartShifts(rows ?? []);
    } catch {
        return mapToThreeSmartShifts([]);
    }
}

function buildOptionsForDay(
    dayOfWeek: number,
    shifts: [SmartShiftDefinition, SmartShiftDefinition, SmartShiftDefinition],
    activeShiftNumber: SmartShiftNumber | null,
    lockedReasons: Record<SmartShiftNumber, string | null>
): SmartShiftOptionDTO[] {
    return shifts.map((shift) => {
        const day = shift.days.find((d) => d.dayOfWeek === dayOfWeek) ?? shift.days[1];
        const isAvailable = activeShiftNumber === shift.shiftNumber;
        return {
            shiftNumber: shift.shiftNumber,
            shiftId: shift.id,
            name: shift.name,
            shortLabel: shift.shortLabel,
            startTime: day.startTime,
            endTime: day.endTime,
            isOvernight: !day.isOff && isOvernightSchedule(day.startTime, day.endTime),
            isOff: day.isOff,
            isAvailable,
            lockedReason: isAvailable ? null : lockedReasons[shift.shiftNumber],
        };
    });
}

/**
 * Menentukan shift mana yang aktif dan opsi tombol [Shift 1, Shift 2, Shift 3]
 * secara dinamis mengikuti jam mulai (`startTime`), jam selesai (`endTime`), status libur (`isOff`),
 * dan toleransi masuk lebih awal (`earlyCheckIn`) dari Master Jam Kerja (`shifts`).
 */
export function resolveSmartShiftOptionsForMoment(
    now: Date,
    shifts: [SmartShiftDefinition, SmartShiftDefinition, SmartShiftDefinition] = mapToThreeSmartShifts()
): SmartShiftMomentResolution {
    const todayStr = toWIBDateString(now);
    const yesterdayStr = addCalendarDays(todayStr, -1);
    const todayDay = getWIBDayOfWeek(now);
    const yesterdayDay = toUTCDateKey(yesterdayStr).getUTCDay();
    const { hours: nowH, minutes: nowM } = getWIBHoursMinutes(now);
    const currentMinutes = nowH * 60 + nowM;

    const todayW1 = getShiftDayOpeningInfo(shifts[0], todayDay);
    const todayW2 = getShiftDayOpeningInfo(shifts[1], todayDay);
    const todayW3 = getShiftDayOpeningInfo(shifts[2], todayDay);
    const yesterdayW3 = getShiftDayOpeningInfo(shifts[2], yesterdayDay);

    // 1. Dini hari sebelum jendela Shift 1 hari ini dibuka (mis. 00:00 - 04:59 WIB):
    //    masih bagian dari Shift 3 Malam H-1 bila jadwal Shift 3 H-1 adalah lintas hari (overnight).
    const earlyMorningCutoff = todayW1.day.isOff ? 5 * 60 : todayW1.openMinutes;
    if (currentMinutes < earlyMorningCutoff && yesterdayW3.isOvernight) {
        const shift3 = shifts[2];
        return {
            shiftDate: yesterdayStr,
            isOffDay: false,
            activeShift: shift3,
            activeScheduleDay: yesterdayW3.day,
            isOvernight: true,
            relativeClockMinutes: currentMinutes + 24 * 60,
            options: buildOptionsForDay(yesterdayDay, shifts, 3, {
                1: `Dibuka pukul ${formatMinutesToHHMM(todayW1.openMinutes)} WIB`,
                2: `Dibuka pukul ${formatMinutesToHHMM(todayW2.openMinutes)} WIB`,
                3: null,
            }),
        };
    }

    // 2. Hari Libur (bila ketiga shift pada hari ini berstatus isOff = true, mis. Minggu).
    if (todayW1.day.isOff && todayW2.day.isOff && todayW3.day.isOff) {
        const shift1 = shifts[0];
        return {
            shiftDate: todayStr,
            isOffDay: true,
            activeShift: shift1,
            activeScheduleDay: todayW1.day,
            isOvernight: false,
            relativeClockMinutes: currentMinutes,
            options: buildOptionsForDay(todayDay, shifts, null, {
                1: "Hari libur mingguan",
                2: "Hari libur mingguan",
                3: "Hari libur mingguan",
            }),
        };
    }

    // 3. Hari Kerja (Senin - Sabtu, mengikuti jam dinamis masing-masing shift).
    let activeNumber: SmartShiftNumber | null = null;
    const reasons: Record<SmartShiftNumber, string | null> = {
        1: null,
        2: null,
        3: null,
    };

    const open1Label = formatMinutesToHHMM(todayW1.openMinutes);
    const open2Label = formatMinutesToHHMM(todayW2.openMinutes);
    const open3Label = formatMinutesToHHMM(todayW3.openMinutes);

    if (currentMinutes < todayW1.openMinutes) {
        reasons[1] = `Dibuka pukul ${open1Label} WIB`;
        reasons[2] = `Dibuka pukul ${open2Label} WIB`;
        reasons[3] = `Dibuka pukul ${open3Label} WIB`;
    } else if (currentMinutes < todayW2.openMinutes) {
        if (!todayW1.day.isOff) activeNumber = 1;
        else reasons[1] = "Libur shift";
        reasons[2] = `Dibuka pukul ${open2Label} WIB`;
        reasons[3] = `Dibuka pukul ${open3Label} WIB`;
    } else if (currentMinutes < todayW3.openMinutes) {
        if (!todayW2.day.isOff) activeNumber = 2;
        else reasons[2] = "Libur shift";
        reasons[1] = "Sesi masuk Shift 1 telah berakhir";
        reasons[3] = `Dibuka pukul ${open3Label} WIB`;
    } else if (todayW3.isOvernight || currentMinutes < todayW3.endMinutes) {
        if (!todayW3.day.isOff) activeNumber = 3;
        else reasons[3] = "Libur shift";
        reasons[1] = "Sesi masuk Shift 1 telah berakhir";
        reasons[2] = "Sesi masuk Shift 2 telah berakhir";
    } else {
        reasons[1] = "Sesi masuk Shift 1 telah berakhir";
        reasons[2] = "Sesi masuk Shift 2 telah berakhir";
        reasons[3] = "Sesi masuk Shift 3 telah berakhir";
    }

    const activeShift = activeNumber ? shifts[activeNumber - 1] : null;
    const activeScheduleDay = activeShift?.days.find((d) => d.dayOfWeek === todayDay) ?? null;
    const isOvernight = Boolean(
        activeScheduleDay &&
            !activeScheduleDay.isOff &&
            isOvernightSchedule(activeScheduleDay.startTime, activeScheduleDay.endTime)
    );

    return {
        shiftDate: todayStr,
        isOffDay: false,
        activeShift,
        activeScheduleDay,
        isOvernight,
        relativeClockMinutes: currentMinutes,
        options: buildOptionsForDay(todayDay, shifts, activeNumber, reasons),
    };
}

export interface InferredSmartShift {
    shift: SmartShiftDefinition;
    scheduleDay: ScheduleDay;
    isOvernight: boolean;
    relativeClockMinutes: number;
    windows: ReturnType<typeof getNormalizedShiftWindows>;
    computedStatus: "present" | "late";
}

/**
 * Mendeteksi secara deterministik Shift 1, Shift 2, atau Shift 3 dari timestamp `clockIn`
 * dan `shiftDateStr` (YYYY-MM-DD) secara dinamis mengikuti jendela `startTime - earlyCheckIn`
 * dari Master Jam Kerja (`shifts`).
 */
export function inferSmartShiftFromClockIn(
    shiftDateStr: string,
    clockIn: Date | string | null | undefined,
    shifts: [SmartShiftDefinition, SmartShiftDefinition, SmartShiftDefinition] = mapToThreeSmartShifts()
): InferredSmartShift | null {
    if (!clockIn) return null;
    const clockInDate = clockIn instanceof Date ? clockIn : new Date(clockIn);
    if (Number.isNaN(clockInDate.getTime())) return null;

    const dayOfWeek = toUTCDateKey(shiftDateStr).getUTCDay();
    const clockInWibDate = toWIBDateString(clockInDate);
    const { hours, minutes } = getWIBHoursMinutes(clockInDate);
    const wallMinutes = hours * 60 + minutes;

    const w2 = getShiftDayOpeningInfo(shifts[1], dayOfWeek);
    const w3 = getShiftDayOpeningInfo(shifts[2], dayOfWeek);

    let shiftNumber: SmartShiftNumber;
    if (clockInWibDate > shiftDateStr) {
        // Clock-in terjadi pada tanggal H+1 (dini hari) -> Shift 3 Malam lintas hari
        shiftNumber = 3;
    } else if (wallMinutes < w2.openMinutes) {
        shiftNumber = 1;
    } else if (wallMinutes < w3.openMinutes) {
        shiftNumber = 2;
    } else {
        shiftNumber = 3;
    }

    const shift = shifts[shiftNumber - 1];
    const scheduleDay = shift.days.find((d) => d.dayOfWeek === dayOfWeek) ?? shift.days[1];
    const isOvernight = !scheduleDay.isOff && isOvernightSchedule(scheduleDay.startTime, scheduleDay.endTime);
    const windows = getNormalizedShiftWindows(scheduleDay, shift.tolerance);

    let relativeClockMinutes = wallMinutes;
    const earlyCheckInMinutes = shift.tolerance.earlyCheckIn ?? 120;
    if (isOvernight && (clockInWibDate > shiftDateStr || wallMinutes < windows.startMinutes - earlyCheckInMinutes)) {
        relativeClockMinutes += 24 * 60;
    }

    const computedStatus: "present" | "late" =
        scheduleDay.isOff || relativeClockMinutes <= windows.lateDeadlineMinutes ? "present" : "late";

    return {
        shift,
        scheduleDay,
        isOvernight,
        relativeClockMinutes,
        windows,
        computedStatus,
    };
}

/**
 * Resolusi target presensi (CLOCK_IN / CLOCK_OUT / ALREADY_COMPLETED) khusus peserta Smart 3-Shift.
 */
export function resolveSmartAttendanceTarget(
    now: Date = new Date(),
    shifts: [SmartShiftDefinition, SmartShiftDefinition, SmartShiftDefinition] = mapToThreeSmartShifts(),
    records: AttendanceTargetRecords = {}
): SmartAttendanceTargetResult {
    const todayStr = toWIBDateString(now);
    const yesterdayStr = addCalendarDays(todayStr, -1);
    const todayDay = getWIBDayOfWeek(now);
    const { hours: nowH, minutes: nowM } = getWIBHoursMinutes(now);
    const currentMinutes = nowH * 60 + nowM;

    const momentResolution = resolveSmartShiftOptionsForMoment(now, shifts);

    // 1. Cek record hari ini
    const todayRecord = records.today;
    if (todayRecord) {
        const inferred = inferSmartShiftFromClockIn(todayStr, todayRecord.clockIn, shifts);
        const shift = inferred?.shift ?? momentResolution.activeShift ?? shifts[0];
        const scheduleDay =
            inferred?.scheduleDay ??
            shift.days.find((d) => d.dayOfWeek === todayDay) ??
            null;
        const isOvernight = inferred?.isOvernight ?? false;

        if (todayRecord.clockOut) {
            return {
                target: {
                    mode: "ALREADY_COMPLETED",
                    existingRecord: todayRecord,
                    shiftDate: todayStr,
                    scheduleDay,
                    isOvernight,
                    relativeClockMinutes: currentMinutes,
                },
                activeShift: shift,
                options: momentResolution.options,
                isOffDay: Boolean(todayRecord.isOffDay),
            };
        }

        return {
            target: {
                mode: "CLOCK_OUT",
                existingRecord: todayRecord,
                shiftDate: todayStr,
                scheduleDay,
                isOvernight,
                relativeClockMinutes: currentMinutes,
            },
            activeShift: shift,
            options: momentResolution.options,
            isOffDay: Boolean(todayRecord.isOffDay),
        };
    }

    // 2. Cek record H-1 yang masih terbuka (!clockOut)
    const yesterdayRecord = records.yesterday;
    if (yesterdayRecord && !yesterdayRecord.clockOut) {
        const inferredYesterday = inferSmartShiftFromClockIn(yesterdayStr, yesterdayRecord.clockIn, shifts);
        const isYesterdayOvernight = inferredYesterday?.isOvernight ?? false;
        const todayW1 = getShiftDayOpeningInfo(shifts[0], todayDay);
        const todayW2 = getShiftDayOpeningInfo(shifts[1], todayDay);
        const isTodayAllOff = todayW1.day.isOff && todayW2.day.isOff;

        // Batas cutoff pagi untuk menutup Shift 3 H-1 adalah sebelum jendela Shift 2 hari ini dimulai
        const overnightMorningCutoffMinutes = isTodayAllOff ? 24 * 60 : todayW2.openMinutes;
        // Untuk Shift 2 H-1 yang pulang sedikit lewat tengah malam (sebelum jendela Shift 1 hari ini dibuka)
        const sameDayAfterMidnightCutoffMinutes = isTodayAllOff ? 5 * 60 : todayW1.openMinutes;

        const canCloseYesterday = isYesterdayOvernight
            ? currentMinutes < overnightMorningCutoffMinutes
            : currentMinutes < sameDayAfterMidnightCutoffMinutes;

        if (canCloseYesterday) {
            const yesterdayShift = inferredYesterday?.shift ?? shifts[2];
            const yesterdayDay = toUTCDateKey(yesterdayStr).getUTCDay();
            const yesterdaySchedule =
                inferredYesterday?.scheduleDay ??
                yesterdayShift.days.find((d) => d.dayOfWeek === yesterdayDay) ??
                null;

            return {
                target: {
                    mode: "CLOCK_OUT",
                    existingRecord: yesterdayRecord,
                    shiftDate: yesterdayStr,
                    scheduleDay: yesterdaySchedule,
                    isOvernight: isYesterdayOvernight,
                    relativeClockMinutes: currentMinutes + 24 * 60,
                },
                activeShift: yesterdayShift,
                options: momentResolution.options,
                isOffDay: Boolean(yesterdayRecord.isOffDay),
            };
        }
    }

    // 3. Bila target momentResolution jatuh pada H-1 (dini hari 00:00-04:59 WIB) namun record H-1 sudah selesai (clockOut != null)
    if (momentResolution.shiftDate === yesterdayStr && yesterdayRecord && yesterdayRecord.clockOut) {
        return {
            target: {
                mode: "ALREADY_COMPLETED",
                existingRecord: yesterdayRecord,
                shiftDate: yesterdayStr,
                scheduleDay: momentResolution.activeScheduleDay,
                isOvernight: momentResolution.isOvernight,
                relativeClockMinutes: momentResolution.relativeClockMinutes,
            },
            activeShift: momentResolution.activeShift,
            options: momentResolution.options,
            isOffDay: Boolean(yesterdayRecord.isOffDay),
        };
    }

    // 4. CLOCK_IN baru
    return {
        target: {
            mode: "CLOCK_IN",
            existingRecord: null,
            shiftDate: momentResolution.shiftDate,
            scheduleDay: momentResolution.activeScheduleDay,
            isOvernight: momentResolution.isOvernight,
            relativeClockMinutes: momentResolution.relativeClockMinutes,
        },
        activeShift: momentResolution.activeShift,
        options: momentResolution.options,
        isOffDay: momentResolution.isOffDay,
    };
}

import { toWIBDateString } from "@/lib/timezone";

export interface EmployeeBirthday {
    employeeId: string;
    name: string;
    month: number;
    day: number;
}

interface BirthdayRecord {
    employeeId?: unknown;
    name?: unknown;
    month?: unknown;
    day?: unknown;
}

export const INDONESIAN_MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

export function isValidMonthDay(month: number, day: number): boolean {
    if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (month < 1 || month > 12 || day < 1) return false;

    // Leap year 2000 permits February 29 while still rejecting impossible dates.
    return day <= new Date(Date.UTC(2000, month, 0)).getUTCDate();
}

export function toEmployeeBirthday(
    employeeId: string,
    name: string,
    birthDate: Date,
): EmployeeBirthday {
    return {
        employeeId,
        name,
        month: birthDate.getUTCMonth() + 1,
        day: birthDate.getUTCDate(),
    };
}

/** Validate the internal API payload before it is rendered in the calendar. */
export function normalizeBirthdayPayload(payload: unknown): EmployeeBirthday[] {
    if (!Array.isArray(payload)) return [];

    const uniqueBirthdays = new Map<string, EmployeeBirthday>();

    for (const rawRecord of payload) {
        if (!rawRecord || typeof rawRecord !== "object") continue;

        const record = rawRecord as BirthdayRecord;
        const employeeId = typeof record.employeeId === "string" ? record.employeeId.trim() : "";
        const name = typeof record.name === "string" ? record.name.trim() : "";
        const month = typeof record.month === "number" ? record.month : Number.NaN;
        const day = typeof record.day === "number" ? record.day : Number.NaN;

        if (!employeeId || !name || !isValidMonthDay(month, day)) continue;
        uniqueBirthdays.set(employeeId, { employeeId, name, month, day });
    }

    return [...uniqueBirthdays.values()].sort((a, b) =>
        a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, "id-ID")
    );
}

export function groupBirthdaysByDay(
    birthdays: EmployeeBirthday[],
    month: number,
): Map<number, EmployeeBirthday[]> {
    const result = new Map<number, EmployeeBirthday[]>();

    for (const birthday of birthdays) {
        if (birthday.month !== month) continue;
        const current = result.get(birthday.day) || [];
        current.push(birthday);
        result.set(birthday.day, current);
    }

    return result;
}

export type BirthdayMilestone = "H-0" | "H-7" | "H-14" | "H-30" | "UPCOMING";
export type BirthdayWeekCategory = "week-1" | "week-2" | "next-weeks";

export interface BirthdayPreparationInfo {
    id?: string;
    statusId: string | null;
    statusName: string | null;
    statusColor: string | null;
    notes: string | null;
    updatedBy?: string | null;
    updatedAt?: string | null;
}

export interface BirthdayEmployeeDetail {
    id: string;
    employeeId: string;
    name: string;
    avatarUrl: string | null;
    department: string;
    division: string | null;
    position: string;
    gender: string;
    birthDate: string; // YYYY-MM-DD
    birthDateFormatted: string; // e.g. "15 September"
    birthMonth: number; // 1-12
    birthDay: number; // 1-31
    birthYear: number;
    ageTurning: number;
    daysUntil: number; // 0 = today, 1..365
    isToday: boolean;
    milestone: BirthdayMilestone;
    weekCategory: BirthdayWeekCategory;
    preparation: BirthdayPreparationInfo | null;
}

export interface BirthdayOverviewResult {
    selectedMonth: number;
    selectedYear: number;
    currentMonth: {
        month: number;
        year: number;
        monthName: string;
        total: number;
        week1: BirthdayEmployeeDetail[]; // day 1 - 7
        week2: BirthdayEmployeeDetail[]; // day 8 - 14
        nextWeeks: BirthdayEmployeeDetail[]; // day 15 - akhir bulan
        all: BirthdayEmployeeDetail[];
    };
    upcoming: {
        h0: BirthdayEmployeeDetail[];
        h7: BirthdayEmployeeDetail[];
        h14: BirthdayEmployeeDetail[];
        h30: BirthdayEmployeeDetail[];
        all: BirthdayEmployeeDetail[];
    };
    summary: {
        totalThisMonth: number;
        totalToday: number;
        totalH7: number;
        totalH14: number;
        totalH30: number;
        totalEmployeesWithBirthDate: number;
    };
    allEmployees: BirthdayEmployeeDetail[];
}

/**
 * Calculate birthday metrics (daysUntil, ageTurning, milestone, weekCategory).
 * Accurate with WIB timezone dates.
 */
export function calculateBirthdayMetrics(
    birthDate: Date,
    refDate: Date = new Date(),
): {
    birthMonth: number;
    birthDay: number;
    birthYear: number;
    birthDateFormatted: string;
    ageTurning: number;
    daysUntil: number;
    isToday: boolean;
    milestone: BirthdayMilestone;
    weekCategory: BirthdayWeekCategory;
} {
    const birthMonth = birthDate.getUTCMonth() + 1;
    const birthDay = birthDate.getUTCDate();
    const birthYear = birthDate.getUTCFullYear();

    const wibRefStr = toWIBDateString(refDate); // "YYYY-MM-DD"
    const [refY, refM, refD] = wibRefStr.split("-").map(Number);
    const todayMidnight = new Date(Date.UTC(refY, refM - 1, refD));

    // Next birthday candidate in current ref year
    let nextBdayYear = refY;
    let nextBday = new Date(Date.UTC(nextBdayYear, birthMonth - 1, birthDay));

    // If candidate is before today in UTC calendar days, birthday in refYear has passed
    if (nextBday < todayMidnight) {
        nextBdayYear = refY + 1;
        nextBday = new Date(Date.UTC(nextBdayYear, birthMonth - 1, birthDay));
    }

    const diffMs = nextBday.getTime() - todayMidnight.getTime();
    const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const isToday = daysUntil === 0;
    const ageTurning = nextBdayYear - birthYear;

    let milestone: BirthdayMilestone = "UPCOMING";
    if (daysUntil === 0) {
        milestone = "H-0";
    } else if (daysUntil <= 7) {
        milestone = "H-7";
    } else if (daysUntil <= 14) {
        milestone = "H-14";
    } else if (daysUntil <= 30) {
        milestone = "H-30";
    }

    let weekCategory: BirthdayWeekCategory = "next-weeks";
    if (birthDay <= 7) {
        weekCategory = "week-1";
    } else if (birthDay <= 14) {
        weekCategory = "week-2";
    }

    const monthName = INDONESIAN_MONTHS[birthMonth - 1] || "";
    const birthDateFormatted = `${birthDay} ${monthName}`;

    return {
        birthMonth,
        birthDay,
        birthYear,
        birthDateFormatted,
        ageTurning,
        daysUntil,
        isToday,
        milestone,
        weekCategory,
    };
}

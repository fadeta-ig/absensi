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

function isValidMonthDay(month: number, day: number): boolean {
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

/**
 * Kontrak sapaan beranda employee.
 *
 * Modul ini bebas dari Prisma/Node agar dapat dipakai halaman client, service
 * server, dan test. Sapaan dikelola sebagai aturan CRUD: setiap aturan punya
 * jendela jam WIB, hari mingguan atau satu tanggal, prioritas, dan status aktif.
 *
 * "Waktu server belum tersedia" BUKAN sapaan. Kondisi itu dikomunikasikan lewat
 * banner peringatan di beranda; saat jam server belum diketahui, kartu memakai
 * sapaan netral `FALLBACK_GREETING`.
 */

export type GreetingSlot = "pagi" | "siang" | "sore" | "malam";

export interface GreetingCopy {
    greeting: string;
    subGreeting: string;
}

export type GreetingCopyMap = Record<GreetingSlot, GreetingCopy>;

export const MAX_GREETING_NAME_LENGTH = 100;
export const MAX_GREETING_LENGTH = 120;
export const MAX_SUB_GREETING_LENGTH = 500;
export const MAX_GREETING_PRIORITY = 9999;

export const GREETING_DAYS = [
    { value: 0, short: "Min", label: "Minggu" },
    { value: 1, short: "Sen", label: "Senin" },
    { value: 2, short: "Sel", label: "Selasa" },
    { value: 3, short: "Rab", label: "Rabu" },
    { value: 4, short: "Kam", label: "Kamis" },
    { value: 5, short: "Jum", label: "Jumat" },
    { value: 6, short: "Sab", label: "Sabtu" },
] as const;

/** Teks bawaan saat tidak ada aturan yang cocok (perilaku lama dipertahankan). */
export const DEFAULT_GREETING_COPY: GreetingCopyMap = {
    pagi: {
        greeting: "Selamat Pagi!",
        subGreeting: "Awali hari dengan semangat dan senyuman. Siap untuk mencapai target hari ini!",
    },
    siang: {
        greeting: "Selamat Siang!",
        subGreeting: "Tetap fokus dan produktif di tengah hari. Jangan lupa luangkan waktu sejenak untuk istirahat.",
    },
    sore: {
        greeting: "Selamat Sore!",
        subGreeting: "Terus melangkah walau lelah mulai terasa. Selesaikan tugas hari ini dengan standar kualitas tertinggi dan dedikasi penuh!",
    },
    malam: {
        greeting: "Selamat Malam!",
        subGreeting: "Waktunya istirahat dan persiapkan diri untuk hari esok yang lebih baik.",
    },
};

/**
 * Sapaan netral saat jam server belum diketahui. Bukan pesan error dan tidak
 * dapat diedit lewat GUI karena bukan bagian dari pembagian waktu.
 */
export const FALLBACK_GREETING: GreetingCopy = {
    greeting: "Selamat Datang!",
    subGreeting: "Semoga aktivitas Anda hari ini berjalan lancar dan menyenangkan.",
};

export interface GreetingRuleView {
    id: string;
    name: string;
    greeting: string;
    subGreeting: string;
    startTime: string;
    endTime: string;
    repeatWeekly: boolean;
    daysOfWeek: number[];
    specificDate: string | null;
    priority: number;
    isActive: boolean;
}

export type GreetingRuleInput = Omit<GreetingRuleView, "id">;

export type GreetingRuleLike = Pick<
    GreetingRuleView,
    | "greeting"
    | "subGreeting"
    | "startTime"
    | "endTime"
    | "repeatWeekly"
    | "daysOfWeek"
    | "specificDate"
    | "priority"
>;

export interface GreetingMoment {
    /** Tanggal WIB `YYYY-MM-DD`. */
    wibDate: string;
    /** Jam WIB 0–23. */
    hour: number;
    /** Menit WIB 0–59. */
    minute: number;
}

/** Pilih slot fallback dari jam WIB. `null` berarti jam belum diketahui. */
export function resolveGreetingSlot(hour: number | null): GreetingSlot | null {
    if (hour === null) return null;
    if (hour >= 5 && hour < 11) return "pagi";
    if (hour >= 11 && hour < 15) return "siang";
    if (hour >= 15 && hour < 18) return "sore";
    return "malam";
}

/** `HH:mm` → menit sejak 00.00; `null` bila format tidak valid. */
export function parseTimeToMinutes(value: string): number | null {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

/** Hari dalam minggu untuk tanggal WIB `YYYY-MM-DD` (0=Minggu). */
export function wibDayOfWeek(wibDate: string): number {
    const [year, month, day] = wibDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Geser tanggal WIB `YYYY-MM-DD` sebanyak `days` hari. */
export function shiftDateString(wibDate: string, days: number): string {
    const [year, month, day] = wibDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

/** Apakah aturan cocok dengan jam/hari WIB saat ini. */
export function greetingRuleMatches(rule: GreetingRuleLike, moment: GreetingMoment): boolean {
    const start = parseTimeToMinutes(rule.startTime);
    const end = parseTimeToMinutes(rule.endTime);
    if (start === null || end === null || start === end) return false;

    const now = moment.hour * 60 + moment.minute;
    const overnight = start > end;
    const inWindow = overnight ? now >= start || now < end : now >= start && now < end;
    if (!inWindow) return false;

    // Lintas hari: jam setelah tengah malam masih milik hari keberangkatan.
    const effectiveDate = overnight && now < end ? shiftDateString(moment.wibDate, -1) : moment.wibDate;

    if (rule.repeatWeekly) {
        return rule.daysOfWeek.includes(wibDayOfWeek(effectiveDate));
    }
    return rule.specificDate === effectiveDate;
}

/**
 * Pilih sapaan aktif dengan prioritas tertinggi yang cocok. Bila tidak ada,
 * jatuh ke teks bawaan per jam (perilaku lama) atau sapaan netral.
 */
export function resolveGreetingForMoment(
    rules: readonly GreetingRuleLike[],
    moment: GreetingMoment
): GreetingCopy {
    const sorted = [...rules].sort((a, b) => b.priority - a.priority);
    for (const rule of sorted) {
        if (greetingRuleMatches(rule, moment)) {
            return { greeting: rule.greeting, subGreeting: rule.subGreeting };
        }
    }
    const slot = resolveGreetingSlot(moment.hour);
    return slot ? DEFAULT_GREETING_COPY[slot] : FALLBACK_GREETING;
}

/** Label hari untuk daftar aturan, mis. "Sen, Sel, Rab". */
export function formatGreetingDays(days: readonly number[]): string {
    if (days.length === 0) return "Tidak ada hari";
    if (days.length >= 7) return "Setiap hari";
    return GREETING_DAYS.filter((day) => days.includes(day.value))
        .map((day) => day.short)
        .join(", ");
}

/** Label jendela jam, menandai lintas hari bila `endTime < startTime`. */
export function formatGreetingWindow(startTime: string, endTime: string): string {
    const start = parseTimeToMinutes(startTime);
    const end = parseTimeToMinutes(endTime);
    const overnight = start !== null && end !== null && start > end;
    return `${startTime}–${endTime} WIB${overnight ? " (lintas hari)" : ""}`;
}

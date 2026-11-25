/**
 * Kontrak sapaan beranda employee.
 *
 * Modul ini bebas dari Prisma/Node agar dapat dipakai halaman client, service
 * server, dan test. Sapaan dikelola dalam 3 lapis prioritas:
 * 1. Aturan sapaan terjadwal (`GreetingRule`, prioritas tertinggi yang cocok).
 * 2. Quotes kiriman karyawan yang telah disetujui (`APPROVED`) untuk slot aktif
 *    (Pagi/Siang/Sore/Malam + Semua Waktu), berotasi deterministik setiap hari WIB.
 * 3. Teks bawaan per jam (`DEFAULT_GREETING_COPY`) atau netral (`FALLBACK_GREETING`).
 *
 * "Waktu server belum tersedia" BUKAN sapaan. Kondisi itu dikomunikasikan lewat
 * banner peringatan di beranda; saat jam server belum diketahui, kartu memakai
 * sapaan netral `FALLBACK_GREETING`.
 */

export type GreetingSlot = "pagi" | "siang" | "sore" | "malam";

export type GreetingQuoteSlotValue = "ALL" | "PAGI" | "SIANG" | "SORE" | "MALAM";

export type GreetingQuoteStatusValue = "PENDING" | "APPROVED" | "REJECTED";

export interface GreetingCopy {
    greeting: string;
    subGreeting: string;
    authorName?: string | null;
}

export type GreetingCopyMap = Record<GreetingSlot, GreetingCopy>;

export const MAX_GREETING_NAME_LENGTH = 100;
export const MAX_GREETING_LENGTH = 120;
export const MAX_SUB_GREETING_LENGTH = 500;
export const MAX_GREETING_AUTHOR_LENGTH = 120;
export const MAX_GREETING_QUOTE_LENGTH = 500;
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

export const GREETING_QUOTE_SLOTS: readonly {
    value: GreetingQuoteSlotValue;
    label: string;
    shortLabel: string;
    hours: string;
}[] = [
    { value: "ALL", label: "Semua Waktu", shortLabel: "Semua Waktu", hours: "00.00–23.59 WIB" },
    { value: "PAGI", label: "Pagi (05.00–10.59 WIB)", shortLabel: "Pagi", hours: "05.00–10.59 WIB" },
    { value: "SIANG", label: "Siang (11.00–14.59 WIB)", shortLabel: "Siang", hours: "11.00–14.59 WIB" },
    { value: "SORE", label: "Sore (15.00–17.59 WIB)", shortLabel: "Sore", hours: "15.00–17.59 WIB" },
    { value: "MALAM", label: "Malam (18.00–04.59 WIB)", shortLabel: "Malam", hours: "18.00–04.59 WIB" },
] as const;

export const GREETING_QUOTE_STATUSES: readonly {
    value: GreetingQuoteStatusValue;
    label: string;
    badgeClass: string;
}[] = [
    {
        value: "PENDING",
        label: "Menunggu",
        badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    },
    {
        value: "APPROVED",
        label: "Ditampilkan",
        badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    },
    {
        value: "REJECTED",
        label: "Tidak Ditampilkan",
        badgeClass: "bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    },
] as const;

export function getGreetingQuoteSlotMeta(slot: string) {
    return GREETING_QUOTE_SLOTS.find((item) => item.value === slot) ?? GREETING_QUOTE_SLOTS[0];
}

export function getGreetingQuoteStatusMeta(status: string) {
    return GREETING_QUOTE_STATUSES.find((item) => item.value === status) ?? GREETING_QUOTE_STATUSES[0];
}

/** Teks bawaan saat tidak ada aturan atau quotes karyawan yang cocok. */
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
    authorName?: string | null;
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
    | "authorName"
    | "startTime"
    | "endTime"
    | "repeatWeekly"
    | "daysOfWeek"
    | "specificDate"
    | "priority"
>;

export interface GreetingQuoteLike {
    id: string;
    greeting: string | null;
    quote: string;
    authorName: string | null;
    slot: GreetingQuoteSlotValue;
}

export interface EmployeeGreetingQuoteView extends GreetingQuoteLike {
    employeeId: string;
    submitterName: string;
    departmentName: string;
    shiftDate: string;
    status: GreetingQuoteStatusValue;
    reviewedAt: string | null;
    createdAt: string;
}

export interface GreetingQuoteUpdateInput {
    quote: string;
    greeting?: string | null;
    authorName?: string | null;
    slot: GreetingQuoteSlotValue;
    status: GreetingQuoteStatusValue;
}

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

export function slotToQuoteSlot(slot: GreetingSlot): GreetingQuoteSlotValue {
    switch (slot) {
        case "pagi":
            return "PAGI";
        case "siang":
            return "SIANG";
        case "sore":
            return "SORE";
        case "malam":
            return "MALAM";
    }
}

const SLOT_ROTATION_OFFSET: Record<GreetingSlot, number> = {
    pagi: 0,
    siang: 1,
    sore: 2,
    malam: 3,
};

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

/** Nomor hari deterministik (hari sejak epoch UTC) dari tanggal WIB `YYYY-MM-DD`. */
export function wibDateToDayNumber(wibDate: string): number {
    const [year, month, day] = wibDate.split("-").map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return 0;
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
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
 * Pilih 1 quotes karyawan yang disetujui untuk slot WIB saat ini secara
 * deterministik (berotasi otomatis setiap ganti hari WIB dan berbeda antar slot
 * untuk quotes bertipe `ALL`).
 */
export function pickDailyGreetingQuote(
    approvedQuotes: readonly GreetingQuoteLike[],
    moment: GreetingMoment
): GreetingQuoteLike | null {
    if (approvedQuotes.length === 0) return null;
    const slot = resolveGreetingSlot(moment.hour);
    if (!slot) return null;

    const targetSlot = slotToQuoteSlot(slot);
    const pool = approvedQuotes.filter((item) => item.slot === targetSlot || item.slot === "ALL");
    if (pool.length === 0) return null;

    const dayNumber = wibDateToDayNumber(moment.wibDate);
    const offset = SLOT_ROTATION_OFFSET[slot];
    const index = (((dayNumber + offset) % pool.length) + pool.length) % pool.length;
    return pool[index] ?? null;
}

/**
 * Pilih sapaan aktif:
 * 1. Aturan sapaan terjadwal (`GreetingRule`) prioritas tertinggi yang cocok.
 * 2. Quotes karyawan disetujui (`APPROVED`) untuk slot aktif (rotasi harian WIB).
 * 3. Teks bawaan per jam (`DEFAULT_GREETING_COPY`) atau netral (`FALLBACK_GREETING`).
 */
export function resolveGreetingForMoment(
    rules: readonly GreetingRuleLike[],
    moment: GreetingMoment,
    approvedQuotes: readonly GreetingQuoteLike[] = []
): GreetingCopy {
    const sorted = [...rules].sort((a, b) => b.priority - a.priority);
    for (const rule of sorted) {
        if (greetingRuleMatches(rule, moment)) {
            return {
                greeting: rule.greeting,
                subGreeting: rule.subGreeting,
                authorName: rule.authorName?.trim() || null,
            };
        }
    }

    const slot = resolveGreetingSlot(moment.hour);
    if (slot) {
        const pickedQuote = pickDailyGreetingQuote(approvedQuotes, moment);
        if (pickedQuote) {
            return {
                greeting: pickedQuote.greeting?.trim() || DEFAULT_GREETING_COPY[slot].greeting,
                subGreeting: pickedQuote.quote,
                authorName: pickedQuote.authorName?.trim() || null,
            };
        }
        return DEFAULT_GREETING_COPY[slot];
    }

    return FALLBACK_GREETING;
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

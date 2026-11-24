import { getWIBHoursMinutes } from "@/lib/timezone";

export type StressmeterTopicValue =
    | "WORKLOAD"
    | "TEAM_LEADERSHIP"
    | "FACILITIES"
    | "PERSONAL"
    | "OTHER";

export type AnonymousShareStatusValue = "NEW" | "READ" | "FOLLOWED_UP";

export interface StressmeterScaleItem {
    rating: 1 | 2 | 3 | 4 | 5;
    label: string;
    shortLabel: string;
    badgeClass: string;
    barClass: string;
    textClass: string;
}

export const STRESSMETER_SCALE: readonly StressmeterScaleItem[] = [
    {
        rating: 1,
        label: "Feel So Bad",
        shortLabel: "1★ Feel So Bad",
        badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800",
        barClass: "bg-rose-500",
        textClass: "text-rose-600 dark:text-rose-400",
    },
    {
        rating: 2,
        label: "Cukup Frustasi",
        shortLabel: "2★ Cukup Frustasi",
        badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800",
        barClass: "bg-amber-500",
        textClass: "text-amber-600 dark:text-amber-400",
    },
    {
        rating: 3,
        label: "Netral",
        shortLabel: "3★ Netral",
        badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
        barClass: "bg-slate-400",
        textClass: "text-slate-600 dark:text-slate-300",
    },
    {
        rating: 4,
        label: "Cukup Terdorong",
        shortLabel: "4★ Cukup Terdorong",
        badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800",
        barClass: "bg-sky-500",
        textClass: "text-sky-600 dark:text-sky-400",
    },
    {
        rating: 5,
        label: "Sangat Termotivasi",
        shortLabel: "5★ Sangat Termotivasi",
        badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
        barClass: "bg-emerald-500",
        textClass: "text-emerald-600 dark:text-emerald-400",
    },
] as const;

export function getStressmeterScale(rating: number | null | undefined): StressmeterScaleItem | null {
    if (!rating) return null;
    return STRESSMETER_SCALE.find((item) => item.rating === rating) ?? null;
}

export const STRESSMETER_TOPICS: ReadonlyArray<{
    value: StressmeterTopicValue;
    label: string;
}> = [
    { value: "WORKLOAD", label: "Beban Kerja" },
    { value: "TEAM_LEADERSHIP", label: "Rekan & Atasan" },
    { value: "FACILITIES", label: "Fasilitas & Lingkungan" },
    { value: "PERSONAL", label: "Hal Pribadi" },
    { value: "OTHER", label: "Lainnya" },
] as const;

export function getStressmeterTopicLabel(topic: string): string {
    return STRESSMETER_TOPICS.find((t) => t.value === topic)?.label ?? "Lainnya";
}

export const ANONYMOUS_SHARE_STATUSES: ReadonlyArray<{
    value: AnonymousShareStatusValue;
    label: string;
    badgeClass: string;
}> = [
    {
        value: "NEW",
        label: "Baru",
        badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800",
    },
    {
        value: "READ",
        label: "Dibaca",
        badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800",
    },
    {
        value: "FOLLOWED_UP",
        label: "Ditindaklanjuti",
        badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    },
] as const;

export function getAnonymousShareStatusMeta(status: string) {
    return (
        ANONYMOUS_SHARE_STATUSES.find((s) => s.value === status) ?? ANONYMOUS_SHARE_STATUSES[0]
    );
}

/** Label waktu WIB yang natural untuk sapaan pop-up (mendukung shift pagi/siang/sore/malam). */
export function getWibTimePeriodLabel(date: Date = new Date()): string {
    const { hours } = getWIBHoursMinutes(date);
    if (hours >= 4 && hours < 11) return "pagi ini";
    if (hours >= 11 && hours < 15) return "siang ini";
    if (hours >= 15 && hours < 18) return "sore ini";
    return "malam ini";
}

export const STRESSMETER_SETTING_KEY = "stressmeter.enabled";

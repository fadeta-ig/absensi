import {
    formatWIBDateTime,
    isValidCalendarDate,
    wibDateTimeToDate,
} from "@/lib/timezone";
import type {
    AnonymousShareStatusValue,
    StressmeterTopicValue,
} from "@/lib/stressmeterConstants";

export interface StressmeterOverviewData {
    enabled: boolean;
    range: { from: string; to: string };
    kpi: {
        averageRating: number | null;
        totalRated: number;
        totalSkipped: number;
        totalClockIns: number;
        participationRate: number;
        lowMoodCount: number;
        newAnonymousShares: number;
    };
    distribution: Array<{
        rating: 1 | 2 | 3 | 4 | 5;
        count: number;
        percentage: number;
    }>;
    dailyTrend: Array<{
        date: string;
        averageRating: number | null;
        ratedCount: number;
        lowCount: number;
        skippedCount: number;
    }>;
    departmentBreakdown: Array<{
        departmentId: string;
        departmentName: string;
        averageRating: number | null;
        ratedCount: number;
        lowCount: number;
        skippedCount: number;
    }>;
    attentionList: Array<{
        employeeId: string;
        employeeName: string;
        departmentName: string;
        lowCount: number;
        totalCount: number;
        averageRating: number;
        latestRating: number;
        latestShiftDate: string;
    }>;
    logs: Array<{
        id: string;
        employeeId: string;
        employeeName: string;
        departmentName: string;
        shiftDate: string;
        rating: number | null;
        skipped: boolean;
    }>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    departments: Array<{ id: string; name: string }>;
}

export interface AnonymousShareItem {
    id: string;
    submittedWibDate: string;
    topic: StressmeterTopicValue;
    message: string;
    status: AnonymousShareStatusValue;
    hrNote: string | null;
    reviewedAt: string | null;
}

export interface AnonymousSharesData {
    items: AnonymousShareItem[];
    counts: Record<"ALL" | AnonymousShareStatusValue, number>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export function formatStressmeterDate(wibDate: string): string {
    if (!isValidCalendarDate(wibDate)) return wibDate;
    return formatWIBDateTime(wibDateTimeToDate(wibDate, "00:00:00"), {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export function formatShortDayMonth(wibDate: string): string {
    if (!isValidCalendarDate(wibDate)) return wibDate;
    return formatWIBDateTime(wibDateTimeToDate(wibDate, "00:00:00"), {
        day: "numeric",
        month: "short",
    });
}

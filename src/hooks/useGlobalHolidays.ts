"use client";

import { useEffect, useMemo, useState } from "react";
import type { IndonesianHoliday } from "@/lib/services/holidayService";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

/** Cache modul: satu fetch per kombinasi tahun-bulan dipakai ulang semua kalender. */
const globalHolidayCache = new Map<string, IndonesianHoliday[]>();

function cacheKey(year: number, month?: number): string {
    return month === undefined ? `${year}` : `${year}-${month}`;
}

export interface GlobalHolidaysResult {
    holidays: IndonesianHoliday[];
    holidaysByDate: Map<string, IndonesianHoliday[]>;
    isLoading: boolean;
    error: string;
}

/**
 * Satu hook untuk seluruh kalender WITS: ambil libur nasional + cuti bersama
 * dari endpoint kalender global. Pass `null` untuk menunda fetch.
 */
export function useGlobalHolidays(year: number | null, month?: number): GlobalHolidaysResult {
    const [holidays, setHolidays] = useState<IndonesianHoliday[]>(() => {
        if (year === null) return [];
        return globalHolidayCache.get(cacheKey(year, month)) ?? [];
    });
    const [isLoading, setIsLoading] = useState(year !== null && !globalHolidayCache.has(cacheKey(year as number, month)));
    const [error, setError] = useState("");

    useEffect(() => {
        if (year === null) return;
        const key = cacheKey(year, month);
        const hit = globalHolidayCache.get(key);
        if (hit) {
            setHolidays(hit);
            setIsLoading(false);
            return;
        }
        const controller = new AbortController();
        setIsLoading(true);
        setError("");

        const params = new URLSearchParams({ year: String(year) });
        if (month !== undefined) params.set("month", String(month));

        void (async () => {
            try {
                const response = await fetch(`/api/calendar/holidays?${params.toString()}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error(await getResponseErrorMessage(response, "Data hari libur tidak dapat dimuat."));
                }
                const result: unknown = await response.json();
                const data =
                    result && typeof result === "object" && Array.isArray((result as { data?: unknown }).data)
                        ? (result as { data: IndonesianHoliday[] }).data
                        : [];
                globalHolidayCache.set(key, data);
                if (!controller.signal.aborted) {
                    setHolidays(data);
                    setIsLoading(false);
                }
            } catch (fetchError) {
                if (controller.signal.aborted) return;
                reportClientError("useGlobalHolidays", "Gagal memuat hari libur global", fetchError, { year, month });
                setHolidays([]);
                setError(fetchError instanceof Error ? fetchError.message : "Data hari libur tidak dapat dimuat.");
                setIsLoading(false);
            }
        })();

        return () => controller.abort();
    }, [year, month]);

    const holidaysByDate = useMemo(() => {
        const map = new Map<string, IndonesianHoliday[]>();
        for (const holiday of holidays) {
            const current = map.get(holiday.date) ?? [];
            current.push(holiday);
            map.set(holiday.date, current);
        }
        return map;
    }, [holidays]);

    return { holidays, holidaysByDate, isLoading, error };
}

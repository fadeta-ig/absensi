"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "attendance-server-context";
const WIB_TIME_ZONE = "Asia/Jakarta";
const FRESH_FOR_MILLISECONDS = 5 * 60 * 1000;
const REFRESH_EVERY_MILLISECONDS = 4 * 60 * 1000;

export type AttendanceMode = "CLOCK_IN" | "CLOCK_OUT" | "ALREADY_COMPLETED";

export interface AttendanceSchedule {
    startTime: string;
    endTime: string;
    isOff: boolean;
}

export interface AttendanceServerContext {
    serverWibNow: string;
    serverWibDate: string;
    shiftDate: string;
    activeMode: AttendanceMode;
    isOvernight: boolean;
    todaySchedule: AttendanceSchedule | null;
    isOfficeWifi: boolean;
    clientIp: string;
    bypassLocation: boolean;
    networkName: string;
    isOffDay: boolean;
    shiftName: string | null;
}

interface ContextState {
    context: AttendanceServerContext | null;
    loading: boolean;
    error: string | null;
    isOnline: boolean;
    isFresh: boolean;
    displayWibTime: string | null;
    displayWibDate: string | null;
    displayWibHour: number | null;
    refresh: () => Promise<void>;
}

function isCalendarDate(value: unknown): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseContext(value: unknown): AttendanceServerContext {
    const data = value && typeof value === "object" ? value as Record<string, unknown> : null;
    const schedule = data?.todaySchedule;
    const parsedSchedule = schedule && typeof schedule === "object"
        ? schedule as Record<string, unknown>
        : null;

    if (
        typeof data?.serverWibNow !== "string" ||
        Number.isNaN(new Date(data.serverWibNow).getTime()) ||
        !isCalendarDate(data.serverWibDate) ||
        !isCalendarDate(data.shiftDate) ||
        (data.activeMode !== "CLOCK_IN" && data.activeMode !== "CLOCK_OUT" && data.activeMode !== "ALREADY_COMPLETED") ||
        typeof data.isOvernight !== "boolean" ||
        (parsedSchedule !== null && (
            typeof parsedSchedule.startTime !== "string" ||
            typeof parsedSchedule.endTime !== "string" ||
            typeof parsedSchedule.isOff !== "boolean"
        ))
    ) {
        throw new Error("Konteks waktu server presensi belum tersedia.");
    }

    return {
        serverWibNow: data.serverWibNow,
        serverWibDate: data.serverWibDate,
        shiftDate: data.shiftDate,
        activeMode: data.activeMode,
        isOvernight: data.isOvernight,
        todaySchedule: parsedSchedule ? {
            startTime: parsedSchedule.startTime as string,
            endTime: parsedSchedule.endTime as string,
            isOff: parsedSchedule.isOff as boolean,
        } : null,
        isOfficeWifi: data.isOfficeWifi === true,
        clientIp: typeof data.clientIp === "string" ? data.clientIp : "",
        bypassLocation: data.bypassLocation === true,
        networkName: typeof data.networkName === "string" ? data.networkName : "",
        isOffDay: data.isOffDay === true,
        shiftName: typeof data.shiftName === "string" ? data.shiftName : null,
    };
}

function readStoredContext(): AttendanceServerContext | null {
    if (typeof window === "undefined") return null;
    try {
        const stored = window.sessionStorage.getItem(STORAGE_KEY);
        return stored ? parseContext(JSON.parse(stored)) : null;
    } catch {
        return null;
    }
}

function formatWibTime(date: Date): string {
    return new Intl.DateTimeFormat("id-ID", {
        timeZone: WIB_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(date);
}

function formatWibDate(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: WIB_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function getWibHour(date: Date): number {
    const hour = new Intl.DateTimeFormat("en-US", {
        timeZone: WIB_TIME_ZONE,
        hour: "numeric",
        hour12: false,
    }).formatToParts(date).find((part) => part.type === "hour")?.value;
    return Number(hour ?? "0") % 24;
}

export function useAttendanceServerContext(): ContextState {
    const storedContext = useRef<AttendanceServerContext | null>(null);
    const contextRef = useRef<AttendanceServerContext | null>(null);
    const anchorRef = useRef<{ serverMilliseconds: number; monotonicMilliseconds: number } | null>(null);
    const lastDisplayMillisecondsRef = useRef<number | null>(null);
    const [context, setContext] = useState<AttendanceServerContext | null>(() => {
        const stored = readStoredContext();
        storedContext.current = stored;
        contextRef.current = stored;
        return stored;
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);

    const refresh = useCallback(async () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            setIsOnline(false);
            setError("Perangkat sedang offline. Menampilkan waktu server terakhir.");
            setLoading(false);
            return;
        }

        setIsOnline(true);
        if (!contextRef.current) setLoading(true);

        try {
            const response = await fetch("/api/attendance/network", {
                cache: "no-store",
                headers: { "Cache-Control": "no-cache" },
            });
            if (!response.ok) {
                throw new Error("Gagal mengambil konteks waktu server presensi.");
            }

            const nextContext = parseContext(await response.json());
            const serverMilliseconds = new Date(nextContext.serverWibNow).getTime();
            contextRef.current = nextContext;
            storedContext.current = nextContext;
            anchorRef.current = {
                serverMilliseconds,
                monotonicMilliseconds: typeof performance === "undefined" ? 0 : performance.now(),
            };
            lastDisplayMillisecondsRef.current = serverMilliseconds;
            setContext(nextContext);
            setError(null);
            setLoading(false);
            try {
                window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextContext));
            } catch {
                // A blocked sessionStorage must not prevent a live server snapshot.
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Konteks waktu server tidak dapat dimuat.");
            setLoading(false);
            setContext(contextRef.current ?? storedContext.current);
        }
    }, []);

    useEffect(() => {
        void refresh();

        const handleOffline = () => {
            setIsOnline(false);
            setError("Perangkat sedang offline. Menampilkan waktu server terakhir.");
        };
        const handleOnline = () => {
            setIsOnline(true);
            void refresh();
        };

        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);
        return () => {
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
    }, [refresh]);

    useEffect(() => {
        const timer = window.setInterval(() => void refresh(), REFRESH_EVERY_MILLISECONDS);
        return () => window.clearInterval(timer);
    }, [refresh]);

    const monotonicElapsed = anchorRef.current && typeof performance !== "undefined"
        ? Math.max(0, performance.now() - anchorRef.current.monotonicMilliseconds)
        : null;
    const isFresh = Boolean(context && isOnline && !error && monotonicElapsed !== null && monotonicElapsed <= FRESH_FOR_MILLISECONDS);
    if (isFresh && anchorRef.current && monotonicElapsed !== null) {
        lastDisplayMillisecondsRef.current = anchorRef.current.serverMilliseconds + monotonicElapsed;
    }
    const displayMilliseconds = lastDisplayMillisecondsRef.current
        ?? (context ? new Date(context.serverWibNow).getTime() : null);
    const displayInstant = displayMilliseconds !== null ? new Date(displayMilliseconds) : null;

    return {
        context,
        loading,
        error,
        isOnline,
        isFresh,
        displayWibTime: displayInstant ? formatWibTime(displayInstant) : null,
        displayWibDate: displayInstant ? formatWibDate(displayInstant) : context?.serverWibDate ?? null,
        displayWibHour: displayInstant ? getWibHour(displayInstant) : null,
        refresh,
    };
}

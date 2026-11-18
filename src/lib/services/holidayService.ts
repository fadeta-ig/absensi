import { promises as fs } from "fs";
import path from "path";
import { isValidCalendarDate } from "@/lib/timezone";
import logger from "@/lib/logger";

export type IndonesianHolidayType = "national" | "joint-leave";

export interface IndonesianHoliday {
    date: string;
    name: string;
    type: IndonesianHolidayType;
}

interface HolidayRecord {
    date?: unknown;
    description?: unknown;
    holiday_date?: unknown;
    holiday_name?: unknown;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize the supported upstream holiday payloads into the application's
 * stable calendar contract. Invalid and out-of-year records are discarded.
 */
export function normalizeHolidayPayload(payload: unknown, year: number): IndonesianHoliday[] {
    const records = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
            ? (payload as { data: unknown[] }).data
            : [];

    const uniqueHolidays = new Map<string, IndonesianHoliday>();

    for (const rawRecord of records) {
        if (!rawRecord || typeof rawRecord !== "object") continue;

        const record = rawRecord as HolidayRecord;
        const date = typeof record.date === "string"
            ? record.date
            : typeof record.holiday_date === "string"
                ? record.holiday_date
                : "";
        const name = typeof record.description === "string"
            ? record.description.trim()
            : typeof record.holiday_name === "string"
                ? record.holiday_name.trim()
                : "";

        if (!ISO_DATE_PATTERN.test(date) || !date.startsWith(`${year}-`) || !name) continue;

        const type: IndonesianHolidayType = /cuti bersama/i.test(name) ? "joint-leave" : "national";
        uniqueHolidays.set(`${date}:${name}`, { date, name, type });
    }

    return [...uniqueHolidays.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Kalender global (logic api-harilibur / kalenderbali.com) ───
// Bentuk mentah kalenderbali: { holiday_date, holiday_name, is_national_holiday }.
// - is_national_holiday === false (Galungan, Kuningan, Saraswati, Siwa Ratri, …)
//   DIBUANG: bukan libur nasional / cuti bersama resmi Indonesia.
// - Tanggal dinormalisasi zero-pad ("2026-6-1" → "2026-06-01") lalu divalidasi
//   kalender nyata via isValidCalendarDate.

interface KalenderBaliRecord {
    holiday_date?: unknown;
    holiday_name?: unknown;
    is_national_holiday?: unknown;
}

/** "2026-6-1" → "2026-06-01"; "" bila pola YYYY-M-D tidak cocok. */
export function padHolidayDate(value: string): string {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
    if (!match) return "";
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

/**
 * Normalisasi payload bentuk kalenderbali (file vendored maupun upstream
 * api-harilibur) menjadi kontrak IndonesianHoliday. Hanya nasional +
 * cuti bersama yang lolos; hari daerah Bali dibuang.
 */
export function normalizeKalenderBaliPayload(payload: unknown, year: number): IndonesianHoliday[] {
    const records = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
            ? (payload as { data: unknown[] }).data
            : [];

    const uniqueHolidays = new Map<string, IndonesianHoliday>();

    for (const rawRecord of records) {
        if (!rawRecord || typeof rawRecord !== "object") continue;

        const record = rawRecord as KalenderBaliRecord;
        // Bali/fakultatif dibuang di sini (keputusan: hanya nasional + cuti bersama).
        if (record.is_national_holiday !== true) continue;
        if (typeof record.holiday_date !== "string" || typeof record.holiday_name !== "string") continue;

        const date = padHolidayDate(record.holiday_date);
        const name = record.holiday_name.trim();
        if (!date || !name) continue;
        if (!isValidCalendarDate(date) || !date.startsWith(`${year}-`)) continue;

        const type: IndonesianHolidayType = /cuti bersama/i.test(name) ? "joint-leave" : "national";
        uniqueHolidays.set(`${date}:${name}`, { date, name, type });
    }

    return [...uniqueHolidays.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const VENDORED_HOLIDAY_DIR = path.join(process.cwd(), "data", "holidays");
const UPSTREAM_HOLIDAY_API_URL = "https://api-hari-libur.vercel.app/api";
const GLOBAL_HOLIDAY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface GlobalHolidayCacheEntry {
    data: IndonesianHoliday[];
    source: "vendored" | "upstream";
    loadedAt: number;
}

const globalHolidayCache = new Map<number, GlobalHolidayCacheEntry>();

/** Kosongkan cache memori (dipakai test; tidak ada efek ke file vendored). */
export function clearHolidayCache(): void {
    globalHolidayCache.clear();
}

async function loadVendoredYear(year: number): Promise<IndonesianHoliday[]> {
    try {
        const text = await fs.readFile(path.join(VENDORED_HOLIDAY_DIR, `${year}.json`), "utf8");
        return normalizeKalenderBaliPayload(JSON.parse(text) as unknown, year);
    } catch {
        return [];
    }
}

/** Fallback best-effort bila file vendored untuk tahun itu belum ada. */
async function fetchUpstreamYear(year: number): Promise<IndonesianHoliday[]> {
    try {
        const response = await fetch(`${UPSTREAM_HOLIDAY_API_URL}?year=${year}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) return [];
        return normalizeKalenderBaliPayload((await response.json()) as unknown, year);
    } catch (error) {
        logger.warn("[GlobalHolidays] Fallback upstream tidak tersedia", {
            year,
            error: error instanceof Error ? error.message : String(error),
        });
        return [];
    }
}

export type GlobalHolidaySource = "vendored" | "upstream";

/**
 * Satu pintu kalender global: gabungan nasional + cuti bersama untuk setahun
 * (filter bulan opsional). Vendored primer; upstream hanya bila lokal kosong.
 * Hasil di-cache di memori per tahun (TTL 6 jam).
 */
export async function getGlobalHolidays(
    year: number,
    month?: number
): Promise<{ data: IndonesianHoliday[]; source: GlobalHolidaySource }> {
    const now = Date.now();
    const cached = globalHolidayCache.get(year);
    if (cached && now - cached.loadedAt < GLOBAL_HOLIDAY_CACHE_TTL_MS) {
        return { data: filterByMonth(cached.data, month), source: cached.source };
    }

    let data = await loadVendoredYear(year);
    let source: GlobalHolidaySource = "vendored";
    if (data.length === 0) {
        data = await fetchUpstreamYear(year);
        source = "upstream";
    }
    globalHolidayCache.set(year, { data, source, loadedAt: now });
    return { data: filterByMonth(data, month), source };
}

function filterByMonth(data: IndonesianHoliday[], month?: number): IndonesianHoliday[] {
    if (month === undefined || !Number.isInteger(month) || month < 1 || month > 12) return data;
    const prefix = `-${String(month).padStart(2, "0")}-`;
    return data.filter((holiday) => holiday.date.includes(prefix));
}

/**
 * Cari hari libur nasional/cuti bersama di dalam daftar tanggal YYYY-MM-DD.
 * Dipakai penegak blocker cuti — mengembalikan yang cocok, terurut tanggal.
 */
export async function findHolidaysInDates(dateKeys: string[]): Promise<IndonesianHoliday[]> {
    const years = [...new Set(dateKeys.map((key) => Number(key.slice(0, 4))).filter((y) => Number.isInteger(y) && y > 0))];
    const wanted = new Set(dateKeys);
    const found: IndonesianHoliday[] = [];
    for (const year of years) {
        const { data } = await getGlobalHolidays(year);
        for (const holiday of data) {
            if (wanted.has(holiday.date)) found.push(holiday);
        }
    }
    return found.sort((a, b) => a.date.localeCompare(b.date));
}

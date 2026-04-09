import { prisma } from "../prisma";
import { AttendanceRecord } from "@/types";
import logger from "@/lib/logger";
import { toDateString, toISOOrNull } from "@/lib/utils";

// ─── Date helpers imported from @/lib/utils ────────────────────

/**
 * Map Prisma AttendanceRecord (Date fields) → app AttendanceRecord (string fields).
 * Diperlukan setelah migrasi DateTime. API JSON response akan serialize ISO string ke client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAttendanceRecord(row: any): AttendanceRecord {
    return {
        id: row.id,
        employeeId: row.employeeId,
        date: toDateString(row.date),
        clockIn: toISOOrNull(row.clockIn),
        clockOut: toISOOrNull(row.clockOut),
        clockInLocation: row.clockInLocation as AttendanceRecord["clockInLocation"],
        clockOutLocation: row.clockOutLocation as AttendanceRecord["clockOutLocation"],
        clockInPhoto: row.clockInPhoto ?? null,
        clockOutPhoto: row.clockOutPhoto ?? null,
        status: row.status as AttendanceRecord["status"],
        notes: row.notes ?? null,
    };
}

/** Buat Date range untuk query 1 hari penuh berdasarkan string YYYY-MM-DD */
function dayRange(dateString: string) {
    const d = new Date(dateString);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start.getTime() + 86400000);
    return { gte: start, lt: end };
}

// ─── Service Functions ────────────────────────────────────────

export async function getAttendanceRecords(employeeId?: string): Promise<AttendanceRecord[]> {
    const rows = await prisma.attendanceRecord.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { date: "desc" },
    });
    return rows.map(toAttendanceRecord);
}

export async function getAttendanceByDate(employeeId: string, date: string): Promise<AttendanceRecord | undefined> {
    // Cari berdasarkan range hari (karena date sekarang DateTime, bukan string exact match)
    const row = await prisma.attendanceRecord.findFirst({
        where: { employeeId, date: dayRange(date) },
    });
    if (!row) return undefined;
    return toAttendanceRecord(row);
}

export async function createAttendance(data: Omit<AttendanceRecord, "id">): Promise<AttendanceRecord> {
    logger.info("Clock-in recorded", { employeeId: data.employeeId, date: data.date, status: data.status });

    // Parse date string → DateTime untuk Prisma
    const dateObj = new Date(data.date);
    const clockInObj = data.clockIn ? new Date(data.clockIn) : undefined;
    const clockOutObj = data.clockOut ? new Date(data.clockOut) : undefined;

    const row = await prisma.attendanceRecord.create({
        data: {
            employeeId: data.employeeId,
            date: dateObj,
            clockIn: clockInObj,
            clockOut: clockOutObj,
            clockInLocation: data.clockInLocation ? JSON.stringify(data.clockInLocation) : undefined,
            clockOutLocation: data.clockOutLocation ? JSON.stringify(data.clockOutLocation) : undefined,
            clockInPhoto: data.clockInPhoto,
            clockOutPhoto: data.clockOutPhoto,
            status: data.status,
            notes: data.notes,
        },
    });
    return toAttendanceRecord(row);
}

export async function updateAttendance(id: string, data: Partial<AttendanceRecord>): Promise<AttendanceRecord | null> {
    try {
        const row = await prisma.attendanceRecord.update({
            where: { id },
            data: {
                ...(data.clockIn !== undefined && { clockIn: data.clockIn ? new Date(data.clockIn) : null }),
                ...(data.clockOut !== undefined && { clockOut: data.clockOut ? new Date(data.clockOut) : null }),
                ...(data.clockInLocation !== undefined && {
                    clockInLocation: data.clockInLocation ? JSON.stringify(data.clockInLocation) : null,
                }),
                ...(data.clockOutLocation !== undefined && {
                    clockOutLocation: data.clockOutLocation ? JSON.stringify(data.clockOutLocation) : null,
                }),
                ...(data.clockInPhoto !== undefined && { clockInPhoto: data.clockInPhoto }),
                ...(data.clockOutPhoto !== undefined && { clockOutPhoto: data.clockOutPhoto }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.notes !== undefined && { notes: data.notes }),
            },
        });
        return toAttendanceRecord(row);
    } catch (error) {
        logger.error("Gagal update attendance", { id, error });
        return null;
    }
}

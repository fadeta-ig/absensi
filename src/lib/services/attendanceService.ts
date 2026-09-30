import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "../prisma";
import { AttendanceRecord } from "@/types";
import logger from "@/lib/logger";
import { toDateString, toISOOrNull } from "@/lib/utils";
import { addCalendarDays, toUTCDateKey, toWIBDateString } from "@/lib/timezone";
import {
    getNormalizedShiftWindows,
    isOvernightSchedule,
    resolveAttendanceTargetFromRecords,
    type AttendanceActionTarget,
} from "@/lib/services/attendanceShiftHelper";
import { Prisma } from "@prisma/client";
import { resolveShiftForDate } from "@/lib/services/shiftAssignmentService";

// ─── Date helpers imported from @/lib/utils ────────────────────

/**
 * Map Prisma AttendanceRecord (Date fields) → app AttendanceRecord (string fields).
 * Diperlukan setelah migrasi DateTime. API JSON response akan serialize ISO string ke client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLocation(val: any): AttendanceRecord["clockInLocation"] {
    if (!val) return null;
    if (typeof val === "object") return val;
    if (typeof val === "string") {
        try {
            return JSON.parse(val);
        } catch {
            return null;
        }
    }
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAttendanceRecord(row: any): AttendanceRecord {
    const date = toDateString(row.date);
    return {
        id: row.id,
        employeeId: row.employeeId,
        date,
        clockIn: toISOOrNull(row.clockIn),
        clockOut: toISOOrNull(row.clockOut),
        clockInLocation: parseLocation(row.clockInLocation),
        clockOutLocation: parseLocation(row.clockOutLocation),
        clockInPhoto: row.clockInPhoto ?? null,
        clockOutPhoto: row.clockOutPhoto ?? null,
        hasClockInPhoto: Boolean(row.hasClockInPhoto ?? row.clockInPhoto ?? row.clockInPhotoPath),
        hasClockOutPhoto: Boolean(row.hasClockOutPhoto ?? row.clockOutPhoto ?? row.clockOutPhotoPath),
        status: row.status as AttendanceRecord["status"],
        notes: row.notes ?? null,
        isOffDay: Boolean(row.isOffDay),
        offDayReason: row.offDayReason ?? null,
        shiftDate: row.shiftDate ?? date,
        shiftId: row.shiftId ?? null,
        shiftName: row.shiftName ?? null,
        shiftStartTime: row.shiftStartTime ?? null,
        shiftEndTime: row.shiftEndTime ?? null,
        shiftSource: row.shiftSource ?? "none",
        isOvernight: Boolean(row.isOvernight),
    };
}

// ─── Selfie disk storage (Gel.2a: file baru ke disk+path, base64 lama hanya dibaca) ───

/** Root privat foto selfie presensi (di luar public/ agar wajib lewat route ber-auth). */
export const ATTENDANCE_PHOTO_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "attendance-photos");

const ATTENDANCE_PHOTO_RELATIVE_PATTERN = /^[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.jpg$/;
const ATTENDANCE_EMPLOYEE_DIR_PATTERN = /^[A-Za-z0-9_-]+$/;

export class AttendancePhotoValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AttendancePhotoValidationError";
    }
}

/** Cek magic bytes JPEG (FF D8 FF) — otoritatif, bukan dari klaim MIME klien. */
export function isJpegBytes(bytes: Uint8Array): boolean {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Kembalikan absolute path bila relative path valid (`{employeeId}/{uuid}.jpg`)
 * dan tetap di dalam root storage; selain itu null (anti traversal).
 */
export function resolveAttendancePhotoPath(relativePath: string): string | null {
    if (!ATTENDANCE_PHOTO_RELATIVE_PATTERN.test(relativePath)) return null;
    const resolved = path.resolve(ATTENDANCE_PHOTO_STORAGE_ROOT, relativePath);
    if (!resolved.startsWith(`${ATTENDANCE_PHOTO_STORAGE_ROOT}${path.sep}`)) return null;
    return resolved;
}

/**
 * Simpan selfie JPEG ke `storage/attendance-photos/{employeeId}/{uuid}.jpg`
 * via `mkdir recursive + writeFile wx` (meniru visitPhotoService).
 * Kembalikan relative path untuk kolom `clockInPhotoPath/clockOutPhotoPath`.
 */
export async function saveAttendancePhoto(
    employeeId: string,
    bytes: Buffer,
    maxBytes: number,
): Promise<string> {
    if (!ATTENDANCE_EMPLOYEE_DIR_PATTERN.test(employeeId)) {
        throw new AttendancePhotoValidationError("Identitas karyawan tidak valid untuk penyimpanan foto.");
    }
    if (bytes.length === 0) {
        throw new AttendancePhotoValidationError("Foto selfie wajib disertakan sebagai bukti kehadiran.");
    }
    if (bytes.length > maxBytes) {
        throw new AttendancePhotoValidationError(
            `Ukuran foto terlalu besar. Maksimal ${(maxBytes / (1024 * 1024)).toFixed(1)} MB. Silakan ambil ulang foto.`,
        );
    }
    if (!isJpegBytes(bytes)) {
        throw new AttendancePhotoValidationError("Foto harus berformat JPEG dari kamera aplikasi.");
    }
    const relativePath = `${employeeId}/${randomUUID()}.jpg`;
    const absolutePath = resolveAttendancePhotoPath(relativePath);
    if (!absolutePath) {
        throw new AttendancePhotoValidationError("Lokasi penyimpanan foto presensi tidak valid.");
    }
    await mkdir(path.dirname(absolutePath), { recursive: true });
    try {
        await writeFile(absolutePath, bytes, { flag: "wx" });
    } catch (error) {
        await unlink(absolutePath).catch(() => undefined);
        throw error;
    }
    return relativePath;
}

/** Baca berkas selfie dari relative path yang tervalidasi. */
export async function readAttendancePhotoFile(relativePath: string): Promise<Buffer> {
    const absolutePath = resolveAttendancePhotoPath(relativePath);
    if (!absolutePath) {
        throw new AttendancePhotoValidationError("Lokasi penyimpanan foto presensi tidak valid.");
    }
    return readFile(absolutePath);
}

/** Hapus berkas selfie (cleanup bila mutasi DB gagal; abaikan bila sudah tidak ada). */
export async function deleteAttendancePhotoFile(relativePath: string): Promise<void> {
    const absolutePath = resolveAttendancePhotoPath(relativePath);
    if (!absolutePath) return;
    await unlink(absolutePath).catch(() => undefined);
}

// ─── Service Functions ────────────────────────────────────────

export async function getAttendanceRecords(employeeId?: string): Promise<AttendanceRecord[]> {
    const where = employeeId ? { employeeId } : undefined;
    const [rows, clockInPhotoRows, clockOutPhotoRows] = await Promise.all([
        prisma.attendanceRecord.findMany({
            where,
            orderBy: { date: "desc" },
            omit: { clockInPhoto: true, clockOutPhoto: true },
        }),
        prisma.attendanceRecord.findMany({
            where: { ...where, OR: [{ clockInPhoto: { not: null } }, { clockInPhotoPath: { not: null } }] },
            select: { id: true },
        }),
        prisma.attendanceRecord.findMany({
            where: { ...where, OR: [{ clockOutPhoto: { not: null } }, { clockOutPhotoPath: { not: null } }] },
            select: { id: true },
        }),
    ]);
    const clockInPhotoIds = new Set(clockInPhotoRows.map((row) => row.id));
    const clockOutPhotoIds = new Set(clockOutPhotoRows.map((row) => row.id));
    if (rows.length === 0) return [];

    const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
    const recordDates = rows.map((row) => toDateString(row.date)).sort();
    const minDate = toUTCDateKey(recordDates[0]);
    const maxDate = toUTCDateKey(recordDates[recordDates.length - 1]);
    const [assignments, employees, shifts] = await Promise.all([
        prisma.shiftAssignment.findMany({
            where: {
                employeeId: { in: employeeIds },
                effectiveFrom: { lte: maxDate },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: minDate } }],
            },
            orderBy: [{ employeeId: "asc" }, { effectiveFrom: "desc" }],
            select: { employeeId: true, shiftId: true, effectiveFrom: true, effectiveTo: true },
        }),
        prisma.employee.findMany({
            where: { employeeId: { in: employeeIds } },
            select: { employeeId: true, shiftId: true },
        }),
        prisma.workShift.findMany({
            include: { days: true },
        }),
    ]);
    const assignmentsByEmployee = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
        const list = assignmentsByEmployee.get(assignment.employeeId) ?? [];
        list.push(assignment);
        assignmentsByEmployee.set(assignment.employeeId, list);
    }
    const fallbackByEmployee = new Map(employees.map((employee) => [employee.employeeId, employee.shiftId]));
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
    const defaultShift = shifts.find((shift) => shift.isDefault) ?? null;

    return rows.map((row) => {
        const shiftDate = toDateString(row.date);
        const dateKey = toUTCDateKey(shiftDate);
        const assignment = assignmentsByEmployee.get(row.employeeId)?.find((candidate) =>
            candidate.effectiveFrom <= dateKey && (!candidate.effectiveTo || dateKey < candidate.effectiveTo)
        );
        const fallbackShiftId = fallbackByEmployee.get(row.employeeId);
        const assignedShift = assignment ? shiftById.get(assignment.shiftId) : null;
        const fallbackShift = fallbackShiftId ? shiftById.get(fallbackShiftId) : null;
        const shift = assignedShift ?? fallbackShift ?? defaultShift;
        const shiftSource = assignedShift
            ? "assignment"
            : fallbackShift
                ? "fallback"
                : defaultShift
                    ? "default"
                    : "none";
        const scheduleDay = shift?.days.find((day) => day.dayOfWeek === dateKey.getUTCDay()) ?? null;

        return toAttendanceRecord({
            ...row,
            hasClockInPhoto: clockInPhotoIds.has(row.id),
            hasClockOutPhoto: clockOutPhotoIds.has(row.id),
            shiftDate,
            shiftId: shift?.id ?? null,
            shiftName: shift?.name ?? null,
            shiftStartTime: scheduleDay?.startTime ?? null,
            shiftEndTime: scheduleDay?.endTime ?? null,
            shiftSource,
            isOvernight: Boolean(
                scheduleDay &&
                !scheduleDay.isOff &&
                isOvernightSchedule(scheduleDay.startTime, scheduleDay.endTime)
            ),
        });
    });
}

export async function getAttendanceByDate(employeeId: string, date: string): Promise<AttendanceRecord | undefined> {
    const row = await prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date: toUTCDateKey(date) } },
    });
    if (!row) return undefined;
    return toAttendanceRecord(row);
}

export async function createAttendance(data: Omit<AttendanceRecord, "id">): Promise<AttendanceRecord> {
    logger.info("Clock-in recorded", { employeeId: data.employeeId, date: data.date, status: data.status, isOffDay: data.isOffDay });

    // Parse date string → DateTime untuk Prisma
    const dateObj = toUTCDateKey(data.date);
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
            isOffDay: data.isOffDay ?? false,
            offDayReason: data.offDayReason ?? null,
        },
    });
    return toAttendanceRecord(row);
}

export type AttendanceExpectedAction = "CLOCK_IN" | "CLOCK_OUT";

export class AttendanceMutationError extends Error {
    constructor(
        message: string,
        public readonly code: "STATE_CHANGED" | "ALREADY_COMPLETED" | "TOO_EARLY" | "OFF_DAY_REASON_REQUIRED" | "EMPLOYEE_NOT_FOUND",
        public readonly statusCode: number,
        public readonly target?: AttendanceActionTarget,
    ) {
        super(message);
        this.name = "AttendanceMutationError";
    }
}

interface AttendanceMutationBaseInput {
    employeeId: string;
    expectedAction: AttendanceExpectedAction;
    expectedShiftDate: string;
    now: Date;
    location: AttendanceRecord["clockInLocation"];
    offDayReason?: string | null;
}

type AttendanceMutationInput = AttendanceMutationBaseInput &
    (
        | {
            /** Selfie baru: relative path hasil saveAttendancePhoto (kolom clockInPhotoPath/clockOutPhotoPath). */
            photoPath: string;
            photo?: never;
        }
        | {
            /**
             * @deprecated Kontrak base64 lama — hanya agar suite integrasi pengunci
             * roster lama tetap terkompilasi. Route produksi Gel.2a tidak pernah
             * mengisi ini (selalu photoPath; JSON lama ditolak 400 di boundary).
             */
            photo: string;
            photoPath?: never;
        }
    );

export interface AttendanceMutationResult {
    record: AttendanceRecord;
    target: AttendanceActionTarget;
    isOffDay: boolean;
}

export async function performAttendanceMutation(input: AttendanceMutationInput): Promise<AttendanceMutationResult> {
    try {
        return await prisma.$transaction(async (tx) => {
            const employees = await tx.$queryRaw<Array<{ employee_id: string }>>`
                SELECT employee_id FROM employees WHERE employee_id = ${input.employeeId} FOR UPDATE
            `;
            if (employees.length === 0) {
                throw new AttendanceMutationError("Data karyawan tidak ditemukan.", "EMPLOYEE_NOT_FOUND", 404);
            }

            const today = toWIBDateString(input.now);
            const yesterday = addCalendarDays(today, -1);
            const [todayShift, yesterdayShift] = await Promise.all([
                resolveShiftForDate(tx, input.employeeId, today),
                resolveShiftForDate(tx, input.employeeId, yesterday),
            ]);
            const shiftDays = todayShift?.days ?? [];
            const tolerance = todayShift?.tolerance;
            const yesterdayShiftDays = yesterdayShift?.days ?? shiftDays;
            const yesterdayTolerance = yesterdayShift?.tolerance ?? tolerance;
            const [yesterdayRow, todayRow] = await Promise.all([
                tx.attendanceRecord.findUnique({
                    where: { employeeId_date: { employeeId: input.employeeId, date: toUTCDateKey(yesterday) } },
                }),
                tx.attendanceRecord.findUnique({
                    where: { employeeId_date: { employeeId: input.employeeId, date: toUTCDateKey(today) } },
                }),
            ]);
            const target = resolveAttendanceTargetFromRecords(input.now, shiftDays, tolerance, {
                yesterday: yesterdayRow ? toAttendanceRecord(yesterdayRow) : undefined,
                today: todayRow ? toAttendanceRecord(todayRow) : undefined,
            }, { days: yesterdayShiftDays, tolerance: yesterdayTolerance });

            if (target.mode === "ALREADY_COMPLETED") {
                throw new AttendanceMutationError(
                    "Presensi untuk shift ini sudah tercatat lengkap.",
                    "ALREADY_COMPLETED",
                    409,
                    target,
                );
            }
            if (target.mode !== input.expectedAction || target.shiftDate !== input.expectedShiftDate) {
                throw new AttendanceMutationError(
                    "Status presensi telah berubah. Muat ulang data terbaru.",
                    "STATE_CHANGED",
                    409,
                    target,
                );
            }

            if (target.mode === "CLOCK_OUT") {
                const changed = await tx.attendanceRecord.updateMany({
                    where: { id: target.existingRecord.id, clockOut: null },
                    data: {
                        clockOut: input.now,
                        clockOutLocation: input.location ? JSON.stringify(input.location) : null,
                        // Data baru (photoPath) → kolom path saja; varian legacy → kolom base64.
                        ...(input.photoPath ? { clockOutPhotoPath: input.photoPath } : {}),
                        ...(input.photo ? { clockOutPhoto: input.photo } : {}),
                    },
                });
                if (changed.count !== 1) {
                    throw new AttendanceMutationError(
                        "Presensi pulang sudah tercatat.",
                        "STATE_CHANGED",
                        409,
                        target,
                    );
                }
                const row = await tx.attendanceRecord.findUniqueOrThrow({ where: { id: target.existingRecord.id } });
                return { record: toAttendanceRecord(row), target, isOffDay: Boolean(row.isOffDay) };
            }

            const dayList = target.shiftDate === yesterday ? yesterdayShiftDays : shiftDays;
            const isOffDay = dayList.length > 0 && (!target.scheduleDay || target.scheduleDay.isOff);
            const reason = input.offDayReason?.trim();
            if (isOffDay && (!reason || reason.length < 3)) {
                throw new AttendanceMutationError(
                    "Keperluan/alasan presensi hari libur wajib diisi (minimal 3 karakter).",
                    "OFF_DAY_REASON_REQUIRED",
                    400,
                    target,
                );
            }

            let status: "present" | "late" = "present";
            if (!isOffDay && target.scheduleDay) {
                const shiftTolerance = target.shiftDate === yesterday
                    ? yesterdayTolerance
                    : tolerance;
                const windows = getNormalizedShiftWindows(target.scheduleDay, shiftTolerance);
                if (target.relativeClockMinutes < windows.earliestInMinutes) {
                    throw new AttendanceMutationError(
                        `Belum waktunya clock-in. Presensi dapat dilakukan mulai pukul ${formatClockMinutes(windows.earliestInMinutes)}.`,
                        "TOO_EARLY",
                        400,
                        target,
                    );
                }
                if (target.relativeClockMinutes > windows.lateDeadlineMinutes) status = "late";
            }

            const row = await tx.attendanceRecord.create({
                data: {
                    employeeId: input.employeeId,
                    date: toUTCDateKey(target.shiftDate),
                    clockIn: input.now,
                    clockInLocation: input.location ? JSON.stringify(input.location) : null,
                    // Data baru (photoPath) → kolom path saja, JANGAN isi kolom base64.
                    ...(input.photoPath ? { clockInPhotoPath: input.photoPath } : {}),
                    ...(input.photo ? { clockInPhoto: input.photo } : {}),
                    status,
                    isOffDay,
                    offDayReason: isOffDay ? reason ?? null : null,
                },
            });
            return { record: toAttendanceRecord(row), target, isOffDay };
        });
    } catch (error) {
        if (error instanceof AttendanceMutationError) throw error;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const conflict = await prisma.attendanceRecord.findUnique({
                where: { employeeId_date: { employeeId: input.employeeId, date: toUTCDateKey(input.expectedShiftDate) } },
                select: { clockOut: true },
            }).catch(() => null);
            if (conflict?.clockOut) {
                throw new AttendanceMutationError(
                    "Shift ini sudah lengkap (masuk + pulang tercatat). Ajukan koreksi bila datanya salah.",
                    "ALREADY_COMPLETED",
                    409,
                );
            }
            throw new AttendanceMutationError("Presensi sudah tercatat.", "STATE_CHANGED", 409);
        }
        throw error;
    }
}

function formatClockMinutes(totalMinutes: number): string {
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
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
                ...(data.isOffDay !== undefined && { isOffDay: data.isOffDay }),
                ...(data.offDayReason !== undefined && { offDayReason: data.offDayReason }),
            },
        });
        return toAttendanceRecord(row);
    } catch (error) {
        logger.error("Gagal update attendance", { id, error });
        return null;
    }
}

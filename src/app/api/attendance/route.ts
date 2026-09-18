import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getAttendanceRecords,
    getAttendanceByDate,
    createAttendance,
    updateAttendance,
} from "@/lib/services/attendanceService";
import { prisma } from "@/lib/prisma";
import { extractClientIp, isOfficeWifiNetwork } from "@/lib/networkValidator";
import { calculateDistance } from "@/lib/utils";
import { toWIBDateString, getWIBHoursMinutes, getWIBDayOfWeek } from "@/lib/timezone";
import { attendanceSchema } from "@/lib/validations/validationSchemas";
import logger from "@/lib/logger";

/** Format total minutes → "HH:mm" */
function formatMinutes(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get("employeeId");

        if (session.role === "hr") {
            const records = await getAttendanceRecords(employeeId || undefined);
            return NextResponse.json(records);
        }
        if (!session.employeeId) return forbiddenResponse();

        const records = await getAttendanceRecords(session.employeeId);
        return NextResponse.json(records);
    } catch (err) {
        return serverErrorResponse("AttendanceGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const result = await validateBody(request, attendanceSchema);
        if ("error" in result) return result.error;
        const body = result.data;
        const clientIp = extractClientIp(request);

        const today = toWIBDateString();

        // Fetch employee settings with proper typing
        const employee = await prisma.employee.findUnique({
            where: { employeeId: session.employeeId },
            include: { locations: true }
        });

        if (!employee) {
            return NextResponse.json({ error: "Data karyawan tidak ditemukan" }, { status: 404 });
        }

        // ── Validasi Jaringan Wi-Fi Kantor WIG ──
        const isOfficeWifi = isOfficeWifiNetwork(clientIp);
        const networkName = isOfficeWifi
            ? "Wi-Fi Kantor WIG"
            : (employee.bypassLocation ? "Bypass Khusus" : "Jaringan Luar");

        if (!employee.bypassLocation) {
            if (!isOfficeWifi) {
                logger.warn("Attendance rejected: non-office network", {
                    employeeId: session.employeeId,
                    clientIp,
                });
                return NextResponse.json(
                    { error: `Presensi ditolak. Anda harus terhubung ke Wi-Fi resmi kantor WIG (Terdeteksi IP luar/seluler: ${clientIp || "unknown"}).` },
                    { status: 403 }
                );
            }
        }

        // Location verification logic
        if (!employee.bypassLocation) {
            if (!body.location || typeof body.location.lat !== "number" || typeof body.location.lng !== "number") {
                return NextResponse.json({ error: "Akses lokasi diperlukan untuk melakukan presensi." }, { status: 400 });
            }

            if (!employee.locations || employee.locations.length === 0) {
                return NextResponse.json({ error: "Lokasi presensi Anda belum diatur oleh HR. Silakan hubungi admin." }, { status: 403 });
            }

            const isWithinRange = employee.locations.some((loc) => {
                const dist = calculateDistance(
                    body.location!.lat,
                    body.location!.lng,
                    loc.latitude,
                    loc.longitude
                );
                return dist <= loc.radius;
            });

            if (!isWithinRange) {
                return NextResponse.json(
                    { error: "Anda berada di luar radius lokasi presensi yang diizinkan." },
                    { status: 403 }
                );
            }
        }

        // ── Resolve shift early (needed for both clock-in and clock-out) ──
        const now = new Date();

        let shift = null;
        if (employee.shiftId) {
            shift = await prisma.workShift.findUnique({
                where: { id: employee.shiftId },
                include: { days: true },
            });
        }
        if (!shift) {
            shift = await prisma.workShift.findFirst({
                where: { isDefault: true },
                include: { days: true },
            });
        }

        const {
            resolveAttendanceTargetForEmployee,
            getNormalizedShiftWindows,
            formatMinutes: formatShiftMinutes,
        } = await import("@/lib/services/attendanceShiftHelper");

        const target = await resolveAttendanceTargetForEmployee(
            session.employeeId,
            now,
            shift?.days ?? []
        );

        if (target.mode === "ALREADY_COMPLETED") {
            return NextResponse.json(
                { error: "Anda sudah melakukan clock-in dan clock-out untuk shift hari ini." },
                { status: 400 }
            );
        }

        if (target.mode === "CLOCK_OUT") {
            const existing = target.existingRecord;

            // ── Clock-Out Hard-Block Enforcement (Hanya berlaku untuk hari kerja normal) ──
            if (!existing.isOffDay && shift && target.scheduleDay && !target.scheduleDay.isOff) {
                const windows = getNormalizedShiftWindows(target.scheduleDay, shift);
                const clockOutMinutes = target.relativeClockMinutes;

                if (clockOutMinutes < windows.earliestOutMinutes) {
                    return NextResponse.json(
                        { error: `Belum waktunya clock-out. Anda bisa pulang mulai pukul ${formatShiftMinutes(windows.earliestOutMinutes)}.` },
                        { status: 400 }
                    );
                }

                if (shift.lateCheckOut > 0 && clockOutMinutes > windows.latestOutMinutes) {
                    return NextResponse.json(
                        { error: `Waktu clock-out sudah melewati batas pukul ${formatShiftMinutes(windows.latestOutMinutes)}. Hubungi HR.` },
                        { status: 400 }
                    );
                }
            }

            const locationWithNetwork = body.location ? {
                lat: body.location.lat,
                lng: body.location.lng,
                accuracy: body.location.accuracyMeters ?? undefined,
                clientIp,
                isOfficeWifi,
                networkName,
            } : null;

            const updated = await updateAttendance(existing.id, {
                clockOut: now.toISOString(),
                clockOutLocation: locationWithNetwork,
                clockOutPhoto: body.photo,
            });
            if (!updated) {
                return serverErrorResponse("AttendanceClockOutUpdate", new Error("Attendance update returned null"), {
                    attendanceId: existing.id,
                    employeeId: session.employeeId,
                });
            }

            logger.info("Clock-out success", {
                employeeId: session.employeeId,
                isOffDay: existing.isOffDay,
                shiftDate: target.shiftDate,
                isOvernight: target.isOvernight,
            });
            return NextResponse.json(updated);
        }

        // ── target.mode === "CLOCK_IN" ──
        const isOffDay = Boolean(shift && (!target.scheduleDay || target.scheduleDay.isOff));

        // ── Validasi Kehadiran Hari Libur (Off-Day Attendance) ──
        if (isOffDay) {
            const reason = body.offDayReason?.trim();
            if (!reason || reason.length < 3) {
                return NextResponse.json(
                    { error: "Keperluan/alasan presensi hari libur wajib diisi (minimal 3 karakter) untuk verifikasi HR." },
                    { status: 400 }
                );
            }
        }

        let status: "present" | "late" = "present";

        // ── Clock-In Early Block & Tolerance ──
        if (!isOffDay && shift && target.scheduleDay && !target.scheduleDay.isOff) {
            const windows = getNormalizedShiftWindows(target.scheduleDay, shift);
            const clockInMinutes = target.relativeClockMinutes;

            if (clockInMinutes < windows.earliestInMinutes) {
                return NextResponse.json(
                    { error: `Belum waktunya clock-in. Anda bisa melakukan presensi mulai pukul ${formatShiftMinutes(windows.earliestInMinutes)}.` },
                    { status: 400 }
                );
            }

            if (clockInMinutes > windows.lateDeadlineMinutes) {
                status = "late";
            }
        } else if (!shift && !isOffDay) {
            const { hours: nowH } = getWIBHoursMinutes(now);
            if (nowH > 9) {
                status = "late";
            }
        }

        const locationWithNetwork = body.location ? {
            lat: body.location.lat,
            lng: body.location.lng,
            accuracy: body.location.accuracyMeters ?? undefined,
            clientIp,
            isOfficeWifi,
            networkName,
        } : null;

        const record = await createAttendance({
            employeeId: session.employeeId,
            date: target.shiftDate,
            clockIn: now.toISOString(),
            clockInLocation: locationWithNetwork,
            clockInPhoto: body.photo,
            status,
            isOffDay,
            offDayReason: isOffDay ? body.offDayReason?.trim() ?? null : null,
        });

        logger.info("Clock-in success", { employeeId: session.employeeId, status, isOffDay });
        return NextResponse.json(record);
    } catch (err) {
        return serverErrorResponse("AttendancePOST", err);
    }
}

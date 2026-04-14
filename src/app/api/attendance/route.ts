import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import {
    getAttendanceRecords,
    getAttendanceByDate,
    createAttendance,
    updateAttendance,
} from "@/lib/services/attendanceService";
import { prisma } from "@/lib/prisma";
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
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get("employeeId");

        if (session.role === "hr") {
            const records = await getAttendanceRecords(employeeId || undefined);
            return NextResponse.json(records);
        }

        const records = await getAttendanceRecords(session.employeeId);
        return NextResponse.json(records);
    } catch (err) {
        return serverErrorResponse("AttendanceGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, attendanceSchema);
        if ("error" in result) return result.error;
        const body = result.data;
        // Photo validation is enforced by attendanceSchema (min(1) + max(2.8MB))
        //
        // ⚠️ KNOWN LIMITATION: Face verification saat ini hanya dilakukan client-side
        // via face-api.js. Server menerima foto tanpa re-verifikasi descriptor.
        // TODO: Implementasi server-side face descriptor verification memerlukan
        // @tensorflow/tfjs-node + model loading. Tracked as future enhancement.

        const today = toWIBDateString();

        // Fetch employee settings with proper typing
        const employee = await prisma.employee.findUnique({
            where: { employeeId: session.employeeId },
            include: { locations: true }
        });

        if (!employee) {
            return NextResponse.json({ error: "Data karyawan tidak ditemukan" }, { status: 404 });
        }

        // Location verification logic
        if (!employee.bypassLocation) {
            if (!body.location || typeof body.location.lat !== "number" || typeof body.location.lng !== "number") {
                return NextResponse.json({ error: "Akses lokasi diperlukan untuk melakukan absensi." }, { status: 400 });
            }

            if (!employee.locations || employee.locations.length === 0) {
                return NextResponse.json({ error: "Lokasi absensi Anda belum diatur oleh HR. Silakan hubungi admin." }, { status: 403 });
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
                    { error: "Anda berada di luar radius lokasi absensi yang diizinkan." },
                    { status: 403 }
                );
            }
        }

        const existing = await getAttendanceByDate(session.employeeId, today);

        // ── Resolve shift early (needed for both clock-in and clock-out) ──
        const now = new Date();
        const todayDay = getWIBDayOfWeek(now);
        const { hours: nowH, minutes: nowM } = getWIBHoursMinutes(now);
        const clockMinutes = nowH * 60 + nowM;

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

        const todaySchedule = shift?.days.find((d) => d.dayOfWeek === todayDay);

        if (existing) {
            if (existing.clockOut) {
                return NextResponse.json(
                    { error: "Anda sudah melakukan clock-in dan clock-out hari ini." },
                    { status: 400 }
                );
            }

            // ── Clock-Out Hard-Block Enforcement ──
            if (shift && todaySchedule && !todaySchedule.isOff) {
                const [endH, endM] = todaySchedule.endTime.split(":").map(Number);
                const shiftEndMinutes = endH * 60 + endM;
                const clockOutMinutes = clockMinutes;

                const earliestOut = shiftEndMinutes - (shift.earlyCheckOut ?? 0);
                if (clockOutMinutes < earliestOut) {
                    return NextResponse.json(
                        { error: `Belum waktunya clock-out. Anda bisa pulang mulai pukul ${formatMinutes(earliestOut)}.` },
                        { status: 400 }
                    );
                }

                const latestOut = shiftEndMinutes + (shift.lateCheckOut ?? 0);
                if (shift.lateCheckOut > 0 && clockOutMinutes > latestOut) {
                    return NextResponse.json(
                        { error: `Waktu clock-out sudah melewati batas pukul ${formatMinutes(latestOut)}. Hubungi HR.` },
                        { status: 400 }
                    );
                }
            }

            const updated = await updateAttendance(existing.id, {
                clockOut: new Date().toISOString(),
                clockOutLocation: body.location,
                clockOutPhoto: body.photo,
            });

            logger.info("Clock-out success", { employeeId: session.employeeId });
            return NextResponse.json(updated);
        }

        if (shift) {
            if (!todaySchedule || todaySchedule.isOff) {
                return NextResponse.json(
                    { error: "Hari ini bukan merupakan hari kerja Anda sesuai jadwal shift." },
                    { status: 400 }
                );
            }
        }

        // ── Clock-In Early Block ──
        if (shift && todaySchedule && !todaySchedule.isOff) {
            const [shiftHour, shiftMin] = todaySchedule.startTime.split(":").map(Number);
            const shiftStartMinutes = shiftHour * 60 + shiftMin;
            const earliestIn = shiftStartMinutes - (shift.earlyCheckIn ?? 0);
            const clockInMinutes = clockMinutes;

            if (clockInMinutes < earliestIn) {
                return NextResponse.json(
                    { error: `Belum waktunya clock-in. Anda bisa absen mulai pukul ${formatMinutes(earliestIn)}.` },
                    { status: 400 }
                );
            }
        }

        let status: "present" | "late" = "present";

        if (shift && todaySchedule && !todaySchedule.isOff) {
            const [shiftHour, shiftMin] = todaySchedule.startTime.split(":").map(Number);
            const shiftStartMinutes = shiftHour * 60 + shiftMin;
            const tolerance = shift.lateCheckIn ?? 0;
            const deadlineMinutes = shiftStartMinutes + tolerance;

            if (clockMinutes > deadlineMinutes) {
                status = "late";
            }
        } else if (!shift) {
            if (nowH > 9) {
                status = "late";
            }
        }

        const record = await createAttendance({
            employeeId: session.employeeId,
            date: today,
            clockIn: now.toISOString(),
            clockInLocation: body.location,
            clockInPhoto: body.photo,
            status,
        });

        logger.info("Clock-in success", { employeeId: session.employeeId, status });
        return NextResponse.json(record);
    } catch (err) {
        return serverErrorResponse("AttendancePOST", err);
    }
}

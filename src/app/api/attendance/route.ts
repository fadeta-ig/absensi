import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AttendanceMutationError, getAttendanceRecords, performAttendanceMutation } from "@/lib/services/attendanceService";
import { prisma } from "@/lib/prisma";
import { extractClientIp, isOfficeWifiNetwork } from "@/lib/networkValidator";
import { calculateDistance } from "@/lib/utils";
import { toWIBDateString, toWIBISOString } from "@/lib/timezone";
import { attendanceSchema } from "@/lib/validations/validationSchemas";
import logger from "@/lib/logger";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get("employeeId");

        if (session.permissions.includes(PERMISSIONS.HR_MANAGE)) {
            const records = await getAttendanceRecords(employeeId || undefined);
            return NextResponse.json(records, { headers: { "Cache-Control": "no-store" } });
        }
        if (!session.employeeId) return forbiddenResponse();

        const records = await getAttendanceRecords(session.employeeId);
        return NextResponse.json(records, { headers: { "Cache-Control": "no-store" } });
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

        // Waktu request dibekukan; shift di-resolve setelah employee lock di service
        // agar perubahan roster konkuren tidak menghasilkan presensi dengan shift basi.
        const now = new Date();
        const locationWithNetwork = body.location ? {
            lat: body.location.lat,
            lng: body.location.lng,
            accuracy: body.location.accuracyMeters ?? undefined,
            clientIp,
            isOfficeWifi,
            networkName,
        } : null;

        const mutation = await performAttendanceMutation({
            employeeId: session.employeeId,
            expectedAction: body.action,
            expectedShiftDate: body.shiftDate,
            now,
            photo: body.photo,
            location: locationWithNetwork,
            offDayReason: body.offDayReason,
        });

        logger.info("Attendance mutation success", {
            employeeId: session.employeeId,
            action: body.action,
            shiftDate: mutation.target.shiftDate,
            isOvernight: mutation.target.isOvernight,
            isOffDay: mutation.isOffDay,
        });
        return NextResponse.json({
            ...mutation.record,
            serverWibNow: toWIBISOString(now),
            serverWibDate: toWIBDateString(now),
            shiftDate: mutation.target.shiftDate,
            action: body.action,
            activeMode: mutation.record.clockOut ? "ALREADY_COMPLETED" : "CLOCK_OUT",
            isOvernight: mutation.target.isOvernight,
            isOffDay: mutation.isOffDay,
        });
    } catch (err) {
        if (err instanceof AttendanceMutationError) {
            return NextResponse.json({
                error: err.message,
                code: err.code,
                serverWibNow: toWIBISOString(),
                shiftDate: err.target?.shiftDate,
                activeMode: err.target?.mode,
                record: err.target && "existingRecord" in err.target ? err.target.existingRecord : null,
            }, { status: err.statusCode });
        }
        return serverErrorResponse("AttendancePOST", err);
    }
}

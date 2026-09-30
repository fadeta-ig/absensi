import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, parseFormData, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AttendanceMutationError, AttendancePhotoValidationError, deleteAttendancePhotoFile, getAttendanceRecords, isJpegBytes, performAttendanceMutation, saveAttendancePhoto } from "@/lib/services/attendanceService";
import { getUploadLimit } from "@/lib/services/appSettingsService";
import { prisma } from "@/lib/prisma";
import { extractClientIp, isOfficeWifiNetwork } from "@/lib/networkValidator";
import { calculateDistance } from "@/lib/utils";
import { toWIBDateString, toWIBISOString } from "@/lib/timezone";
import logger from "@/lib/logger";
import { PERMISSIONS } from "@/lib/permissions";

/** Cutover Gel.2a: klien lama (JSON-base64) wajib refresh aplikasi (PWA) ke kontrak multipart 1-step. */
const LEGACY_PHOTO_CONTRACT_MESSAGE = "Format presensi kedaluwarsa. Silakan refresh aplikasi dan coba lagi.";

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

    // Cutover langsung Gel.2a: kontrak JSON-base64 lama ditolak tanpa dual-accept transport.
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        return NextResponse.json({ error: LEGACY_PHOTO_CONTRACT_MESSAGE }, { status: 400 });
    }

    let photoPath: string | null = null;
    try {
        const parsedForm = await parseFormData(request, "AttendancePOST");
        if ("error" in parsedForm) return parsedForm.error;
        const form = parsedForm.data;

        const action = form.get("action");
        const shiftDate = form.get("shiftDate");
        const offDayReasonRaw = form.get("offDayReason");
        const photo = form.get("photo");

        // Kontrak lama (string base64) yang diselundupkan via multipart tetap ditolak.
        if (typeof photo === "string") {
            return NextResponse.json({ error: LEGACY_PHOTO_CONTRACT_MESSAGE }, { status: 400 });
        }
        if (!(photo instanceof File) || photo.size === 0) {
            return NextResponse.json({ error: "Foto selfie wajib disertakan sebagai bukti kehadiran." }, { status: 400 });
        }
        if (action !== "CLOCK_IN" && action !== "CLOCK_OUT") {
            return NextResponse.json({ error: "Aksi presensi tidak valid." }, { status: 400 });
        }
        const expectedAction = action as "CLOCK_IN" | "CLOCK_OUT";
        if (
            typeof shiftDate !== "string"
            || !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)
            || Number.isNaN(new Date(`${shiftDate}T00:00:00+07:00`).getTime())
        ) {
            return NextResponse.json({ error: "Tanggal shift harus berformat YYYY-MM-DD yang valid." }, { status: 400 });
        }

        // Lokasi: field "location" sebagai JSON string (klien), atau field lat/lng terpisah.
        let location: { lat: number; lng: number; accuracyMeters?: number } | undefined;
        const locationRaw = form.get("location");
        if (typeof locationRaw === "string" && locationRaw.trim()) {
            try {
                const parsed = JSON.parse(locationRaw) as {
                    lat: unknown; lng: unknown; accuracyMeters?: unknown; accuracy?: unknown;
                };
                const lat = Number(parsed.lat);
                const lng = Number(parsed.lng);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("invalid-location");
                const accuracyMeters = parsed.accuracyMeters ?? parsed.accuracy;
                location = {
                    lat,
                    lng,
                    ...(accuracyMeters === undefined || accuracyMeters === null || accuracyMeters === ""
                        ? {}
                        : { accuracyMeters: Number(accuracyMeters) }),
                };
            } catch {
                return NextResponse.json({ error: "Data lokasi tidak valid." }, { status: 400 });
            }
        } else {
            const latRaw = form.get("lat");
            const lngRaw = form.get("lng");
            if (latRaw !== null || lngRaw !== null) {
                const lat = Number(latRaw);
                const lng = Number(lngRaw);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                    return NextResponse.json({ error: "Data lokasi tidak valid." }, { status: 400 });
                }
                location = { lat, lng };
            }
        }
        if (
            location
            && (!Number.isFinite(location.accuracyMeters ?? 0)
                || location.lat < -90 || location.lat > 90
                || location.lng < -180 || location.lng > 180)
        ) {
            return NextResponse.json({ error: "Data lokasi tidak valid." }, { status: 400 });
        }

        const offDayReason = typeof offDayReasonRaw === "string" && offDayReasonRaw.trim()
            ? offDayReasonRaw.trim().slice(0, 500)
            : undefined;
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
            if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
                return NextResponse.json({ error: "Akses lokasi diperlukan untuk melakukan presensi." }, { status: 400 });
            }

            if (!employee.locations || employee.locations.length === 0) {
                return NextResponse.json({ error: "Lokasi presensi Anda belum diatur oleh HR. Silakan hubungi admin." }, { status: 403 });
            }

            const isWithinRange = employee.locations.some((loc) => {
                const dist = calculateDistance(
                    location.lat,
                    location.lng,
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

        // Selfie 1-step: validasi magic JPEG + batas setting, lalu simpan ke disk (atomik per file).
        const photoBytes = Buffer.from(await photo.arrayBuffer());
        const maxMb = await getUploadLimit("upload.selfie.maxMb");
        const maxBytes = Math.floor(maxMb * 1024 * 1024);
        if (photoBytes.length === 0) {
            return NextResponse.json({ error: "Foto selfie wajib disertakan sebagai bukti kehadiran." }, { status: 400 });
        }
        if (photoBytes.length > maxBytes) {
            return NextResponse.json(
                { error: `Ukuran foto terlalu besar. Maksimal ${maxMb} MB. Silakan ambil ulang foto.` },
                { status: 400 }
            );
        }
        if (!isJpegBytes(photoBytes)) {
            return NextResponse.json({ error: "Foto harus berformat JPEG dari kamera aplikasi." }, { status: 400 });
        }
        try {
            photoPath = await saveAttendancePhoto(session.employeeId, photoBytes, maxBytes);
        } catch (err) {
            if (err instanceof AttendancePhotoValidationError) {
                return NextResponse.json({ error: err.message }, { status: 400 });
            }
            throw err;
        }

        // Waktu request dibekukan; shift di-resolve setelah employee lock di service
        // agar perubahan roster konkuren tidak menghasilkan presensi dengan shift basi.
        const now = new Date();
        const locationWithNetwork = location ? {
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracyMeters ?? undefined,
            clientIp,
            isOfficeWifi,
            networkName,
        } : null;

        const mutation = await performAttendanceMutation({
            employeeId: session.employeeId,
            expectedAction,
            expectedShiftDate: shiftDate,
            now,
            photoPath,
            location: locationWithNetwork,
            offDayReason,
        });

        logger.info("Attendance mutation success", {
            employeeId: session.employeeId,
            action: expectedAction,
            shiftDate: mutation.target.shiftDate,
            isOvernight: mutation.target.isOvernight,
            isOffDay: mutation.isOffDay,
        });
        return NextResponse.json({
            ...mutation.record,
            serverWibNow: toWIBISOString(now),
            serverWibDate: toWIBDateString(now),
            shiftDate: mutation.target.shiftDate,
            action: expectedAction,
            activeMode: mutation.record.clockOut ? "ALREADY_COMPLETED" : "CLOCK_OUT",
            isOvernight: mutation.target.isOvernight,
            isOffDay: mutation.isOffDay,
        });
    } catch (err) {
        // File yatim dibersihkan bila mutasi DB gagal setelah foto tersimpan.
        if (photoPath) await deleteAttendancePhotoFile(photoPath);
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
        if (err instanceof AttendancePhotoValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return serverErrorResponse("AttendancePOST", err);
    }
}

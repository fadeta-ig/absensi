import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import { isValidCalendarDate, toUTCDateKey } from "@/lib/timezone";
import { isOvernightSchedule } from "@/lib/services/attendanceShiftHelper";

/**
 * Jadwal shift karyawan untuk satu tanggal (data milik sendiri).
 * Dipakai form koreksi untuk menentukan otomatis apakah jam H+1 valid.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const date = new URL(request.url).searchParams.get("date") ?? "";
        if (!isValidCalendarDate(date)) {
            return NextResponse.json({ error: "Tanggal harus berformat YYYY-MM-DD yang valid." }, { status: 400 });
        }

        const employee = await prisma.employee.findUnique({
            where: { employeeId: session.employeeId },
            select: { shiftId: true },
        });
        if (!employee) {
            return NextResponse.json({ error: "Data karyawan tidak ditemukan." }, { status: 404 });
        }

        const { resolveShiftForDate } = await import("@/lib/services/shiftAssignmentService");
        const resolved = await resolveShiftForDate(prisma, session.employeeId, date);
        const scheduleDay = resolved?.days.find(
            (day) => day.dayOfWeek === toUTCDateKey(date).getUTCDay()
        ) ?? null;

        if (!resolved || !scheduleDay) {
            return NextResponse.json({ date, schedule: null }, { headers: { "Cache-Control": "no-store" } });
        }

        return NextResponse.json({
            date,
            schedule: {
                shiftName: resolved.shiftName,
                startTime: scheduleDay.startTime,
                endTime: scheduleDay.endTime,
                isOff: scheduleDay.isOff,
                isOvernight: isOvernightSchedule(scheduleDay.startTime, scheduleDay.endTime),
            },
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
        return serverErrorResponse("AttendanceShiftScheduleGET", err);
    }
}

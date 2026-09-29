import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import { toWIBDateString, addCalendarDays, toUTCDateKey } from "@/lib/timezone";
import { isOvernightSchedule } from "@/lib/services/attendanceShiftHelper";
import { resolveShiftForDate } from "@/lib/services/shiftAssignmentService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const daysParam = request.nextUrl.searchParams.get("days") ?? "14";
        const days = parseInt(daysParam, 10);
        
        if (isNaN(days) || days < 1 || days > 31) {
            return NextResponse.json({ error: "Parameter days harus berada di antara 1 dan 31." }, { status: 400 });
        }

        const employee = await prisma.employee.findUnique({
            where: { employeeId: session.employeeId },
            select: { id: true },
        });

        if (!employee) {
            return NextResponse.json({ error: "Data karyawan tidak ditemukan." }, { status: 404 });
        }

        const serverWibDate = toWIBDateString(new Date());
        const schedule = [];
        let currentDate = serverWibDate;

        for (let i = 0; i < days; i++) {
            const resolved = await resolveShiftForDate(prisma, session.employeeId, currentDate);
            const utcDateKey = toUTCDateKey(currentDate);
            const weekday = utcDateKey.getUTCDay();
            
            const scheduleDay = resolved?.days.find((day) => day.dayOfWeek === weekday) ?? null;

            schedule.push({
                date: currentDate,
                weekday,
                shiftId: resolved?.shiftId ?? null,
                shiftName: resolved?.shiftName ?? null,
                startTime: scheduleDay?.startTime ?? null,
                endTime: scheduleDay?.endTime ?? null,
                isOff: scheduleDay?.isOff ?? true,
                isOvernight: scheduleDay ? isOvernightSchedule(scheduleDay.startTime, scheduleDay.endTime) : false,
                source: resolved?.source ?? "none"
            });

            currentDate = addCalendarDays(currentDate, 1);
        }

        return NextResponse.json(schedule, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
        return serverErrorResponse("EmployeeShiftScheduleGET", err);
    }
}

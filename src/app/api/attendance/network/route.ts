import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { extractClientIp, isOfficeWifiNetwork } from "@/lib/networkValidator";
import { prisma } from "@/lib/prisma";
import { toWIBDateString, getWIBDayOfWeek, toWIBISOString, addCalendarDays } from "@/lib/timezone";

export async function GET(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();

        const clientIp = extractClientIp(request);
        const isOfficeWifi = isOfficeWifiNetwork(clientIp);

        const now = new Date();
        const todayDay = getWIBDayOfWeek(now);

        let bypassLocation = false;
        let isOffDay = false;
        let shiftName: string | null = null;
        let todaySchedule: { startTime: string; endTime: string; isOff: boolean } | null = null;
        let isOvernight = false;
        let activeMode: "CLOCK_IN" | "CLOCK_OUT" | "ALREADY_COMPLETED" = "CLOCK_IN";
        let shiftDate = toWIBDateString(now);

        if (session.employeeId) {
            const emp = await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { bypassLocation: true, shiftId: true },
            });
            bypassLocation = emp?.bypassLocation ?? false;

            const { resolveShiftForDate } = await import("@/lib/services/shiftAssignmentService");
            const serverDate = toWIBDateString(now);
            const yesterdayDate = addCalendarDays(serverDate, -1);
            const [todayShift, yesterdayShift] = await Promise.all([
                resolveShiftForDate(prisma, session.employeeId, serverDate),
                resolveShiftForDate(prisma, session.employeeId, yesterdayDate),
            ]);
            const shift = todayShift ? {
                name: todayShift.shiftName ?? "",
                days: todayShift.days,
                earlyCheckIn: todayShift.tolerance.earlyCheckIn ?? 0,
                lateCheckIn: todayShift.tolerance.lateCheckIn ?? 0,
                earlyCheckOut: todayShift.tolerance.earlyCheckOut ?? 0,
                lateCheckOut: todayShift.tolerance.lateCheckOut ?? 0,
            } : null;

            if (shift) {
                const { resolveAttendanceTargetForEmployee, isOvernightSchedule } = await import("@/lib/services/attendanceShiftHelper");
                const target = await resolveAttendanceTargetForEmployee(
                    session.employeeId,
                    now,
                    shift.days,
                    shift,
                    yesterdayShift ? { days: yesterdayShift.days, tolerance: yesterdayShift.tolerance } : undefined,
                );

                activeMode = target.mode;
                shiftDate = target.shiftDate;
                isOvernight = target.isOvernight;
                shiftName = (target.shiftDate === yesterdayDate ? yesterdayShift : todayShift)?.shiftName ?? null;

                if (target.scheduleDay) {
                    todaySchedule = {
                        startTime: target.scheduleDay.startTime,
                        endTime: target.scheduleDay.endTime,
                        isOff: target.scheduleDay.isOff,
                    };
                    isOffDay = target.scheduleDay.isOff;
                } else {
                    const sched = shift.days.find((d) => d.dayOfWeek === todayDay);
                    if (sched) {
                        todaySchedule = {
                            startTime: sched.startTime,
                            endTime: sched.endTime,
                            isOff: sched.isOff,
                        };
                        isOffDay = sched.isOff;
                        isOvernight = isOvernightSchedule(sched.startTime, sched.endTime);
                    } else {
                        isOffDay = true;
                    }
                }
            }
        }

        return NextResponse.json({
            isOfficeWifi,
            clientIp,
            bypassLocation,
            networkName: isOfficeWifi ? "Wi-Fi Kantor WIG" : "Jaringan Luar / Seluler",
            isOffDay,
            shiftName,
            todaySchedule,
            isOvernight,
            activeMode,
            shiftDate,
            serverWibNow: toWIBISOString(now),
            serverWibDate: toWIBDateString(now),
            timeZone: "Asia/Jakarta",
        });
    } catch (err) {
        return serverErrorResponse("AttendanceNetworkCheck", err);
    }
}

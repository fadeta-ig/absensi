import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { extractClientIp, isOfficeWifiNetwork } from "@/lib/networkValidator";
import { prisma } from "@/lib/prisma";
import { toWIBDateString, getWIBDayOfWeek, toWIBISOString, addCalendarDays, toUTCDateKey } from "@/lib/timezone";
import { isSmartShiftEmployee } from "@/lib/services/appSettingsService";
import type { SmartShiftOptionDTO } from "@/lib/services/smartShiftResolver";

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
        let smartShift: {
            enabled: boolean;
            activeShiftId: string | null;
            activeShiftNumber: 1 | 2 | 3 | null;
            options: SmartShiftOptionDTO[];
        } | undefined;

        if (session.employeeId) {
            const emp = await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { bypassLocation: true, shiftId: true },
            });
            bypassLocation = emp?.bypassLocation ?? false;

            const serverDate = toWIBDateString(now);
            const yesterdayDate = addCalendarDays(serverDate, -1);
            const isSmart = await isSmartShiftEmployee(session.employeeId);

            if (isSmart) {
                const [{ loadThreeRotationShifts, resolveSmartAttendanceTarget }, { toAttendanceRecord }] = await Promise.all([
                    import("@/lib/services/smartShiftResolver"),
                    import("@/lib/services/attendanceService"),
                ]);
                const [threeShifts, yesterdayRow, todayRow] = await Promise.all([
                    loadThreeRotationShifts(prisma),
                    prisma.attendanceRecord.findUnique({
                        where: { employeeId_date: { employeeId: session.employeeId, date: toUTCDateKey(yesterdayDate) } },
                    }),
                    prisma.attendanceRecord.findUnique({
                        where: { employeeId_date: { employeeId: session.employeeId, date: toUTCDateKey(serverDate) } },
                    }),
                ]);
                const smartResult = resolveSmartAttendanceTarget(now, threeShifts, {
                    yesterday: yesterdayRow ? toAttendanceRecord(yesterdayRow) : undefined,
                    today: todayRow ? toAttendanceRecord(todayRow) : undefined,
                });

                activeMode = smartResult.target.mode;
                shiftDate = smartResult.target.shiftDate;
                isOvernight = smartResult.target.isOvernight;
                shiftName = smartResult.activeShift?.name ?? null;
                isOffDay = smartResult.isOffDay;
                if (smartResult.target.scheduleDay) {
                    todaySchedule = {
                        startTime: smartResult.target.scheduleDay.startTime,
                        endTime: smartResult.target.scheduleDay.endTime,
                        isOff: smartResult.target.scheduleDay.isOff,
                    };
                }
                smartShift = {
                    enabled: true,
                    activeShiftId: smartResult.activeShift?.id ?? null,
                    activeShiftNumber: smartResult.activeShift?.shiftNumber ?? null,
                    options: smartResult.options,
                };
            } else {
                const { resolveShiftForDate } = await import("@/lib/services/shiftAssignmentService");
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
            ...(smartShift ? { smartShift } : {}),
        });
    } catch (err) {
        return serverErrorResponse("AttendanceNetworkCheck", err);
    }
}

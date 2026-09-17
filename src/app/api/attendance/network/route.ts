import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { extractClientIp, isOfficeWifiNetwork } from "@/lib/networkValidator";
import { prisma } from "@/lib/prisma";
import { getWIBDayOfWeek } from "@/lib/timezone";

export async function GET(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();

        const clientIp = extractClientIp(request);
        const isOfficeWifi = isOfficeWifiNetwork(clientIp);

        let bypassLocation = false;
        let isOffDay = false;
        let shiftName: string | null = null;
        let todaySchedule: { startTime: string; endTime: string; isOff: boolean } | null = null;

        if (session.employeeId) {
            const emp = await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { bypassLocation: true, shiftId: true },
            });
            bypassLocation = emp?.bypassLocation ?? false;

            let shift = null;
            if (emp?.shiftId) {
                shift = await prisma.workShift.findUnique({
                    where: { id: emp.shiftId },
                    include: { days: true },
                });
            }
            if (!shift) {
                shift = await prisma.workShift.findFirst({
                    where: { isDefault: true },
                    include: { days: true },
                });
            }

            if (shift) {
                shiftName = shift.name;
                const now = new Date();
                const todayDay = getWIBDayOfWeek(now);
                const sched = shift.days.find((d) => d.dayOfWeek === todayDay);
                if (sched) {
                    todaySchedule = {
                        startTime: sched.startTime,
                        endTime: sched.endTime,
                        isOff: sched.isOff,
                    };
                    isOffDay = sched.isOff;
                } else {
                    isOffDay = true;
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
        });
    } catch (err) {
        return serverErrorResponse("AttendanceNetworkCheck", err);
    }
}

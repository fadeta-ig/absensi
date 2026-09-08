import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { extractClientIp, isOfficeWifiNetwork } from "@/lib/networkValidator";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();

        const clientIp = extractClientIp(request);
        const isOfficeWifi = isOfficeWifiNetwork(clientIp);

        let bypassLocation = false;
        if (session.employeeId) {
            const emp = await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { bypassLocation: true },
            });
            bypassLocation = emp?.bypassLocation ?? false;
        }

        return NextResponse.json({
            isOfficeWifi,
            clientIp,
            bypassLocation,
            networkName: isOfficeWifi ? "Wi-Fi Kantor WIG" : "Jaringan Luar / Seluler",
        });
    } catch (err) {
        return serverErrorResponse("AttendanceNetworkCheck", err);
    }
}

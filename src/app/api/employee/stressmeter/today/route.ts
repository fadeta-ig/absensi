import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canUseEmployeePortal } from "@/lib/permissions";
import { getEmployeeTodayCheckinStatus } from "@/lib/services/stressmeterService";

export async function GET(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canUseEmployeePortal(session) || !session.employeeId) {
            return forbiddenResponse();
        }

        const shiftDate = request.nextUrl.searchParams.get("shiftDate");
        const status = await getEmployeeTodayCheckinStatus(session.employeeId, shiftDate);

        return NextResponse.json({
            success: true,
            data: status,
        });
    } catch (error) {
        return serverErrorResponse("EmployeeStressmeterTodayGET", error);
    }
}

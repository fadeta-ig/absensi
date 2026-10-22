import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AppointmentError, getAvailability, isWig002 } from "@/lib/services/appointmentService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get("date") ?? "";
        const employeeIds = searchParams.get("employees")?.split(",").map((v) => v.trim()).filter(Boolean);
        const data = await getAvailability({
            date,
            roomId: searchParams.get("roomId") ?? undefined,
            employeeIds,
            excludeId: searchParams.get("excludeId") ?? undefined,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentAvailabilityGET", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AppointmentError, getAvailability } from "@/lib/services/appointmentService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get("date") ?? "";
        const employeeIds = searchParams.get("employees")?.split(",").map((v) => v.trim()).filter(Boolean);
        const data = await getAvailability({
            date,
            roomId: searchParams.get("roomId") ?? undefined,
            employeeIds,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentAvailabilityGET", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AppointmentError, markAttendance } from "@/lib/services/appointmentService";
import { appointmentAttendanceSchema } from "@/lib/validations/validationSchemas";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, appointmentAttendanceSchema);
        if ("error" in result) return result.error;

        const data = await markAttendance(session, id, result.data.marks, { userId: session.userId, username: session.username });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentAttendancePOST", err);
    }
}

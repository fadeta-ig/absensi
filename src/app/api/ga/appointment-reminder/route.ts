import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    AppointmentError,
    getReminderOffsets,
    isWig002,
    setReminderOffsets,
} from "@/lib/services/appointmentService";
import { reminderOffsetsSetSchema } from "@/lib/validations/validationSchemas";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const offsets = await getReminderOffsets();
        return NextResponse.json({ success: true, data: { offsets } });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentReminderGET", err);
    }
}

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, reminderOffsetsSetSchema);
        if ("error" in result) return result.error;

        const offsets = await setReminderOffsets(result.data.offsets, { userId: session.userId, username: session.username });
        return NextResponse.json({ success: true, data: { offsets } });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("AppointmentReminderPUT", err);
    }
}

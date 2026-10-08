import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    AppointmentError,
    getAppointmentPicInfos,
    isWig002,
    setAppointmentPics,
} from "@/lib/services/appointmentService";
import { appointmentPicSetSchema } from "@/lib/validations/validationSchemas";
import { z } from "zod";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const infos = await getAppointmentPicInfos();
        return NextResponse.json({ success: true, data: { infos } });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaAppointmentPicsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, appointmentPicSetSchema);
        if ("error" in result) return result.error;

        const employeeIds = await setAppointmentPics(result.data.employeeIds, { userId: session.userId, username: session.username });
        const infos = await getAppointmentPicInfos();
        return NextResponse.json({ success: true, data: { employeeIds, infos } });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaAppointmentPicsPOST", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const parsed = z.string().trim().min(1).max(100).safeParse(searchParams.get("id"));
        if (!parsed.success) {
            return NextResponse.json({ error: "Parameter id wajib diisi." }, { status: 400 });
        }
        const current = await getAppointmentPicInfos();
        const next = current.map((c) => c.employeeId).filter((v) => v !== parsed.data);
        const employeeIds = await setAppointmentPics(next, { userId: session.userId, username: session.username });
        const infos = await getAppointmentPicInfos();
        return NextResponse.json({ success: true, data: { employeeIds, infos } });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaAppointmentPicsDELETE", err);
    }
}

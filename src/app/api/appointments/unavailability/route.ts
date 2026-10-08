import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    AppointmentError,
    createUnavailability,
    deleteUnavailability,
    getMyUnavailability,
} from "@/lib/services/appointmentService";
import { unavailabilityCreateSchema } from "@/lib/validations/validationSchemas";
import { z } from "zod";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const data = await getMyUnavailability(session);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("UnavailabilityGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const result = await validateBody(request, unavailabilityCreateSchema);
        if ("error" in result) return result.error;

        const data = await createUnavailability(session, {
            startDate: result.data.startDate,
            endDate: result.data.endDate,
            reason: result.data.reason ?? null,
        });
        return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("UnavailabilityPOST", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const parsed = z.string().trim().min(1).max(100).safeParse(searchParams.get("id"));
        if (!parsed.success) {
            return NextResponse.json({ error: "Parameter id wajib diisi." }, { status: 400 });
        }
        await deleteUnavailability(session, parsed.data);
        return NextResponse.json({ success: true, data: { id: parsed.data } });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("UnavailabilityDELETE", err);
    }
}

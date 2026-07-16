import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { getShifts, createShift, updateShift, deleteShift } from "@/lib/services/shiftService";
import { shiftCreateSchema, shiftUpdateSchema } from "@/lib/validations/validationSchemas";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const shifts = await getShifts();
        return NextResponse.json(shifts);
    } catch (err) {
        return serverErrorResponse("ShiftsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, shiftCreateSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const shift = await createShift(body);

        logger.info("Work shift created", { shiftId: shift.id, name: shift.name, createdBy: session.username });
        return NextResponse.json(shift, { status: 201 });
    } catch (err) {
        return serverErrorResponse("ShiftsPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, shiftUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;

        const shift = await updateShift(id, data);
        if (!shift) {
            return NextResponse.json({ error: "Data shift tidak ditemukan." }, { status: 404 });
        }

        logger.info("Work shift updated", { shiftId: id, updatedBy: session.username });
        return NextResponse.json(shift);
    } catch (err) {
        return serverErrorResponse("ShiftsPUT", err);
    }
}

export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "ID shift diperlukan." }, { status: 400 });
        }

        const success = await deleteShift(id);
        if (!success) {
            return NextResponse.json({ error: "Data shift tidak ditemukan." }, { status: 404 });
        }

        logger.info("Work shift deleted", { shiftId: id, deletedBy: session.username });
        return NextResponse.json({ success: true, message: "Data shift berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("ShiftsDELETE", err);
    }
}

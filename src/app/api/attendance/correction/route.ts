import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { submitCorrection, getCorrectionsByUser, getAllCorrections, resolveCorrection } from "@/lib/services/attendanceCorrectionService";
import { attendanceCorrectionCreateSchema, attendanceCorrectionUpdateSchema } from "@/lib/validations/validationSchemas";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        if (session.role === "hr") {
            const records = await getAllCorrections();
            return NextResponse.json(records);
        }

        const records = await getCorrectionsByUser(session.employeeId);
        return NextResponse.json(records);
    } catch (err) {
        return serverErrorResponse("AttendanceCorrectionGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, attendanceCorrectionCreateSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const correction = await submitCorrection({
            employeeId: session.employeeId,
            ...body
        });

        logger.info("Correction submitted", { id: correction.id, by: session.employeeId });
        return NextResponse.json(correction, { status: 201 });
    } catch (err) {
        return serverErrorResponse("AttendanceCorrectionPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, attendanceCorrectionUpdateSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const updated = await resolveCorrection(body.id, body.status, session.employeeId);
        logger.info("Correction resolved", { id: body.id, status: body.status, by: session.employeeId });
        
        return NextResponse.json(updated);
    } catch (err) {
        return serverErrorResponse("AttendanceCorrectionPATCH", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { submitCorrection, getCorrectionsByUser, getAllCorrections, resolveCorrection } from "@/lib/services/attendanceCorrectionService";
import { attendanceCorrectionCreateSchema, attendanceCorrectionUpdateSchema } from "@/lib/validations/validationSchemas";
import logger from "@/lib/logger";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        if (session.role === "hr") {
            const records = await getAllCorrections();
            return NextResponse.json(records);
        }
        if (!session.employeeId) return forbiddenResponse();

        const records = await getCorrectionsByUser(session.employeeId);
        return NextResponse.json(records);
    } catch (err) {
        return serverErrorResponse("AttendanceCorrectionGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

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
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, attendanceCorrectionUpdateSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const updated = await resolveCorrection(body.id, body.status, session.username);
        logger.info("Correction resolved", { id: body.id, status: body.status, by: session.username });
        
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof Error && err.message === "Correction request not found") {
            return NextResponse.json({ error: "Pengajuan koreksi tidak ditemukan." }, { status: 404 });
        }
        if (err instanceof Error && err.message === "Request has already been processed") {
            return NextResponse.json({ error: "Pengajuan koreksi sudah diproses." }, { status: 409 });
        }
        return serverErrorResponse("AttendanceCorrectionPATCH", err);
    }
}
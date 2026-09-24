import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getAssignments,
    createAssignment,
    endAssignment,
    replaceAssignment,
    getAvailableUsersForAssignment,
    isWig002,
    CleaningError,
} from "@/lib/services/cleaningService";
import { z } from "zod";

const createAssignmentSchema = z.object({
    roomId: z.string().min(1, "Ruangan wajib dipilih"),
    userId: z.string().min(1, "Pengguna wajib dipilih"),
    workerType: z.enum(["INTERNAL", "OUTSOURCE"]),
    applyToToday: z.boolean().optional().default(false),
});

const endAssignmentSchema = z.object({
    assignmentId: z.string().min(1, "ID penugasan wajib diisi"),
    action: z.literal("END"),
    applyToToday: z.boolean().optional().default(false),
    reason: z.string().min(1, "Alasan wajib diisi"),
});

const replaceAssignmentSchema = z.object({
    assignmentId: z.string().min(1, "ID penugasan wajib diisi"),
    action: z.literal("REPLACE"),
    newUserId: z.string().min(1, "Pengguna pengganti wajib dipilih"),
    newWorkerType: z.enum(["INTERNAL", "OUTSOURCE"]),
    applyToToday: z.boolean().optional().default(false),
    reason: z.string().min(1, "Alasan wajib diisi"),
});

const patchSchema = z.discriminatedUnion("action", [endAssignmentSchema, replaceAssignmentSchema]);

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get("roomId") ?? undefined;
        const workerType = searchParams.get("workerType") as "INTERNAL" | "OUTSOURCE" | null;
        const includeInactive = searchParams.get("includeInactive") === "true";

        const assignments = await getAssignments(session, { roomId, workerType: workerType ?? undefined, includeInactive });
        return NextResponse.json({ success: true, data: assignments });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningAssignmentsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, createAssignmentSchema);
        if ("error" in result) return result.error;

        const assignment = await createAssignment(session, result.data);
        return NextResponse.json({ success: true, data: assignment }, { status: 201 });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningAssignmentsPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, patchSchema);
        if ("error" in result) return result.error;

        if (result.data.action === "END") {
            const ended = await endAssignment(session, {
                assignmentId: result.data.assignmentId,
                applyToToday: result.data.applyToToday,
                reason: result.data.reason,
            });
            return NextResponse.json({ success: true, data: ended });
        }

        const replaced = await replaceAssignment(session, {
            assignmentId: result.data.assignmentId,
            newUserId: result.data.newUserId,
            newWorkerType: result.data.newWorkerType,
            applyToToday: result.data.applyToToday,
            reason: result.data.reason,
        });
        return NextResponse.json({ success: true, data: replaced });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningAssignmentsPATCH", err);
    }
}

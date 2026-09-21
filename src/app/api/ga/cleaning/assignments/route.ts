import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getAssignments, createOrUpdateAssignment, getAvailableUsersForAssignment, isWig002, CleaningError } from "@/lib/services/cleaningService";
import { z } from "zod";

const upsertAssignmentSchema = z.object({
    roomId: z.string().min(1, "Ruangan wajib dipilih"),
    userId: z.string().min(1, "Pengguna wajib dipilih"),
    isActive: z.boolean(),
    applyToToday: z.boolean().optional().default(false),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get("roomId") ?? undefined;
        const type = searchParams.get("type");

        // Return available users for assignment UI
        if (type === "available-users") {
            const users = await getAvailableUsersForAssignment(session);
            return NextResponse.json({ success: true, data: users });
        }

        const assignments = await getAssignments(session, roomId);
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
        const result = await validateBody(request, upsertAssignmentSchema);
        if ("error" in result) return result.error;

        const assignment = await createOrUpdateAssignment(session, result.data);
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
        const result = await validateBody(request, upsertAssignmentSchema);
        if ("error" in result) return result.error;

        const assignment = await createOrUpdateAssignment(session, result.data);
        return NextResponse.json({ success: true, data: assignment });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningAssignmentsPATCH", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    createMeetingNote,
    updateNoteTaskStatus,
    getAllActiveTasks,
    getDepartmentTasks,
    canManageGreenMeeting,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager } from "../_guard";
import {
    greenMeetingNoteCreateSchema,
    greenMeetingTaskStatusUpdateSchema,
} from "@/lib/validations/validationSchemas";
import { z } from "zod";

const createNoteBodySchema = greenMeetingNoteCreateSchema.extend({
    sessionId: z.string().trim().min(1, "Session ID wajib diisi"),
});

const patchNoteStatusSchema = greenMeetingTaskStatusUpdateSchema.extend({
    noteId: z.string().trim().min(1, "Note ID wajib diisi"),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const departmentId = searchParams.get("departmentId");
        const divisionId = searchParams.get("divisionId");
        const employeeId = searchParams.get("employeeId");
        const activeTasksOnly = searchParams.get("activeTasks") === "true";
        const includeCompleted = searchParams.get("includeCompleted") === "true";

        if (activeTasksOnly) {
            const isManager = await canManageGreenMeeting(session);
            if (!isManager) return forbiddenResponse();
            const tasks = await getAllActiveTasks(includeCompleted);
            return NextResponse.json(tasks);
        }

        if (departmentId || employeeId || divisionId) {
            const isManager = await canManageGreenMeeting(session);
            const requestedScope = isManager
                ? { departmentId, employeeId, divisionId }
                : {
                    departmentId: session.departmentId,
                    employeeId: session.employeeId,
                    divisionId: session.divisionId,
                };

            const tasks = await getDepartmentTasks(
                requestedScope.departmentId,
                requestedScope.employeeId,
                requestedScope.divisionId
            );
            return NextResponse.json(tasks);
        }

        // Tanpa filter: manager boleh lihat semua, non-manager hanya scope sendiri.
        const isManager = await canManageGreenMeeting(session);
        if (!isManager) {
            const tasks = await getDepartmentTasks(
                session.departmentId,
                session.employeeId,
                session.divisionId
            );
            return NextResponse.json(tasks);
        }

        const tasks = await getAllActiveTasks(includeCompleted);
        return NextResponse.json(tasks);
    } catch (err) {
        return serverErrorResponse("GreenMeetingNotesGET", err);
    }
}

export async function POST(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, createNoteBodySchema);
        if ("error" in result) return result.error;

        const { sessionId, ...data } = result.data;
        const note = await createMeetingNote(sessionId, data, session.username);
        return NextResponse.json(note, { status: 201 });
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingNotesPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, patchNoteStatusSchema);
        if ("error" in result) return result.error;

        const { noteId, taskStatus } = result.data;
        const updated = await updateNoteTaskStatus(noteId, taskStatus, session.username);
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingNotesPATCH", err);
    }
}

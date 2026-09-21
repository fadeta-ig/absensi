import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getRooms, createRoom, updateRoom, isWig002, CleaningError } from "@/lib/services/cleaningService";
import { z } from "zod";

const createRoomSchema = z.object({
    name: z.string().min(1, "Nama ruangan wajib diisi").max(200),
    templateId: z.string().min(1, "Template wajib dipilih"),
});

const updateRoomSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(200).optional(),
    templateId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
});

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const rooms = await getRooms(session);
        return NextResponse.json({ success: true, data: rooms });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningRoomsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, createRoomSchema);
        if ("error" in result) return result.error;

        const room = await createRoom(session, result.data);
        return NextResponse.json({ success: true, data: room }, { status: 201 });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningRoomsPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, updateRoomSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;
        const room = await updateRoom(session, id, data);
        return NextResponse.json({ success: true, data: room });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningRoomsPATCH", err);
    }
}

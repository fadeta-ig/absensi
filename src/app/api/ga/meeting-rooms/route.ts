import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    AppointmentError,
    createMeetingRoom,
    deleteMeetingRoom,
    getMeetingRooms,
    isWig002,
    updateMeetingRoom,
} from "@/lib/services/appointmentService";
import { meetingRoomCreateSchema, meetingRoomUpdateSchema } from "@/lib/validations/validationSchemas";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const rooms = await getMeetingRooms(session);
        return NextResponse.json({ success: true, data: rooms });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaMeetingRoomsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, meetingRoomCreateSchema);
        if ("error" in result) return result.error;

        const room = await createMeetingRoom(session, {
            name: result.data.name,
            capacity: result.data.capacity ?? null,
            location: result.data.location ?? null,
            facilities: result.data.facilities ?? null,
        });
        return NextResponse.json({ success: true, data: room }, { status: 201 });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaMeetingRoomsPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, meetingRoomUpdateSchema);
        if ("error" in result) return result.error;

        const { id, ...data } = result.data;
        const room = await updateMeetingRoom(session, id, data);
        return NextResponse.json({ success: true, data: room });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaMeetingRoomsPATCH", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = (searchParams.get("id") ?? "").trim();
        if (!id) {
            return NextResponse.json({ error: "Parameter id wajib diisi." }, { status: 400 });
        }
        await deleteMeetingRoom(session, id);
        return NextResponse.json({ success: true, data: { id } });
    } catch (err) {
        if (err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaMeetingRoomsDELETE", err);
    }
}

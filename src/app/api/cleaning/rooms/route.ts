import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getWorkerRooms, CleaningError } from "@/lib/services/cleaningService";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes("cleaning.execute")) return forbiddenResponse();

    try {
        const rooms = await getWorkerRooms(session);
        return NextResponse.json({ success: true, data: rooms });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningRoomsGET", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    createDeptIzin,
    deleteDeptIzin,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager, ok } from "../_guard";
import { greenMeetingDeptIzinSchema, greenMeetingDeptIzinDeleteSchema } from "@/lib/validations/validationSchemas";

/**
 * POST /api/green-meeting/excuses — catat izin dept satu sesi (dept-only).
 * Divisi didukung untuk notulen (NoteTarget), bukan untuk izin sesi.
 * DELETE /api/green-meeting/excuses?id= — hapus catatan izin.
 * Guard: GA pengelola saja.
 */
export async function POST(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, greenMeetingDeptIzinSchema);
        if ("error" in result) return result.error;

        const created = await createDeptIzin(
            result.data.sessionId,
            {
                departmentId: result.data.departmentId,
                reason: result.data.reason,
            },
            session.username
        );
        return ok(created, "Izin berhasil dicatat.", 201);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingExcusesPOST", err);
    }
}

export async function DELETE(request: NextRequest) {
    const { errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const { searchParams } = new URL(request.url);
        const parsed = greenMeetingDeptIzinDeleteSchema.safeParse({ id: searchParams.get("id") ?? "" });
        if (!parsed.success) {
            return NextResponse.json({ error: "Parameter id wajib diisi." }, { status: 400 });
        }
        const result = await deleteDeptIzin(parsed.data.id);
        return ok(result, "Catatan izin dihapus.");
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingExcusesDELETE", err);
    }
}

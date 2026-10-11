import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { EquipmentError, readQcEvidenceFile } from "@/lib/services/equipmentService";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { id } = await params;
        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Foto QC tidak ditemukan." }, { status: 404 });
        }

        const { buffer } = await readQcEvidenceFile(session, id);
        const filename = `equipment-qc-evidence-${id}.jpg`;

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "image/jpeg",
                "Content-Length": String(buffer.length),
                "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentQcEvidenceFileGET", err);
    }
}

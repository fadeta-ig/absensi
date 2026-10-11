import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { EquipmentError, readEquipmentEvidenceFile } from "@/lib/services/equipmentService";

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
            return NextResponse.json({ error: "Bukti foto tidak ditemukan." }, { status: 404 });
        }

        const { buffer } = await readEquipmentEvidenceFile(session, id);
        const filename = `equipment-evidence-${id}.jpg`;

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "image/jpeg",
                "Content-Length": String(buffer.length),
                "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        if (error instanceof EquipmentError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
            return NextResponse.json(
                { error: "Berkas bukti foto tidak ditemukan di storage." },
                { status: 404 }
            );
        }
        return serverErrorResponse("EmployeeEquipmentEvidenceGET", error);
    }
}

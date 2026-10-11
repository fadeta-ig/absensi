import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { EquipmentError, readEquipmentEvidenceFile, requireWig002OrTopViewer } from "@/lib/services/equipmentService";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        // Tanpa syarat employeeId: WIG002 belum tentu punya employee.
        // Otorisasi penuh di service (WIG002/topViewer).
        await requireWig002OrTopViewer(session);
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
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaEquipmentEvidenceGET", err);
    }
}

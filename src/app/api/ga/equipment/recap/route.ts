import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { EquipmentError, getEquipmentRecap } from "@/lib/services/equipmentService";

const STATUSES = ["OPEN", "SUBMITTED", "DONE"] as const;

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        // Tanpa syarat employeeId: WIG002 belum tentu punya employee.
        // Otorisasi penuh di service (WIG002/topViewer).
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status") ?? undefined;
        if (status && !(STATUSES as readonly string[]).includes(status)) {
            return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
        }
        const data = await getEquipmentRecap(session, {
            unitId: searchParams.get("unitId") ?? undefined,
            status: status as "OPEN" | "SUBMITTED" | "DONE" | undefined,
            from: searchParams.get("from") ?? undefined,
            to: searchParams.get("to") ?? undefined,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EquipmentRecapGET", err);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEmployeeEquipmentAuth } from "@/lib/middleware/equipmentGuard";
import {
    EquipmentError,
    getMyEquipmentInspections,
    startEquipmentInspection,
} from "@/lib/services/equipmentService";
import { z } from "zod";

const startSchema = z.object({
    unitId: z.string().trim().min(1, "unitId wajib diisi."),
});

const ALLOWED_STATUS = new Set(["OPEN", "SUBMITTED", "DONE", "APPROVED"]);

export async function GET(request: NextRequest) {
    const auth = await requireEmployeeEquipmentAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const { searchParams } = new URL(request.url);
        const rawStatus = (searchParams.get("status") ?? "").trim();
        if (rawStatus && !ALLOWED_STATUS.has(rawStatus)) {
            return NextResponse.json(
                { error: "Status harus OPEN, SUBMITTED, DONE, atau APPROVED." },
                { status: 400 }
            );
        }
        const inspections = await getMyEquipmentInspections(session, rawStatus || undefined);
        return NextResponse.json({ success: true, data: inspections });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentInspectionsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireEmployeeEquipmentAuth();
    if (auth.error) return auth.error;
    const { session } = auth;

    try {
        const result = await validateBody(request, startSchema);
        if ("error" in result) return result.error;

        const inspection = await startEquipmentInspection(session, result.data.unitId);
        return NextResponse.json({ success: true, data: inspection }, { status: 201 });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentInspectionsPOST", err);
    }
}

import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { generateTemplate } from "@/lib/services/bulk-import";
import { canManageHr } from "@/lib/permissions";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const buffer = await generateTemplate();

        return new NextResponse(buffer as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": "attachment; filename=Template_Import_Karyawan_V2.xlsx",
            },
        });
    } catch (err) {
        return serverErrorResponse("TemplateGET", err);
    }
}
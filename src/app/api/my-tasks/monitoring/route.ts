import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { WorkTaskError, getWorkTaskMonitoring } from "@/lib/services/workTaskService";

/**
 * GET /api/my-tasks/monitoring — Pantau Tugas: tingkat ketepatan
 * penyelesaian task per karyawan per periode untuk pemantau (baca saja).
 * Param: from, to (YYYY-MM-DD, bawaan bulan berjalan), source (opsional),
 * q, division (filter server), page/limit (pagination baris karyawan).
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) return forbiddenResponse();
    try {
        const { searchParams } = new URL(request.url);
        const page = Number(searchParams.get("page") ?? "1");
        const limit = Number(searchParams.get("limit") ?? "10");
        const result = await getWorkTaskMonitoring(session, {
            from: searchParams.get("from") ?? undefined,
            to: searchParams.get("to") ?? undefined,
            sourceType: searchParams.get("source") ?? undefined,
            q: searchParams.get("q") ?? undefined,
            division: searchParams.get("division") ?? undefined,
            page: Number.isFinite(page) ? page : 1,
            limit: Number.isFinite(limit) ? limit : 10,
        });
        return NextResponse.json({ success: true, ...result });
    } catch (err) {
        if (err instanceof WorkTaskError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
        return serverErrorResponse("MyTaskMonitoringGET", err);
    }
}

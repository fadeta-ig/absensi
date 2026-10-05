import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireWig002OrTopViewer, isWig002, CleaningError } from "@/lib/services/cleaningService";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getTopViewerOverview } from "@/lib/services/cleaningOverviewService";

/**
 * GET /api/ga/cleaning/overview?monthWib=YYYY-MM (read-only).
 * Guard: WIG002 / topViewer (semua ruangan) ATAU reviewer ruangan-bulan itu
 * (hanya ruangannya sendiri). Semua mutasi tetap ditolak di endpoint lain.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const monthWib = searchParams.get("monthWib") || searchParams.get("month") || "";

    let reviewerEmployeeId: string | null = null;
    try {
        await requireWig002OrTopViewer(session);
    } catch {
        // Fallback reviewer: batasi ke ruangan yang ditugaskan kepadanya.
        if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
            return forbiddenResponse();
        }
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthWib)) {
            return NextResponse.json({ error: "Parameter monthWib wajib diisi (YYYY-MM)." }, { status: 400 });
        }
        const assigned = await prisma.cleaningMonthlyApproval.findFirst({
            where: {
                monthWib,
                OR: [
                    { inspectedByEmployeeId: session.employeeId },
                    { knownByEmployeeId: session.employeeId },
                ],
            },
            select: { id: true },
        });
        if (!assigned && !isWig002(session)) return forbiddenResponse();
        reviewerEmployeeId = session.employeeId;
    }

    try {
        const overview = await getTopViewerOverview(monthWib, reviewerEmployeeId);
        return NextResponse.json({ success: true, data: overview });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningOverviewGET", err);
    }
}

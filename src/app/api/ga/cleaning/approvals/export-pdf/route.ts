import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002, CleaningError } from "@/lib/services/cleaningService";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCleaningPdfExportData } from "@/lib/services/cleaningApprovalService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    const monthWib = searchParams.get("monthWib") || searchParams.get("month");

    if (!roomId || !monthWib) {
        return NextResponse.json(
            { error: "Parameter roomId dan monthWib wajib diisi." },
            { status: 400 }
        );
    }

    // PDF memuat matriks sebulan + gambar TTD: batasi ke WIG002 / topViewer /
    // reviewer ruangan-bulan itu (sama seperti checklist detail).
    if (!isWig002(session)) {
        const { isCleaningTopViewer } = await import("@/lib/services/appSettingsService");
        const isTopViewer = await isCleaningTopViewer(session).catch(() => false);
        if (!isTopViewer) {
            if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
                return forbiddenResponse();
            }
            const review = await prisma.cleaningMonthlyApproval.findFirst({
                where: {
                    roomId,
                    monthWib: monthWib.slice(0, 7),
                    OR: [
                        { inspectedByEmployeeId: session.employeeId },
                        { knownByEmployeeId: session.employeeId },
                    ],
                },
                select: { id: true },
            });
            if (!review) return forbiddenResponse();
        }
    }

    try {
        const data = await getCleaningPdfExportData(session, roomId, monthWib);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningExportPdfGET", err);
    }
}

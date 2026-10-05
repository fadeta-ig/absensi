import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getChecklistDetail, isWig002, CleaningError } from "@/lib/services/cleaningService";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { isValidCalendarDate } from "@/lib/timezone";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) {
        // Atasan tertinggi viewer boleh baca semua ruangan (tanpa ini
        // halaman pantau mendapat 403 "tidak memiliki akses").
        const { isCleaningTopViewer } = await import("@/lib/services/appSettingsService");
        const isTopViewer = await isCleaningTopViewer(session).catch(() => false);
        // Reviewer bulanan (INSPECTED_BY/KNOWN_BY) boleh baca detail
        // checklist ruangan yang ditugaskan kepadanya — tanpa ini dashboard
        // paraf employee mendapat 403.
        if (!isTopViewer && (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF))) {
            return forbiddenResponse();
        }
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get("roomId") ?? "";
        const date = searchParams.get("date") ?? "";
        if (!roomId || !isValidCalendarDate(date)) {
            return forbiddenResponse();
        }
        if (!isTopViewer) {
            const reviewerId = session.employeeId;
            if (!reviewerId) return forbiddenResponse();
            const review = await prisma.cleaningMonthlyApproval.findFirst({
                where: {
                    roomId,
                    monthWib: date.slice(0, 7),
                    OR: [{ inspectedByEmployeeId: reviewerId }, { knownByEmployeeId: reviewerId }],
                },
                select: { id: true },
            });
            if (!review) return forbiddenResponse();
        }
    }

    try {
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get("roomId");
        const date = searchParams.get("date");

        if (!roomId) {
            return NextResponse.json({ error: "Parameter roomId wajib diisi." }, { status: 400 });
        }
        if (!date || !isValidCalendarDate(date)) {
            return NextResponse.json({ error: "Parameter date wajib diisi (YYYY-MM-DD)." }, { status: 400 });
        }

        const detail = await getChecklistDetail(session, roomId, date);
        return NextResponse.json({ success: true, data: detail });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningChecklistsGET", err);
    }
}

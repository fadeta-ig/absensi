import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002 } from "@/lib/services/cleaningService";
import { toWIBDateString } from "@/lib/timezone";
import { IT_TEST_EMAIL, runDailyRecap } from "@/lib/services/recapEmailService";

/**
 * POST /api/ga/recap/test-email
 *
 * Kirim pratinjau rekap harian — HANYA ke email IT
 * (it.wijayainovasigemilang@gmail.com). TIDAK PERNAH ke email employee asli.
 * Guard: WIG002 saja.
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const body = (await request.json().catch(() => ({}))) as { date?: string };
        const wibDate =
            typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
                ? body.date
                : toWIBDateString(new Date());
        const result = await runDailyRecap(wibDate, { toOverride: [IT_TEST_EMAIL] });
        return NextResponse.json({ success: true, data: { ...result, to: [IT_TEST_EMAIL] } });
    } catch (err) {
        return serverErrorResponse("GaRecapTestEmailPOST", err);
    }
}

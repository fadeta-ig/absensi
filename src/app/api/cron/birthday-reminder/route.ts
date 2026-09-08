import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { runBirthdayReminderCheck } from "@/lib/services/birthdayService";
import logger from "@/lib/logger";

/**
 * POST /api/cron/birthday-reminder
 *
 * Triggered automatically by scheduler / cron service every day at 08:00 WIB
 * or triggered manually by HR Admin.
 *
 * Security: protected by CRON_SECRET bearer token OR HR session authentication.
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        let isAuthorized = false;

        if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
            isAuthorized = true;
        } else {
            const session = await requireAuth();
            if (session && canManageHr(session)) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            logger.warn("[Cron] Unauthorized birthday-reminder attempt");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const result = await runBirthdayReminderCheck();

        return NextResponse.json({
            success: result.success,
            data: result,
        });
    } catch (error) {
        logger.error("[Cron] Birthday reminder error", { error });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

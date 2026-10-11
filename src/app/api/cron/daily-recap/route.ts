import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { toWIBDateString } from "@/lib/timezone";
import { runDailyRecap } from "@/lib/services/recapEmailService";

/**
 * POST /api/cron/daily-recap
 *
 * Dijadwalkan VPS crontab SETIAP HARI jam 23:59 WIB.
 * Mengirim rekap harian gabungan (alat + kebersihan, tanpa foto) ke
 * Top Reviewer SAJA (union equipment.topViewers + cleaning.topViewers).
 * Exactly-once per tanggal WIB via daily_recap_email_logs.
 *
 * Security: protected by CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error("Daily recap cron blocked: CRON_SECRET not configured");
        return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        logger.warn("Unauthorized daily-recap cron attempt", {
            userAgent: request.headers.get("user-agent") ?? "unknown",
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const wibDate = toWIBDateString(new Date());
        const result = await runDailyRecap(wibDate);
        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        logger.error("Daily recap cron gagal", { err });
        return NextResponse.json({ error: "Gagal mengirim rekap harian." }, { status: 500 });
    }
}

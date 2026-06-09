import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";

/**
 * Endpoint for cron job to reset usedLeave to 0 every year (e.g., January 1st).
 * Must be called with a valid CRON_SECRET authorization header.
 */
export async function GET(req: Request) {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error("[Cron] CRON_SECRET not configured.");
        return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        logger.warn("[Cron] Unauthorized reset-leave attempt.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await prisma.employee.updateMany({
            where: { isActive: true },
            data: { usedLeave: 0 },
        });

        logger.info("[Cron] Successfully reset leave balance for active employees", { updatedCount: result.count });
        
        // Audit log for this automated action
        await prisma.auditLog.create({
            data: {
                action: "RESET_LEAVE_BALANCE",
                entity: "Employee",
                performedBy: "SYSTEM_CRON",
                details: JSON.stringify({ updatedCount: result.count }),
            }
        });

        return NextResponse.json({
            success: true,
            message: "Leave balances reset successfully",
            updatedCount: result.count,
        });
    } catch (error) {
        logger.error("[Cron] Failed to reset leave balances", { error });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

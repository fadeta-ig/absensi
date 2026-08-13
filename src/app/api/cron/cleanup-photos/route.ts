import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
    // Basic CRON authorization (Vercel standard)
    const authHeader = request.headers.get("Authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error("Cron cleanup photos blocked: CRON_SECRET not configured");
        return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        logger.warn("Unauthorized cleanup-photos cron attempt", {
            userAgent: request.headers.get("user-agent") ?? "unknown",
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Hapus foto yang usianya lebih dari 90 hari
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 90);

        const result = await prisma.attendanceRecord.updateMany({
            where: {
                date: { lt: cutoffDate },
                OR: [
                    { clockInPhoto: { not: null } },
                    { clockOutPhoto: { not: null } }
                ]
            },
            data: {
                clockInPhoto: null,
                clockOutPhoto: null,
            }
        });

        logger.info("Cron: Cleanup Attendance Photos sukses", { 
            clearedRecords: result.count,
            cutoffDate: cutoffDate.toISOString() 
        });

        return NextResponse.json({
            success: true,
            clearedRecords: result.count,
            message: "Foto absensi lama berhasil dibersihkan untuk menghemat kapasitas database."
        });
    } catch (error) {
        logger.error("Cron: Gagal membersihkan foto absensi", { error });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

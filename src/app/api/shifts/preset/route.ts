import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { seed3Shifts } from "@/../prisma/seed3Shifts";
import { getShifts } from "@/lib/services/shiftService";
import logger from "@/lib/logger";

export async function POST() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const results = await seed3Shifts();
        const allShifts = await getShifts();

        logger.info("3-Shift package initialized via API", {
            initiatedBy: session.username,
            results,
        });

        return NextResponse.json({
            success: true,
            message: "Paket 3-Shift 24 Jam berhasil diinisialisasi.",
            results,
            shifts: allShifts,
        });
    } catch (err) {
        return serverErrorResponse("ShiftsPresetPOST", err);
    }
}

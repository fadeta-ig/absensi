import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { initialize3ShiftPreset } from "@/lib/services/shiftService";
import { PERMISSIONS } from "@/lib/permissions";
import logger from "@/lib/logger";

export async function POST() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const { results, shifts } = await initialize3ShiftPreset();

        logger.info("3-Shift package initialized via API", {
            initiatedBy: session.username,
            results,
        });

        return NextResponse.json({
            success: true,
            message: "Paket 3-Shift 24 Jam berhasil diinisialisasi.",
            results,
            shifts,
        });
    } catch (err) {
        return serverErrorResponse("ShiftsPresetPOST", err);
    }
}

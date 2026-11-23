import { NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toWIBDateString } from "@/lib/timezone";
import { getEmployeeEquipmentCapabilities } from "@/lib/services/equipmentService";

/**
 * GET /api/outsource/capabilities
 * Kapabilitas ringan untuk portal /outsource/* (menentukan menu & kartu beranda E-Checklist aktif).
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.OUTSOURCE_PORTAL)) {
        return forbiddenResponse();
    }

    try {
        const wibToday = toWIBDateString();
        const canExecuteCleaning = session.permissions.includes(PERMISSIONS.CLEANING_EXECUTE);
        const canOverviewCleaning = session.permissions.includes(PERMISSIONS.CLEANING_OVERVIEW);

        const [cleaningRoomsCount, eqCaps] = await Promise.all([
            canExecuteCleaning
                ? prisma.cleaningWorkerAssignment.count({
                      where: {
                          userId: session.userId,
                          startsOnWibDate: { lte: wibToday },
                          OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: wibToday } }],
                          room: { isActive: true },
                      },
                  })
                : Promise.resolve(0),
            getEmployeeEquipmentCapabilities(session),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                canExecuteCleaning,
                cleaningRoomsCount,
                canOverviewCleaning,
                canExecuteEquipment:
                    session.permissions.includes(PERMISSIONS.EQUIPMENT_EXECUTE) && eqCaps.canExecute,
                hasEquipmentExecutePerm: session.permissions.includes(PERMISSIONS.EQUIPMENT_EXECUTE),
                canQcEquipment:
                    session.permissions.includes(PERMISSIONS.EQUIPMENT_QC) && eqCaps.canReview,
                hasEquipmentQcPerm: session.permissions.includes(PERMISSIONS.EQUIPMENT_QC),
                canApproveEquipment:
                    session.permissions.includes(PERMISSIONS.EQUIPMENT_APPROVE) && eqCaps.canApprove,
                hasEquipmentApprovePerm: session.permissions.includes(PERMISSIONS.EQUIPMENT_APPROVE),
                canOverviewEquipment:
                    session.permissions.includes(PERMISSIONS.EQUIPMENT_OVERVIEW) && eqCaps.canTopView,
                executeCompanies: eqCaps.executeCompanies,
                qcCompanies: eqCaps.reviewCompanies,
                approveCompanies: eqCaps.approveCompanies,
            },
        });
    } catch (err) {
        return serverErrorResponse("OutsourceCapabilitiesGET", err);
    }
}

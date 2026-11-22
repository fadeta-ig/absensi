import { NextRequest, NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/middleware/apiGuard";
import { requireEquipmentSettingsAuth } from "@/lib/middleware/equipmentGuard";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";
import { listEligibleOutsourceUsersForPermission } from "@/lib/services/outsourceUserService";
import type { EquipmentSettingsScope } from "@/lib/services/equipmentAuth";

const ROLE_CONFIG: Record<string, { permission: PermissionCode; scopes: EquipmentSettingsScope[] }> = {
    operator: { permission: PERMISSIONS.EQUIPMENT_EXECUTE, scopes: ["assignments"] },
    qc: { permission: PERMISSIONS.EQUIPMENT_QC, scopes: ["assignments"] },
    approver: { permission: PERMISSIONS.EQUIPMENT_APPROVE, scopes: ["atasan"] },
};

/**
 * GET /api/ga/equipment/eligible-outsource?role=operator|qc|approver&q=
 * Daftar akun OS aktif yang SUDAH diberi izin RBAC modul terkait oleh WIG002.
 * Dapat dibaca oleh WIG002 maupun PIC Delegasi Equipment pada scope terkait.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const roleKey = (searchParams.get("role") ?? "").trim().toLowerCase();
    const cfg = ROLE_CONFIG[roleKey];
    if (!cfg) {
        return NextResponse.json(
            { error: "Parameter role wajib salah satu dari: operator, qc, approver." },
            { status: 400 }
        );
    }

    const auth = await requireEquipmentSettingsAuth(cfg.scopes);
    if (auth.error) return auth.error;

    try {
        const q = searchParams.get("q") ?? undefined;
        const data = await listEligibleOutsourceUsersForPermission(cfg.permission, q);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        return serverErrorResponse("GaEquipmentEligibleOutsourceGET", err);
    }
}

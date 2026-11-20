import type { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/auth";
import { forbiddenResponse, requireAuth, unauthorizedResponse } from "@/lib/middleware/apiGuard";
import { hasEmployeePortalAccess, isEquipmentMasterAdmin } from "@/lib/services/equipmentAuth";

export type EquipmentAuthGuardResult =
    | { session: SessionPayload; error?: never }
    | { session?: never; error: NextResponse };

/**
 * Guard standar route API GA Equipment khusus admin master (`WIG002` + `ga.manage`).
 * Sengaja tidak mensyaratkan `session.employeeId` karena akun GA admin belum tentu punya record `Employee`.
 */
export async function requireGaEquipmentAdminAuth(): Promise<EquipmentAuthGuardResult> {
    const session = await requireAuth();
    if (!session) return { error: unauthorizedResponse() };
    if (!isEquipmentMasterAdmin(session)) return { error: forbiddenResponse() };
    return { session };
}

/**
 * Guard standar route API Employee Equipment:
 * memastikan sesi aktif di DB, memiliki `employeeId`, dan memegang permission `employee.self`.
 */
export async function requireEmployeeEquipmentAuth(): Promise<EquipmentAuthGuardResult> {
    const session = await requireAuth();
    if (!session) return { error: unauthorizedResponse() };
    if (!hasEmployeePortalAccess(session)) return { error: forbiddenResponse() };
    return { session };
}

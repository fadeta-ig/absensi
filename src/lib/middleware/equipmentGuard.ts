import type { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/auth";
import { forbiddenResponse, requireAuth, unauthorizedResponse } from "@/lib/middleware/apiGuard";
import {
    hasEmployeePortalAccess,
    isEquipmentMasterAdmin,
    type EquipmentSettingsScope,
} from "@/lib/services/equipmentAuth";
import { hasAnyEquipmentSettingsScope } from "@/lib/services/equipmentService";

export type EquipmentAuthGuardResult =
    | { session: SessionPayload; error?: never }
    | { session?: never; error: NextResponse };

/**
 * Guard standar route API GA Equipment khusus admin master (`WIG002` + `ga.manage`).
 * Dipakai untuk meta-governance (pengelolaan daftar PIC delegasi).
 * Sengaja tidak mensyaratkan `session.employeeId` karena akun GA admin belum tentu punya record `Employee`.
 */
export async function requireGaEquipmentAdminAuth(): Promise<EquipmentAuthGuardResult> {
    const session = await requireAuth();
    if (!session) return { error: unauthorizedResponse() };
    if (!isEquipmentMasterAdmin(session)) return { error: forbiddenResponse() };
    return { session };
}

/**
 * Guard route pengaturan Equipment berbasis scope:
 * meloloskan `WIG002` (`ga.manage`) ATAU karyawan PIC delegasi aktif (`employee.self`)
 * yang memegang minimal satu scope di `requiredAnyOf`.
 */
export async function requireEquipmentSettingsAuth(
    requiredAnyOf: EquipmentSettingsScope | readonly EquipmentSettingsScope[]
): Promise<EquipmentAuthGuardResult> {
    const session = await requireAuth();
    if (!session) return { error: unauthorizedResponse() };
    if (!(await hasAnyEquipmentSettingsScope(session, requiredAnyOf))) {
        return { error: forbiddenResponse() };
    }
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

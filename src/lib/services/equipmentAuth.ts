import type { SessionPayload } from "@/lib/auth";
import { PERMISSIONS, type PermissionCode } from "@/lib/permissions";

/**
 * Area pengaturan Equipment yang dapat didelegasikan oleh WIG002 ke karyawan PIC.
 * Pengelolaan daftar PIC delegasi itu sendiri sengaja TIDAK termasuk scope — selalu WIG002-only
 * untuk mencegah eskalasi / delegasi transitif.
 */
export const EQUIPMENT_SETTINGS_SCOPES = ["templates", "units", "products", "assignments", "atasan"] as const;
export type EquipmentSettingsScope = (typeof EQUIPMENT_SETTINGS_SCOPES)[number];

/** Preset default saat WIG002 menambah PIC baru: tab operasional saja, tab Atasan opt-in eksplisit (SoD). */
export const EQUIPMENT_SETTINGS_DEFAULT_DELEGATE_SCOPES: readonly EquipmentSettingsScope[] = [
    "templates",
    "units",
    "products",
    "assignments",
];

export const EQUIPMENT_SETTINGS_DELEGATES_KEY = "equipment.settingsDelegates" as const;
export const EQUIPMENT_SETTINGS_DELEGATES_MAX = 10;

/** Prefix token penyimpanan untuk akun OS di AppSetting roster (`equipment.qcMembers.*` & `equipment.approvers.*`). */
export const OS_ACTOR_TOKEN_PREFIX = "user:" as const;

export const EQUIPMENT_OS_PERMISSIONS: readonly PermissionCode[] = [
    PERMISSIONS.EQUIPMENT_EXECUTE,
    PERMISSIONS.EQUIPMENT_QC,
    PERMISSIONS.EQUIPMENT_APPROVE,
    PERMISSIONS.EQUIPMENT_OVERVIEW,
];

export function isOsActorToken(token: string): boolean {
    return token.startsWith(OS_ACTOR_TOKEN_PREFIX) && token.length > OS_ACTOR_TOKEN_PREFIX.length;
}

export function extractOsUserIdFromToken(token: string): string | null {
    return isOsActorToken(token) ? token.slice(OS_ACTOR_TOKEN_PREFIX.length) : null;
}

export function toOsActorToken(userId: string): string {
    return `${OS_ACTOR_TOKEN_PREFIX}${userId}`;
}

export function isEquipmentSettingsScope(value: unknown): value is EquipmentSettingsScope {
    return typeof value === "string" && (EQUIPMENT_SETTINGS_SCOPES as readonly string[]).includes(value);
}

/**
 * Single source of truth otorisasi admin master modul Equipment (WIG002 + ga.manage).
 * Dipisahkan dari `cleaningService` / `appointmentService` agar modul Equipment berdiri sendiri
 * dan mudah dimigrasikan ke permission RBAC terdedikasi bila suatu hari dibutuhkan multi-admin.
 */
export function isEquipmentMasterAdmin(session: Pick<SessionPayload, "username" | "permissions">): boolean {
    return session.username === "WIG002" && session.permissions.includes(PERMISSIONS.GA_MANAGE);
}

/**
 * Single source of truth otorisasi dasar Portal Karyawan untuk modul Equipment:
 * akun wajib terhubung dengan `Employee` dan memiliki permission `employee.self`.
 * Selaras dengan Edge guard di `src/proxy.ts` dan `src/app/employee/layout.tsx`.
 */
export function hasEmployeePortalAccess(session: Pick<SessionPayload, "employeeId" | "permissions">): boolean {
    return Boolean(session.employeeId) && session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF);
}

/**
 * Otorisasi portal operasional Equipment untuk karyawan internal (`employee.self`)
 * ATAU akun Outsource (`outsource.portal`) yang memegang izin modul Equipment terkait.
 */
export function hasEquipmentPortalAccess(
    session: Pick<SessionPayload, "employeeId" | "permissions">,
    requiredOsPerm?: PermissionCode | readonly PermissionCode[]
): boolean {
    if (hasEmployeePortalAccess(session)) return true;
    if (!session.permissions.includes(PERMISSIONS.OUTSOURCE_PORTAL)) return false;
    if (!requiredOsPerm) {
        return EQUIPMENT_OS_PERMISSIONS.some((p) => session.permissions.includes(p));
    }
    const needed = typeof requiredOsPerm === "string" ? [requiredOsPerm] : requiredOsPerm;
    return needed.some((p) => session.permissions.includes(p));
}

/** Normalisasi nama entitas master Equipment untuk indeks unik (`trim`, collapse spasi, lowercase). */
export function normalizeEquipmentName(raw: string): string {
    return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

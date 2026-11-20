import type { SessionPayload } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

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

/** Normalisasi nama entitas master Equipment untuk indeks unik (`trim`, collapse spasi, lowercase). */
export function normalizeEquipmentName(raw: string): string {
    return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

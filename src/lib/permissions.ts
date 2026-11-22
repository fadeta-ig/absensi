export const SYSTEM_ROLES = {
    SUPER_ADMIN: "SUPER_ADMIN",
    HR_ADMIN: "HR_ADMIN",
    GA_ADMIN: "GA_ADMIN",
    EMPLOYEE_USER: "EMPLOYEE_USER",
    CLEANING_WORKER: "CLEANING_WORKER",
    OUTSOURCE_USER: "OUTSOURCE_USER",
    CLEANING_VIEWER: "CLEANING_VIEWER",
    EQUIPMENT_OPERATOR: "EQUIPMENT_OPERATOR",
    EQUIPMENT_QC: "EQUIPMENT_QC",
    EQUIPMENT_APPROVER: "EQUIPMENT_APPROVER",
    EQUIPMENT_VIEWER: "EQUIPMENT_VIEWER",
} as const;

export type SystemRole = typeof SYSTEM_ROLES[keyof typeof SYSTEM_ROLES];

export const PERMISSIONS = {
    USER_MANAGE: "user.manage",
    HR_MANAGE: "hr.manage",
    GA_MANAGE: "ga.manage",
    EMPLOYEE_SELF: "employee.self",
    ASSET_READ: "asset.read",
    CLEANING_EXECUTE: "cleaning.execute",
    CLEANING_OVERVIEW: "cleaning.overview",
    OUTSOURCE_PORTAL: "outsource.portal",
    EQUIPMENT_EXECUTE: "equipment.execute",
    EQUIPMENT_QC: "equipment.qc",
    EQUIPMENT_APPROVE: "equipment.approve",
    EQUIPMENT_OVERVIEW: "equipment.overview",
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const OUTSOURCE_MODULE_KEYS = [
    "cleaning_execute",
    "cleaning_overview",
    "equipment_execute",
    "equipment_qc",
    "equipment_approve",
    "equipment_overview",
] as const;

export type OutsourceModuleKey = (typeof OUTSOURCE_MODULE_KEYS)[number];

export interface OutsourceModuleDefinition {
    key: OutsourceModuleKey;
    group: "cleaning" | "equipment";
    roleCode: SystemRole;
    permissionCode: PermissionCode;
    label: string;
    shortLabel: string;
    description: string;
}

export const OUTSOURCE_MODULE_DEFINITIONS: readonly OutsourceModuleDefinition[] = [
    {
        key: "cleaning_execute",
        group: "cleaning",
        roleCode: SYSTEM_ROLES.CLEANING_WORKER,
        permissionCode: PERMISSIONS.CLEANING_EXECUTE,
        label: "Eksekusi Kebersihan",
        shortLabel: "Cleaning",
        description: "Mengisi checklist kebersihan harian dan unggah foto bukti untuk ruangan yang ditugaskan.",
    },
    {
        key: "cleaning_overview",
        group: "cleaning",
        roleCode: SYSTEM_ROLES.CLEANING_VIEWER,
        permissionCode: PERMISSIONS.CLEANING_OVERVIEW,
        label: "Pantau Rekap Kebersihan",
        shortLabel: "Rekap Cleaning",
        description: "Melihat pantauan bulanan, detail checklist, status paraf, dan foto bukti kebersihan (read-only).",
    },
    {
        key: "equipment_execute",
        group: "equipment",
        roleCode: SYSTEM_ROLES.EQUIPMENT_OPERATOR,
        permissionCode: PERMISSIONS.EQUIPMENT_EXECUTE,
        label: "Eksekusi Inspeksi Alat",
        shortLabel: "Operator Alat",
        description: "Memulai, mengisi item, unggah foto bukti, dan submit inspeksi alat pada unit yang ditugaskan.",
    },
    {
        key: "equipment_qc",
        group: "equipment",
        roleCode: SYSTEM_ROLES.EQUIPMENT_QC,
        permissionCode: PERMISSIONS.EQUIPMENT_QC,
        label: "QC Inspeksi Alat",
        shortLabel: "QC Alat",
        description: "Masuk daftar kandidat Anggota QC (WIG/MKI) dan memproses antrean pemeriksaan QC (SUBMITTED → DONE).",
    },
    {
        key: "equipment_approve",
        group: "equipment",
        roleCode: SYSTEM_ROLES.EQUIPMENT_APPROVER,
        permissionCode: PERMISSIONS.EQUIPMENT_APPROVE,
        label: "Approver Final Alat",
        shortLabel: "Approver Alat",
        description: "Masuk daftar kandidat Approver Final (WIG/MKI) dan menyetujui inspeksi alat (DONE → APPROVED).",
    },
    {
        key: "equipment_overview",
        group: "equipment",
        roleCode: SYSTEM_ROLES.EQUIPMENT_VIEWER,
        permissionCode: PERMISSIONS.EQUIPMENT_OVERVIEW,
        label: "Pantau Rekap Alat",
        shortLabel: "Rekap Alat",
        description: "Melihat rekap lintas unit, detail inspeksi, dan foto bukti peralatan (read-only).",
    },
] as const;

export const OUTSOURCE_MODULE_ROLE_CODES: readonly SystemRole[] = OUTSOURCE_MODULE_DEFINITIONS.map((m) => m.roleCode);

export interface AccessPrincipal {
    roles: string[];
    permissions: string[];
    employeeId?: string | null;
}

export function hasRole(principal: AccessPrincipal, role: SystemRole): boolean {
    return principal.roles.includes(role);
}

export function hasPermission(principal: AccessPrincipal, permission: PermissionCode): boolean {
    return principal.permissions.includes(permission);
}

export function isSuperAdmin(principal: AccessPrincipal): boolean {
    return hasRole(principal, SYSTEM_ROLES.SUPER_ADMIN);
}

export function canManageUsers(principal: AccessPrincipal): boolean {
    return hasPermission(principal, PERMISSIONS.USER_MANAGE);
}

export function canManageHr(principal: AccessPrincipal): boolean {
    return hasPermission(principal, PERMISSIONS.HR_MANAGE);
}

export function canManageGa(principal: AccessPrincipal): boolean {
    return hasPermission(principal, PERMISSIONS.GA_MANAGE);
}

export function canUseEmployeePortal(principal: AccessPrincipal): boolean {
    return Boolean(principal.employeeId) && hasPermission(principal, PERMISSIONS.EMPLOYEE_SELF);
}

export function canUseOutsourcePortal(principal: AccessPrincipal): boolean {
    return hasPermission(principal, PERMISSIONS.OUTSOURCE_PORTAL);
}

export function isOutsourcePrincipal(principal: AccessPrincipal): boolean {
    return hasRole(principal, SYSTEM_ROLES.OUTSOURCE_USER) || hasPermission(principal, PERMISSIONS.OUTSOURCE_PORTAL);
}

export function canReadAssets(principal: AccessPrincipal): boolean {
    return hasPermission(principal, PERMISSIONS.ASSET_READ);
}

export function canExecuteCleaning(principal: AccessPrincipal): boolean {
    return hasPermission(principal, PERMISSIONS.CLEANING_EXECUTE);
}

export function getPrimaryRole(roles: string[]): SystemRole {
    if (roles.includes(SYSTEM_ROLES.SUPER_ADMIN)) return SYSTEM_ROLES.SUPER_ADMIN;
    if (roles.includes(SYSTEM_ROLES.HR_ADMIN)) return SYSTEM_ROLES.HR_ADMIN;
    if (roles.includes(SYSTEM_ROLES.GA_ADMIN)) return SYSTEM_ROLES.GA_ADMIN;
    if (roles.includes(SYSTEM_ROLES.OUTSOURCE_USER)) return SYSTEM_ROLES.OUTSOURCE_USER;
    if (roles.includes(SYSTEM_ROLES.CLEANING_WORKER)) return SYSTEM_ROLES.CLEANING_WORKER;
    if (roles.includes(SYSTEM_ROLES.EQUIPMENT_OPERATOR)) return SYSTEM_ROLES.EQUIPMENT_OPERATOR;
    if (roles.includes(SYSTEM_ROLES.EQUIPMENT_QC)) return SYSTEM_ROLES.EQUIPMENT_QC;
    if (roles.includes(SYSTEM_ROLES.EQUIPMENT_APPROVER)) return SYSTEM_ROLES.EQUIPMENT_APPROVER;
    if (roles.includes(SYSTEM_ROLES.CLEANING_VIEWER)) return SYSTEM_ROLES.CLEANING_VIEWER;
    if (roles.includes(SYSTEM_ROLES.EQUIPMENT_VIEWER)) return SYSTEM_ROLES.EQUIPMENT_VIEWER;
    return SYSTEM_ROLES.EMPLOYEE_USER;
}

export function getLandingPath(principal: AccessPrincipal): string {
    if (canManageHr(principal)) return "/dashboard";
    if (canManageGa(principal)) return "/ga";
    if (canUseOutsourcePortal(principal)) return "/outsource";
    if (canExecuteCleaning(principal)) return "/cleaning";
    if (canUseEmployeePortal(principal)) return "/employee";
    return "/";
}

export const SYSTEM_ROLES = {
    SUPER_ADMIN: "SUPER_ADMIN",
    HR_ADMIN: "HR_ADMIN",
    GA_ADMIN: "GA_ADMIN",
    EMPLOYEE_USER: "EMPLOYEE_USER",
    CLEANING_WORKER: "CLEANING_WORKER",
} as const;

export type SystemRole = typeof SYSTEM_ROLES[keyof typeof SYSTEM_ROLES];

export const PERMISSIONS = {
    USER_MANAGE: "user.manage",
    HR_MANAGE: "hr.manage",
    GA_MANAGE: "ga.manage",
    EMPLOYEE_SELF: "employee.self",
    ASSET_READ: "asset.read",
    CLEANING_EXECUTE: "cleaning.execute",
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

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
    if (roles.includes(SYSTEM_ROLES.CLEANING_WORKER)) return SYSTEM_ROLES.CLEANING_WORKER;
    return SYSTEM_ROLES.EMPLOYEE_USER;
}

export function getLandingPath(principal: AccessPrincipal): string {
    if (canManageHr(principal)) return "/dashboard";
    if (canManageGa(principal)) return "/ga";
    if (canExecuteCleaning(principal)) return "/cleaning";
    if (canUseEmployeePortal(principal)) return "/employee";
    return "/";
}

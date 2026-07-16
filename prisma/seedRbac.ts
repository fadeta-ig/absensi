import type { PrismaClient } from "@prisma/client";

export const RBAC_DEFINITIONS = {
    permissions: [
        ["user.manage", "Kelola User"],
        ["hr.manage", "Kelola HR"],
        ["ga.manage", "Kelola GA"],
        ["employee.self", "Portal Karyawan"],
        ["asset.read", "Baca Aset"],
    ] as const,
    roles: [
        ["SUPER_ADMIN", "Super Admin HR", ["user.manage", "hr.manage", "ga.manage", "employee.self", "asset.read"]],
        ["HR_ADMIN", "Admin HR", ["hr.manage", "employee.self", "asset.read"]],
        ["GA_ADMIN", "Admin GA", ["ga.manage", "employee.self", "asset.read"]],
        ["EMPLOYEE_USER", "Karyawan", ["employee.self"]],
    ] as const,
};

export async function ensureRbac(prisma: PrismaClient) {
    for (const [code, name] of RBAC_DEFINITIONS.permissions) {
        await prisma.permission.upsert({ where: { code }, update: { name }, create: { code, name } });
    }

    for (const [code, name, permissionCodes] of RBAC_DEFINITIONS.roles) {
        const role = await prisma.role.upsert({ where: { code }, update: { name }, create: { code, name } });
        for (const permissionCode of permissionCodes) {
            const permission = await prisma.permission.findUniqueOrThrow({ where: { code: permissionCode } });
            await prisma.rolePermission.upsert({
                where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
                update: {},
                create: { roleId: role.id, permissionId: permission.id },
            });
        }
    }
}

export async function assignOnlyRole(prisma: PrismaClient, userId: string, roleCode: string) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.$transaction([
        prisma.userRoleAssignment.deleteMany({ where: { userId } }),
        prisma.userRoleAssignment.create({ data: { userId, roleId: role.id } }),
    ]);
}

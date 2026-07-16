import { prisma } from "@/lib/prisma";
import { SYSTEM_ROLES } from "@/lib/permissions";

export const MANAGEABLE_ADMIN_ROLES = [SYSTEM_ROLES.HR_ADMIN, SYSTEM_ROLES.GA_ADMIN] as const;
export type ManageableAdminRole = typeof MANAGEABLE_ADMIN_ROLES[number];

export class UserManagementError extends Error {
    constructor(message: string, public readonly status = 400) {
        super(message);
        this.name = "UserManagementError";
    }
}

const userListInclude = {
    employee: {
        select: {
            id: true,
            employeeId: true,
            name: true,
            isActive: true,
            departmentRel: { select: { name: true } },
            positionRel: { select: { name: true } },
        },
    },
    roles: { select: { role: { select: { code: true, name: true } }, assignedAt: true } },
    creator: { select: { username: true, displayName: true } },
} as const;

export async function listAdministrativeUsers() {
    return prisma.userAccount.findMany({
        where: {
            roles: {
                some: {
                    role: {
                        code: { in: [SYSTEM_ROLES.SUPER_ADMIN, ...MANAGEABLE_ADMIN_ROLES] },
                    },
                },
            },
        },
        include: userListInclude,
        orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    });
}

export async function listEligibleAdminEmployees() {
    return prisma.employee.findMany({
        where: {
            isActive: true,
            userAccount: {
                is: {
                    roles: {
                        none: {
                            role: {
                                code: { in: [SYSTEM_ROLES.SUPER_ADMIN, ...MANAGEABLE_ADMIN_ROLES] },
                            },
                        },
                    },
                },
            },
        },
        select: {
            employeeId: true,
            name: true,
            email: true,
            departmentRel: { select: { name: true } },
            positionRel: { select: { name: true } },
        },
        orderBy: { name: "asc" },
    });
}

function assertManageableRole(roleCode: string): asserts roleCode is ManageableAdminRole {
    if (!(MANAGEABLE_ADMIN_ROLES as readonly string[]).includes(roleCode)) {
        throw new UserManagementError("Role admin hanya dapat diatur sebagai Admin HR atau Admin GA.");
    }
}

export type CreateAdminUserInput = {
    username: string;
    displayName: string;
    email: string;
    passwordHash: string;
    roleCode: ManageableAdminRole;
    employeeId?: string | null;
    actorUserId: string;
};

export async function createAdminUser(input: CreateAdminUserInput) {
    assertManageableRole(input.roleCode);

    return prisma.$transaction(async (tx) => {
        const role = await tx.role.findUnique({ where: { code: input.roleCode }, select: { id: true } });
        if (!role) throw new UserManagementError("Konfigurasi role tidak ditemukan.", 500);

        if (input.employeeId) {
            const employee = await tx.employee.findUnique({
                where: { employeeId: input.employeeId },
                select: {
                    employeeId: true,
                    name: true,
                    email: true,
                    isActive: true,
                    userAccount: { select: { id: true } },
                },
            });
            if (!employee?.isActive) {
                throw new UserManagementError("Karyawan tidak ditemukan atau tidak aktif.", 404);
            }
            if (!employee.userAccount) {
                throw new UserManagementError("Akun login karyawan belum tersedia. Perbaiki data akun sebelum memberikan akses admin.", 409);
            }

            const alreadyAdmin = await tx.userRoleAssignment.findFirst({
                where: {
                    userId: employee.userAccount.id,
                    role: { code: { in: [SYSTEM_ROLES.SUPER_ADMIN, ...MANAGEABLE_ADMIN_ROLES] } },
                },
            });
            if (alreadyAdmin) throw new UserManagementError("Karyawan tersebut sudah memiliki akses admin.", 409);

            await tx.userRoleAssignment.deleteMany({ where: { userId: employee.userAccount.id } });
            await tx.userRoleAssignment.create({
                data: {
                    userId: employee.userAccount.id,
                    roleId: role.id,
                    assignedByUserId: input.actorUserId,
                },
            });
            return tx.userAccount.update({
                where: { id: employee.userAccount.id },
                data: { isActive: true, sessionVersion: { increment: 1 } },
                include: userListInclude,
            });
        }

        return tx.userAccount.create({
            data: {
                username: input.username.trim(),
                displayName: input.displayName.trim(),
                email: input.email.trim().toLowerCase(),
                passwordHash: input.passwordHash,
                createdByUserId: input.actorUserId,
                roles: {
                    create: { roleId: role.id, assignedByUserId: input.actorUserId },
                },
            },
            include: userListInclude,
        });
    });
}

export type UpdateAdminUserInput = {
    id: string;
    actorUserId: string;
    displayName?: string;
    email?: string;
    roleCode?: ManageableAdminRole;
    isActive?: boolean;
};

export async function updateAdminUser(input: UpdateAdminUserInput) {
    if (input.roleCode) assertManageableRole(input.roleCode);

    return prisma.$transaction(async (tx) => {
        const target = await tx.userAccount.findUnique({
            where: { id: input.id },
            include: { roles: { include: { role: true } } },
        });
        if (!target) throw new UserManagementError("User tidak ditemukan.", 404);

        const targetRoles = target.roles.map(({ role }) => role.code);
        const isSuperAdmin = targetRoles.includes(SYSTEM_ROLES.SUPER_ADMIN);
        if (isSuperAdmin && (input.roleCode || input.isActive === false)) {
            throw new UserManagementError("Role dan status super admin tidak dapat diubah dari menu ini.", 409);
        }
        if (target.id === input.actorUserId && input.isActive === false) {
            throw new UserManagementError("Anda tidak dapat menonaktifkan akun sendiri.", 409);
        }

        if (input.roleCode) {
            const role = await tx.role.findUnique({ where: { code: input.roleCode }, select: { id: true } });
            if (!role) throw new UserManagementError("Konfigurasi role tidak ditemukan.", 500);
            await tx.userRoleAssignment.deleteMany({ where: { userId: target.id } });
            await tx.userRoleAssignment.create({
                data: {
                    userId: target.id,
                    roleId: role.id,
                    assignedByUserId: input.actorUserId,
                },
            });
        }

        return tx.userAccount.update({
            where: { id: target.id },
            data: {
                ...(input.displayName !== undefined && { displayName: input.displayName.trim() }),
                ...(input.email !== undefined && { email: input.email.trim().toLowerCase() }),
                ...(input.isActive !== undefined && { isActive: input.isActive }),
                sessionVersion: { increment: 1 },
            },
            include: userListInclude,
        });
    });
}

export async function resetAdminUserPassword(id: string, actorUserId: string, passwordHash: string) {
    const target = await prisma.userAccount.findUnique({
        where: { id },
        select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            isActive: true,
            roles: { select: { role: { select: { code: true } } } },
        },
    });
    if (!target) throw new UserManagementError("User tidak ditemukan.", 404);
    const isAdmin = target.roles.some(({ role }) =>
        [SYSTEM_ROLES.SUPER_ADMIN, ...MANAGEABLE_ADMIN_ROLES].includes(role.code as typeof SYSTEM_ROLES.SUPER_ADMIN)
    );
    if (!isAdmin) throw new UserManagementError("Akun bukan user admin.", 400);
    if (!target.isActive) throw new UserManagementError("Aktifkan user sebelum mereset password.", 409);

    await prisma.userAccount.update({
        where: { id },
        data: {
            passwordHash,
            passwordChangedAt: new Date(),
            sessionVersion: { increment: 1 },
        },
    });

    return { ...target, resetBy: actorUserId };
}

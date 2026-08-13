import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import { canManageGa, canManageHr, type AccessPrincipal } from "@/lib/permissions";
import type { EmployeeCreatePayload, EmployeeUpdatePayload } from "@/lib/validations/validationSchemas";
import type { AuditActor } from "@/lib/services/auditService";
import { applyEmployeePrivateData, employeePrivateRelations } from "@/lib/services/employeePrivateService";
import { normalizeEmployeeId } from "@/lib/security/pii";

export const employeeRelations = {
    locations: { select: { id: true, name: true } },
    payrollComponents: { include: { component: true } },
    manager: { select: { id: true, employeeId: true, name: true, isActive: true } },
    subordinates: { select: { id: true, employeeId: true, name: true, isActive: true } },
    departmentRel: true,
    divisionRel: true,
    positionRel: true,
} satisfies Prisma.EmployeeInclude;

// Tipe relasi komprehensif dari Prisma langsung (Strict Type)
export type EmployeeWithRelations = Prisma.EmployeeGetPayload<{
    include: typeof employeeRelations;
}>;

const employeeDetailRelations = {
    ...employeeRelations,
    ...employeePrivateRelations,
} satisfies Prisma.EmployeeInclude;

export type EmployeePrivateDetail = Prisma.EmployeeGetPayload<{
    include: typeof employeeDetailRelations;
}>;

export async function getEmployees(): Promise<EmployeeWithRelations[]> {
    const rows = await prisma.employee.findMany({
        include: employeeRelations,
        orderBy: { name: "asc" }
    });
    return rows;
}

export type EmployeeStatusFilter = "active" | "inactive" | "all";

export async function getVisibleEmployees(
    requester: AccessPrincipal,
    status: EmployeeStatusFilter = "active"
): Promise<EmployeeWithRelations[]> {
    const employeeId = requester.employeeId;

    // HR may explicitly request inactive/all records for employee master data.
    if (canManageHr(requester)) {
        const rows = await prisma.employee.findMany({
            where: status === "all" ? undefined : { isActive: status === "active" },
            include: employeeRelations,
            orderBy: { name: "asc" },
        });
        return rows;
    }

    // GA operational selectors only receive active employees.
    if (canManageGa(requester)) {
        const rows = await prisma.employee.findMany({
            where: { isActive: true },
            include: employeeRelations,
            orderBy: { name: "asc" },
        });
        return rows;
    }

    // Normal employees see themselves and their entire downstream hierarchy (1 .. N)
    if (!employeeId) return [];
    const self = await prisma.employee.findUnique({
        where: { employeeId },
        include: employeeRelations,
    });

    if (!self) return [];
    
    // Breadth-First Search queue to collect all subordinates recursively
    // Mencegah Infinite Loop (Circular Hierarchy) menggunakan visitedIds set
    const visibleEmployees: EmployeeWithRelations[] = [self];
    const visitedIds = new Set<string>();
    visitedIds.add(employeeId);

    const queue = [employeeId];
    
    while(queue.length > 0) {
        const currentManagerId = queue.shift()!;
        const subs = await prisma.employee.findMany({
            where: { managerId: currentManagerId, isActive: true },
            include: employeeRelations,
            orderBy: { name: "asc" }
        });

        for (const sub of subs) {
            // Evaluasi Circular Reference
            if (!visitedIds.has(sub.employeeId)) {
                visitedIds.add(sub.employeeId);
                visibleEmployees.push(sub);
                queue.push(sub.employeeId);
            } else {
                logger.warn("Circular Hierarchy terdeteksi", { managerId: currentManagerId, subordinateId: sub.employeeId });
            }
        }
    }

    return visibleEmployees;
}

export async function getEmployeeById(id: string): Promise<EmployeeWithRelations | null> {
    const row = await prisma.employee.findUnique({ 
        where: { id },
        include: employeeRelations,
    });
    return row;
}

export async function getEmployeeByEmployeeId(employeeId: string): Promise<EmployeeWithRelations | null> {
    const row = await prisma.employee.findUnique({ 
        where: { employeeId },
        include: employeeRelations,
    });
    return row;
}

export async function getEmployeePrivateDetailById(id: string): Promise<EmployeePrivateDetail | null> {
    return prisma.employee.findUnique({
        where: { id },
        include: employeeDetailRelations,
    });
}

export type CreateEmployeeInput = EmployeeCreatePayload & {
    passwordHash: string;
    createdByUserId: string;
    isActive?: boolean;
};

export async function createEmployee(data: CreateEmployeeInput, actor: AuditActor): Promise<EmployeeWithRelations> {
    return prisma.$transaction(async (tx) => {
        const employeeRole = await tx.role.findUnique({ where: { code: "EMPLOYEE_USER" }, select: { id: true } });
        if (!employeeRole) throw new Error("Role EMPLOYEE_USER belum dikonfigurasi.");

        const employeeIdNormalized = normalizeEmployeeId(data.employeeId);
        const employeeIdentifiers = await tx.employee.findMany({ select: { employeeId: true, employeeIdNormalized: true } });
        const normalizedConflict = employeeIdentifiers.find((employee) =>
            employee.employeeId === data.employeeId
            || employee.employeeIdNormalized === employeeIdNormalized
            || normalizeEmployeeId(employee.employeeId) === employeeIdNormalized
        );
        if (normalizedConflict) {
            throw new Error(`NIP berkonflik dengan karyawan ${normalizedConflict.employeeId}.`);
        }
        const department = await tx.department.findUnique({ where: { id: data.departmentId }, select: { divisionId: true } });
        if (!department) throw new Error("Departemen tidak ditemukan.");
        const resolvedDivisionId = data.divisionId ?? department.divisionId;
        if (resolvedDivisionId !== department.divisionId) throw new Error("Departemen tidak berada pada divisi yang dipilih.");

        const row = await tx.employee.create({
            data: {
            employeeId: data.employeeId,
            employeeIdNormalized,
            name: data.name,
            academicTitle: data.academicTitle,
            preferredName: data.preferredName,
            email: data.email,
            phone: data.phone,
            alternatePhone: data.alternatePhone,
            gender: data.gender,
            employmentType: data.employmentType,
            departmentId: data.departmentId,
            divisionId: resolvedDivisionId,
            positionId: data.positionId,
            managerId: data.managerId || null,
            joinDate: data.joinDate ? new Date(data.joinDate + "T00:00:00.000Z") : new Date(),
            employmentStartDate: data.employmentStartDate ? new Date(`${data.employmentStartDate}T00:00:00.000Z`) : new Date(`${data.joinDate}T00:00:00.000Z`),
            employmentEndDate: data.employmentEndDate ? new Date(`${data.employmentEndDate}T00:00:00.000Z`) : null,
            probationEndDate: data.probationEndDate ? new Date(`${data.probationEndDate}T00:00:00.000Z`) : null,
            totalLeave: data.totalLeave,
            usedLeave: data.usedLeave,
            avatarUrl: data.avatarUrl,
            isActive: data.isActive,
            shiftId: data.shiftId,
            bypassLocation: data.bypassLocation || false,
            basicSalary: data.basicSalary || 0,

            locations: data.locations ? {
                connect: data.locations.map(l => ({ id: l.id }))
            } : undefined,

            payrollComponents: data.payrollComponents ? {
                create: data.payrollComponents.map((c) => ({
                    componentId: c.componentId,
                    amount: c.amount
                }))
            } : undefined,
            },
            include: employeeRelations,
        });

        await applyEmployeePrivateData(tx, row.employeeId, data, actor);

        await tx.userAccount.create({
            data: {
                username: data.employeeId,
                displayName: data.name,
                email: data.email,
                passwordHash: data.passwordHash,
                employeeId: data.employeeId,
                createdByUserId: data.createdByUserId,
                roles: {
                    create: {
                        roleId: employeeRole.id,
                        assignedByUserId: data.createdByUserId,
                    },
                },
            },
        });

        return row;
    });
}

export async function updateEmployee(
    id: string,
    data: Omit<EmployeeUpdatePayload, "id">,
    actor: AuditActor,
): Promise<EmployeeWithRelations | null> {
    try {
        const existingEmployee = await prisma.employee.findUnique({
            where: { id },
            select: { employeeId: true, employmentStartDate: true, employmentEndDate: true, departmentId: true, divisionId: true },
        });
        if (!existingEmployee) return null;

        const effectiveStart = data.employmentStartDate === undefined
            ? existingEmployee.employmentStartDate
            : data.employmentStartDate ? new Date(`${data.employmentStartDate}T00:00:00.000Z`) : null;
        const effectiveEnd = data.employmentEndDate === undefined
            ? existingEmployee.employmentEndDate
            : data.employmentEndDate ? new Date(`${data.employmentEndDate}T00:00:00.000Z`) : null;
        if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
            throw new Error("Tanggal selesai kerja tidak boleh sebelum tanggal mulai.");
        }

        let resolvedDivisionId = data.divisionId;
        if (data.departmentId !== undefined || data.divisionId !== undefined) {
            const departmentId = data.departmentId ?? existingEmployee.departmentId;
            const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { divisionId: true } });
            if (!department) throw new Error("Departemen tidak ditemukan.");
            resolvedDivisionId = data.divisionId === undefined
                ? (data.departmentId !== undefined ? department.divisionId : existingEmployee.divisionId)
                : data.divisionId;
            if (!resolvedDivisionId || resolvedDivisionId !== department.divisionId) throw new Error("Departemen tidak berada pada divisi yang dipilih.");
        }

        if (data.managerId !== undefined && data.managerId !== null) {
            // Prevent self-assignment
            if (data.managerId === existingEmployee.employeeId) {
                throw new Error("Karyawan tidak dapat menjadi atasan untuk dirinya sendiri.");
            }

            // DFS Cycle Detection
            let currentManagerId: string | null = data.managerId;
            const visited = new Set<string>();

            while (currentManagerId) {
                if (visited.has(currentManagerId)) {
                    throw new Error("Hierarki melingkar terdeteksi. Silakan periksa kembali struktur atasan.");
                }
                visited.add(currentManagerId);

                if (currentManagerId === existingEmployee.employeeId) {
                    throw new Error("Perubahan atasan ini akan menyebabkan hierarki melingkar (Circular Hierarchy).");
                }

                const managerRow: { managerId: string | null } | null = await prisma.employee.findUnique({
                    where: { employeeId: currentManagerId },
                    select: { managerId: true }
                });
                currentManagerId = managerRow?.managerId || null;
            }
        }

        const row = await prisma.$transaction(async (tx) => {
            const updated = await tx.employee.update({
                where: { id },
                data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.academicTitle !== undefined && { academicTitle: data.academicTitle }),
                ...(data.preferredName !== undefined && { preferredName: data.preferredName }),
                ...(data.email !== undefined && { email: data.email }),
                ...(data.phone !== undefined && { phone: data.phone }),
                ...(data.alternatePhone !== undefined && { alternatePhone: data.alternatePhone }),
                ...(data.gender !== undefined && { gender: data.gender }),
                ...(data.employmentType !== undefined && { employmentType: data.employmentType }),
                ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
                ...(resolvedDivisionId !== undefined && { divisionId: resolvedDivisionId }),
                ...(data.positionId !== undefined && { positionId: data.positionId }),
                ...(data.managerId !== undefined && { managerId: data.managerId || null }),
                ...(data.joinDate !== undefined && { joinDate: new Date(data.joinDate + "T00:00:00.000Z") }),
                ...(data.employmentStartDate !== undefined && { employmentStartDate: data.employmentStartDate ? new Date(`${data.employmentStartDate}T00:00:00.000Z`) : null }),
                ...(data.employmentEndDate !== undefined && { employmentEndDate: data.employmentEndDate ? new Date(`${data.employmentEndDate}T00:00:00.000Z`) : null }),
                ...(data.probationEndDate !== undefined && { probationEndDate: data.probationEndDate ? new Date(`${data.probationEndDate}T00:00:00.000Z`) : null }),
                ...(data.totalLeave !== undefined && { totalLeave: data.totalLeave }),
                ...(data.usedLeave !== undefined && { usedLeave: data.usedLeave }),
                ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
                ...(data.shiftId !== undefined && { shiftId: data.shiftId }),
                ...(data.bypassLocation !== undefined && { bypassLocation: data.bypassLocation }),
                ...(data.basicSalary !== undefined && { basicSalary: data.basicSalary }),

                ...(data.locations !== undefined && {
                    locations: {
                        set: data.locations.map(l => ({ id: l.id }))
                    }
                }),

                ...(data.payrollComponents !== undefined && {
                    payrollComponents: {
                        deleteMany: {},
                        create: data.payrollComponents.map((c) => ({
                            componentId: c.componentId,
                            amount: c.amount
                        }))
                    }
                }),
            },
                include: employeeRelations,
            });

            await applyEmployeePrivateData(tx, updated.employeeId, data, actor);

            if (data.name !== undefined || data.email !== undefined) {
                await tx.userAccount.updateMany({
                    where: { employeeId: updated.employeeId },
                    data: {
                        ...(data.name !== undefined && { displayName: data.name }),
                        ...(data.email !== undefined && { email: data.email }),
                    },
                });
            }
            return updated;
        });
        return row;
    } catch (err) {
        logger.error("updateEmployee Gagal", { id, error: err });
        throw err;
    }
}

export async function deleteEmployee(id: string): Promise<boolean> {
    try {
        await prisma.employee.delete({ where: { id } });
        return true;
    } catch (err: unknown) {
        logger.error("deleteEmployee Gagal", { id, error: err });
        throw new Error("Penghapusan ditolak. Karyawan ini mungkin masih memiliki riwayat absensi, gaji, atau peminjaman yang tak terhapus (onDelete: Restrict). Disarankan menonaktifkan status karyawan (isActive: false) alih-alih menghapus data permanen.");
    }
}

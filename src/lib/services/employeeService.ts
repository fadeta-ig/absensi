import { prisma } from "../prisma";
import { Employee } from "@/types";
import { Prisma } from "@prisma/client";
import logger from "@/lib/logger";

const employeeRelations = {
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

export async function getEmployees(): Promise<EmployeeWithRelations[]> {
    const rows = await prisma.employee.findMany({
        include: employeeRelations,
        orderBy: { name: "asc" }
    });
    return rows;
}

export type EmployeeStatusFilter = "active" | "inactive" | "all";

export async function getVisibleEmployees(
    requester: { employeeId: string; role: string },
    status: EmployeeStatusFilter = "active"
): Promise<EmployeeWithRelations[]> {
    const { employeeId, role } = requester;

    // HR may explicitly request inactive/all records for employee master data.
    if (role === "hr") {
        const rows = await prisma.employee.findMany({
            where: status === "all" ? undefined : { isActive: status === "active" },
            include: employeeRelations,
            orderBy: { name: "asc" },
        });
        return rows;
    }

    // GA operational selectors only receive active employees.
    if (role === "ga") {
        const rows = await prisma.employee.findMany({
            where: { isActive: true },
            include: employeeRelations,
            orderBy: { name: "asc" },
        });
        return rows;
    }

    // Normal employees see themselves and their entire downstream hierarchy (1 .. N)
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

export async function createEmployee(
    data: Omit<Employee, "id" | "sessionVersion" | "statusChangedAt">
): Promise<EmployeeWithRelations> {
    const row = await prisma.employee.create({
        data: {
            employeeId: data.employeeId,
            name: data.name,
            email: data.email,
            phone: data.phone,
            departmentId: data.departmentId,
            divisionId: data.divisionId,
            positionId: data.positionId,
            role: data.role,
            managerId: data.managerId || null,
            password: data.password,
            joinDate: data.joinDate ? new Date(data.joinDate + "T00:00:00.000Z") : new Date(),
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
    return row;
}

export async function updateEmployee(id: string, data: Partial<Employee>): Promise<EmployeeWithRelations | null> {
    try {
        if (data.managerId !== undefined && data.managerId !== null) {
            const existingEmployee = await prisma.employee.findUnique({
                where: { id },
                select: { employeeId: true }
            });

            if (existingEmployee) {
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
        }

        const row = await prisma.employee.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.email !== undefined && { email: data.email }),
                ...(data.phone !== undefined && { phone: data.phone }),
                ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
                ...(data.divisionId !== undefined && { divisionId: data.divisionId }),
                ...(data.positionId !== undefined && { positionId: data.positionId }),
                ...(data.role !== undefined && { role: data.role }),
                ...(data.managerId !== undefined && { managerId: data.managerId || null }),
                ...(data.password !== undefined && { password: data.password }),
                ...(data.joinDate !== undefined && { joinDate: new Date(data.joinDate + "T00:00:00.000Z") }),
                ...(data.totalLeave !== undefined && { totalLeave: data.totalLeave }),
                ...(data.usedLeave !== undefined && { usedLeave: data.usedLeave }),
                ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
                ...(data.shiftId !== undefined && { shiftId: data.shiftId }),
                ...(data.bypassLocation !== undefined && { bypassLocation: data.bypassLocation }),
                ...(data.basicSalary !== undefined && { basicSalary: data.basicSalary }),
                ...((data.password !== undefined || data.role !== undefined) && {
                    sessionVersion: { increment: 1 },
                }),

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
        return row;
    } catch (err) {
        logger.error("updateEmployee Gagal", { id, error: err instanceof Error ? err.message : String(err) });
        throw new Error("Gagal memperbarui data karyawan. Silakan periksa kembali constraint database.");
    }
}

export async function deleteEmployee(id: string): Promise<boolean> {
    try {
        await prisma.employee.delete({ where: { id } });
        return true;
    } catch (err: unknown) {
        const prismaErr = err as { code?: string; message?: string };
        logger.error("deleteEmployee Gagal", { id, code: prismaErr?.code, message: prismaErr?.message });
        throw new Error("Penghapusan ditolak. Karyawan ini mungkin masih memiliki riwayat absensi, gaji, atau peminjaman yang tak terhapus (onDelete: Restrict). Disarankan menonaktifkan status karyawan (isActive: false) alih-alih menghapus data permanen.");
    }
}

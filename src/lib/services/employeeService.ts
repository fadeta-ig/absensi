import { prisma } from "../prisma";
import { Employee } from "@/types";

export async function getEmployees(): Promise<Employee[]> {
    const rows = await prisma.employee.findMany({
        include: {
            locations: { select: { id: true, name: true } },
            payrollComponents: { include: { component: true } },
            manager: true,
            subordinates: true
        },
        orderBy: { name: "asc" }
    });
    return rows as unknown as Employee[];
}

export async function getVisibleEmployees(requester: Employee): Promise<Employee[]> {
    const { employeeId, role } = requester;

    // HR and GA can see all active employees
    if (role === "hr" || role === "ga") {
        const rows = await prisma.employee.findMany({
            where: { isActive: true },
            include: {
                locations: { select: { id: true, name: true } },
                payrollComponents: { include: { component: true } },
                manager: true,
                subordinates: true,
                departmentRel: true,
                divisionRel: true,
                positionRel: true,
            },
            orderBy: { name: "asc" },
        });
        return rows as unknown as Employee[];
    }

    // Normal employees see themselves and their entire downstream hierarchy (1 .. N)
    const self = await prisma.employee.findUnique({
        where: { employeeId },
        include: {
            locations: { select: { id: true, name: true } },
            payrollComponents: { include: { component: true } },
            manager: true,
            subordinates: true,
            departmentRel: true,
            divisionRel: true,
            positionRel: true,
        }
    });

    if (!self) return [];
    
    // Breadth-First Search queue to collect all subordinates recursively
    const visibleEmployees: Employee[] = [self as unknown as Employee];
    const queue = [employeeId];
    
    while(queue.length > 0) {
        const currentManagerId = queue.shift()!;
        const subs = await prisma.employee.findMany({
            where: { managerId: currentManagerId, isActive: true },
            include: {
                locations: { select: { id: true, name: true } },
                payrollComponents: { include: { component: true } },
                manager: true,
                subordinates: true,
                departmentRel: true,
                divisionRel: true,
                positionRel: true,
            },
            orderBy: { name: "asc" }
        });

        for (const sub of subs) {
            visibleEmployees.push(sub as unknown as Employee);
            queue.push(sub.employeeId);
        }
    }

    return visibleEmployees;
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
    const row = await prisma.employee.findUnique({ where: { id } });
    return (row as unknown as Employee) ?? undefined;
}

export async function getEmployeeByEmployeeId(employeeId: string): Promise<Employee | undefined> {
    const row = await prisma.employee.findUnique({ where: { employeeId } });
    return (row as unknown as Employee) ?? undefined;
}

export async function createEmployee(data: Omit<Employee, "id">): Promise<Employee> {
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
                create: data.payrollComponents.map(c => ({
                    componentId: c.componentId,
                    amount: c.amount
                }))
            } : undefined,
        },
        include: {
            locations: { select: { id: true, name: true } },
            payrollComponents: { include: { component: true } },
            manager: true,
            subordinates: true
        }
    });
    return row as unknown as Employee;
}

export async function updateEmployee(id: string, data: Partial<Employee>): Promise<Employee | null> {
    try {
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
                ...(data.isActive !== undefined && { isActive: data.isActive }),
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
                        create: data.payrollComponents.map(c => ({
                            componentId: c.componentId,
                            amount: c.amount
                        }))
                    }
                }),
            },
            include: {
                locations: { select: { id: true, name: true } },
                payrollComponents: { include: { component: true } },
                manager: true,
                subordinates: true
            }
        });
        return row as unknown as Employee;
    } catch (err) {
        console.error("[updateEmployee Error]:", err);
        return null;
    }
}

export async function deleteEmployee(id: string): Promise<boolean> {
    try {
        await prisma.employee.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}

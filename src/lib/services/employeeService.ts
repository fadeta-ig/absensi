import { prisma } from "../prisma";
import { Employee } from "@/types";

export async function getEmployees(): Promise<Employee[]> {
    const rows = await prisma.employee.findMany({ orderBy: { name: "asc" } });
    return rows as unknown as Employee[];
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
            department: data.department,
            position: data.position,
            role: data.role,
            password: data.password,
            joinDate: data.joinDate,
            totalLeave: data.totalLeave,
            usedLeave: data.usedLeave,
            avatarUrl: data.avatarUrl,
            isActive: data.isActive,
            shiftId: data.shiftId,
        },
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
                ...(data.department !== undefined && { department: data.department }),
                ...(data.position !== undefined && { position: data.position }),
                ...(data.role !== undefined && { role: data.role }),
                ...(data.password !== undefined && { password: data.password }),
                ...(data.joinDate !== undefined && { joinDate: data.joinDate }),
                ...(data.totalLeave !== undefined && { totalLeave: data.totalLeave }),
                ...(data.usedLeave !== undefined && { usedLeave: data.usedLeave }),
                ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
                ...(data.shiftId !== undefined && { shiftId: data.shiftId }),
            },
        });
        return row as unknown as Employee;
    } catch {
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

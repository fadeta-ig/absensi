import { prisma } from "@/lib/prisma";

export interface ActiveEmployeeRow {
    employeeId: string;
    name: string;
    department: string;
    position: string;
}

/**
 * Cari karyawan aktif (nama/ID) — dipakai lintas modul (appointment, equipment, GA).
 * Satu implementasi agar perilaku + bentuk respons konsisten.
 */
export async function searchActiveEmployees(input: {
    q: string;
    limit: number;
    excludeEmployeeId?: string;
}): Promise<ActiveEmployeeRow[]> {
    const query = input.q.trim();
    const employees = await prisma.employee.findMany({
        where: {
            isActive: true,
            ...(input.excludeEmployeeId ? { employeeId: { not: input.excludeEmployeeId } } : {}),
            ...(query
                ? {
                    OR: [
                        { name: { contains: query } },
                        { employeeId: { contains: query } },
                    ],
                }
                : {}),
        },
        select: {
            id: true,
            employeeId: true,
            name: true,
            departmentRel: { select: { id: true, name: true } },
            divisionRel: { select: { id: true, name: true } },
            positionRel: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
        take: input.limit,
    });
    return employees.map((emp) => ({
        employeeId: emp.employeeId,
        name: emp.name,
        department: emp.departmentRel?.name || "-",
        position: emp.positionRel?.name || "-",
    }));
}

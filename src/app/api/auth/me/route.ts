import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse } from "@/lib/middleware/apiGuard";
import { getEmployeeByEmployeeId } from "@/lib/services/employeeService";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const employee = session.employeeId
        ? await getEmployeeByEmployeeId(session.employeeId)
        : null;

    const employeeData = employee ? {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        avatarUrl: employee.avatarUrl,
        totalLeave: employee.totalLeave,
        usedLeave: employee.usedLeave,
        departmentId: employee.departmentId,
        divisionId: employee.divisionId,
        positionId: employee.positionId,
        departmentRel: employee.departmentRel,
        divisionRel: employee.divisionRel,
        positionRel: employee.positionRel,
        subordinates: employee.subordinates,
        isActive: employee.isActive,
    } : {};

    return NextResponse.json({
        ...employeeData,
        userId: session.userId,
        username: session.username,
        name: employee?.name ?? session.name,
        email: employee?.email ?? session.email,
        employeeId: employee?.employeeId ?? null,
        roles: session.roles,
        permissions: session.permissions,
        primaryRole: session.primaryRole,
        role: session.role,
        hasSubordinates: session.hasSubordinates,
    });
}
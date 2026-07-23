import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { getEmployeePrivateDetailById } from "@/lib/services/employeeService";
import { serializeEmployeePrivateData } from "@/lib/services/employeePrivateService";
import { actorFromSession, logAction } from "@/lib/services/auditService";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const { id } = await params;
        const employee = await getEmployeePrivateDetailById(id);
        if (!employee) return NextResponse.json({ error: "Data karyawan tidak ditemukan." }, { status: 404 });

        await logAction("VIEW_PRIVATE", "Employee", actorFromSession(session), employee.id, {
            employeeId: employee.employeeId,
        });

        return NextResponse.json({
            id: employee.id,
            employeeId: employee.employeeId,
            name: employee.name,
            academicTitle: employee.academicTitle,
            preferredName: employee.preferredName,
            email: employee.email,
            phone: employee.phone,
            alternatePhone: employee.alternatePhone,
            gender: employee.gender,
            departmentId: employee.departmentId,
            divisionId: employee.divisionId,
            positionId: employee.positionId,
            managerId: employee.managerId,
            employmentType: employee.employmentType,
            joinDate: employee.joinDate,
            employmentStartDate: employee.employmentStartDate,
            employmentEndDate: employee.employmentEndDate,
            probationEndDate: employee.probationEndDate,
            totalLeave: employee.totalLeave,
            usedLeave: employee.usedLeave,
            avatarUrl: employee.avatarUrl,
            isActive: employee.isActive,
            statusChangedAt: employee.statusChangedAt,
            shiftId: employee.shiftId,
            bypassLocation: employee.bypassLocation,
            basicSalary: employee.basicSalary,
            locations: employee.locations,
            payrollComponents: employee.payrollComponents,
            manager: employee.manager,
            subordinates: employee.subordinates,
            departmentRel: employee.departmentRel,
            divisionRel: employee.divisionRel,
            positionRel: employee.positionRel,
            ...serializeEmployeePrivateData(employee),
        });
    } catch (error) {
        return serverErrorResponse("EmployeePrivateGET", error);
    }
}

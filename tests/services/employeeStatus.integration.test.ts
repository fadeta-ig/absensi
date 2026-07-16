import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { changeEmployeeStatus } from "@/lib/services/employeeStatusService";
import { toWIBDateString } from "@/lib/timezone";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

describeWithDatabase("employee status database integration", () => {
    const suffix = `${Date.now()}`;
    const employeeId = `STATUS_TEST_${suffix}`;
    let recordId = "";
    let userId = "";
    let actor = { userId: "", identifier: "", name: "", role: "HR_ADMIN", type: "USER" as const };

    beforeAll(async () => {
        const [admin, employeeRole, department, position] = await Promise.all([
            prisma.userAccount.findFirst({
                where: {
                    isActive: true,
                    roles: { some: { role: { permissions: { some: { permission: { code: "hr.manage" } } } } } },
                },
                select: {
                    id: true,
                    username: true,
                    displayName: true,
                    roles: { select: { role: { select: { code: true } } }, take: 1 },
                },
            }),
            prisma.role.findUnique({ where: { code: "EMPLOYEE_USER" }, select: { id: true } }),
            prisma.department.findFirst({ where: { isActive: true }, select: { id: true } }),
            prisma.position.findFirst({ where: { isActive: true }, select: { id: true } }),
        ]);
        if (!admin || !employeeRole || !department || !position) {
            throw new Error("Data referensi admin/role/departemen/posisi tidak tersedia untuk integration test.");
        }
        actor = {
            userId: admin.id,
            identifier: admin.username,
            name: admin.displayName,
            role: admin.roles[0]?.role.code ?? "HR_ADMIN",
            type: "USER",
        };

        const employee = await prisma.employee.create({
            data: {
                employeeId,
                name: "Status Integration Test",
                email: `status-test-${suffix}@example.invalid`,
                phone: "0000000000",
                departmentId: department.id,
                positionId: position.id,
                joinDate: new Date(`${toWIBDateString()}T00:00:00.000Z`),
                isActive: true,
            },
        });
        recordId = employee.id;
        const user = await prisma.userAccount.create({
            data: {
                username: employeeId,
                displayName: employee.name,
                email: employee.email,
                passwordHash: "integration-test-not-for-login",
                employeeId,
                roles: { create: { roleId: employeeRole.id, assignedByUserId: admin.id } },
            },
        });
        userId = user.id;
    });

    afterAll(async () => {
        if (!recordId) return;
        await prisma.auditLog.deleteMany({ where: { entity: "EMPLOYEE", entityId: recordId } });
        await prisma.employeeStatusHistory.deleteMany({ where: { employeeId } });
        await prisma.userAccount.deleteMany({ where: { id: userId } });
        await prisma.employee.deleteMany({ where: { id: recordId } });
    });

    it("persists employment status, session revocation, history, and audit records", async () => {
        const effectiveDate = toWIBDateString();
        await changeEmployeeStatus(recordId, {
            isActive: false,
            reason: "Integration test deactivation",
            effectiveDate,
        }, actor);

        const [inactiveEmployee, inactiveUser] = await Promise.all([
            prisma.employee.findUniqueOrThrow({ where: { id: recordId }, select: { isActive: true, statusChangedAt: true } }),
            prisma.userAccount.findUniqueOrThrow({ where: { id: userId }, select: { isActive: true, sessionVersion: true } }),
        ]);
        expect(inactiveEmployee.isActive).toBe(false);
        expect(inactiveEmployee.statusChangedAt).toBeInstanceOf(Date);
        expect(inactiveUser).toEqual({ isActive: false, sessionVersion: 1 });

        await changeEmployeeStatus(recordId, {
            isActive: true,
            reason: "Integration test reactivation",
            effectiveDate,
        }, actor);

        const [activeEmployee, activeUser, histories, audits] = await Promise.all([
            prisma.employee.findUniqueOrThrow({ where: { id: recordId }, select: { isActive: true } }),
            prisma.userAccount.findUniqueOrThrow({ where: { id: userId }, select: { isActive: true, sessionVersion: true } }),
            prisma.employeeStatusHistory.findMany({ where: { employeeId }, orderBy: { createdAt: "asc" } }),
            prisma.auditLog.findMany({ where: { entity: "EMPLOYEE", entityId: recordId }, orderBy: { createdAt: "asc" } }),
        ]);

        expect(activeEmployee).toEqual({ isActive: true });
        expect(activeUser).toEqual({ isActive: true, sessionVersion: 2 });
        expect(histories.map((history) => history.isActive)).toEqual([false, true]);
        expect(audits.map((audit) => audit.action)).toEqual(["DEACTIVATE_EMPLOYEE", "REACTIVATE_EMPLOYEE"]);
    });
});

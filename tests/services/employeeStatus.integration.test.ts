import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { changeEmployeeStatus } from "@/lib/services/employeeStatusService";
import { toWIBDateString } from "@/lib/timezone";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

describeWithDatabase("employee status database integration", () => {
    const suffix = `${Date.now()}`;
    const employeeId = `STATUS_TEST_${suffix}`;
    let recordId = "";
    let hrEmployeeId = "";

    beforeAll(async () => {
        const [hr, department, position] = await Promise.all([
            prisma.employee.findFirst({ where: { role: "hr", isActive: true }, select: { employeeId: true } }),
            prisma.department.findFirst({ where: { isActive: true }, select: { id: true } }),
            prisma.position.findFirst({ where: { isActive: true }, select: { id: true } }),
        ]);
        if (!hr || !department || !position) throw new Error("Data referensi HR/departemen/posisi tidak tersedia untuk integration test.");
        hrEmployeeId = hr.employeeId;

        const employee = await prisma.employee.create({
            data: {
                employeeId,
                name: "Status Integration Test",
                email: `status-test-${suffix}@example.invalid`,
                phone: "0000000000",
                departmentId: department.id,
                positionId: position.id,
                role: "employee",
                password: "integration-test-not-for-login",
                joinDate: new Date(`${toWIBDateString()}T00:00:00.000Z`),
                isActive: true,
            },
        });
        recordId = employee.id;
    });

    afterAll(async () => {
        if (!recordId) return;
        await prisma.auditLog.deleteMany({ where: { entity: "EMPLOYEE", entityId: recordId } });
        await prisma.employeeStatusHistory.deleteMany({ where: { employeeId } });
        await prisma.employee.deleteMany({ where: { id: recordId } });
    });

    it("persists deactivation/reactivation, session revocation, status history, and audit records", async () => {
        const effectiveDate = toWIBDateString();

        await changeEmployeeStatus(recordId, {
            isActive: false,
            reason: "Integration test deactivation",
            effectiveDate,
        }, hrEmployeeId);

        const inactive = await prisma.employee.findUniqueOrThrow({
            where: { id: recordId },
            select: { isActive: true, sessionVersion: true, statusChangedAt: true },
        });
        expect(inactive.isActive).toBe(false);
        expect(inactive.sessionVersion).toBe(1);
        expect(inactive.statusChangedAt).toBeInstanceOf(Date);

        await changeEmployeeStatus(recordId, {
            isActive: true,
            reason: "Integration test reactivation",
            effectiveDate,
        }, hrEmployeeId);

        const [active, histories, audits] = await Promise.all([
            prisma.employee.findUniqueOrThrow({
                where: { id: recordId },
                select: { isActive: true, sessionVersion: true },
            }),
            prisma.employeeStatusHistory.findMany({ where: { employeeId }, orderBy: { createdAt: "asc" } }),
            prisma.auditLog.findMany({ where: { entity: "EMPLOYEE", entityId: recordId }, orderBy: { createdAt: "asc" } }),
        ]);

        expect(active).toEqual({ isActive: true, sessionVersion: 2 });
        expect(histories.map((history) => history.isActive)).toEqual([false, true]);
        expect(audits.map((audit) => audit.action)).toEqual(["DEACTIVATE_EMPLOYEE", "REACTIVATE_EMPLOYEE"]);
    });
});

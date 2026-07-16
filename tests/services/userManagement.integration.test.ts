import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
    createAdminUser,
    resetAdminUserPassword,
    updateAdminUser,
} from "@/lib/services/userService";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

describeWithDatabase("separated user management database integration", () => {
    const suffix = Date.now().toString();
    const standaloneUsername = `admin_test_${suffix}`;
    const linkedEmployeeId = `USER_TEST_${suffix}`;
    let actorUserId = "";
    let standaloneUserId = "";
    let linkedUserId = "";
    let linkedEmployeeRecordId = "";

    beforeAll(async () => {
        const actor = await prisma.userAccount.findFirst({
            where: { isActive: true, roles: { some: { role: { code: "SUPER_ADMIN" } } } },
            select: { id: true },
        });
        if (!actor) throw new Error("Super admin tidak tersedia untuk integration test.");
        actorUserId = actor.id;
    });

    afterAll(async () => {
        await prisma.userAccount.deleteMany({ where: { id: { in: [standaloneUserId, linkedUserId].filter(Boolean) } } });
        if (linkedEmployeeRecordId) await prisma.employee.deleteMany({ where: { id: linkedEmployeeRecordId } });
    });

    it("creates, changes role, revokes sessions, and resets a standalone admin account", async () => {
        const created = await createAdminUser({
            username: standaloneUsername,
            displayName: "Admin Integration Test",
            email: `${standaloneUsername}@example.invalid`,
            passwordHash: "hash-v1",
            roleCode: "HR_ADMIN",
            actorUserId,
        });
        standaloneUserId = created.id;
        expect(created.employeeId).toBeNull();
        expect(created.roles.map(({ role }) => role.code)).toEqual(["HR_ADMIN"]);

        const changed = await updateAdminUser({
            id: created.id,
            actorUserId,
            roleCode: "GA_ADMIN",
            isActive: false,
        });
        expect(changed.isActive).toBe(false);
        expect(changed.sessionVersion).toBe(1);
        expect(changed.roles.map(({ role }) => role.code)).toEqual(["GA_ADMIN"]);

        await updateAdminUser({ id: created.id, actorUserId, isActive: true });
        await resetAdminUserPassword(created.id, actorUserId, "hash-v2");
        const reset = await prisma.userAccount.findUniqueOrThrow({
            where: { id: created.id },
            select: { passwordHash: true, sessionVersion: true, passwordChangedAt: true },
        });
        expect(reset.passwordHash).toBe("hash-v2");
        expect(reset.sessionVersion).toBe(3);
        expect(reset.passwordChangedAt).toBeInstanceOf(Date);
    });

    it("promotes an existing employee login without replacing its credentials", async () => {
        const [department, position, employeeRole] = await Promise.all([
            prisma.department.findFirst({ where: { isActive: true }, select: { id: true } }),
            prisma.position.findFirst({ where: { isActive: true }, select: { id: true } }),
            prisma.role.findUnique({ where: { code: "EMPLOYEE_USER" }, select: { id: true } }),
        ]);
        if (!department || !position || !employeeRole) throw new Error("Referensi karyawan tidak tersedia.");

        const employee = await prisma.employee.create({
            data: {
                employeeId: linkedEmployeeId,
                name: "Linked User Integration Test",
                email: `${linkedEmployeeId.toLowerCase()}@example.invalid`,
                phone: "0000000000",
                departmentId: department.id,
                positionId: position.id,
                joinDate: new Date(),
                isActive: true,
            },
        });
        linkedEmployeeRecordId = employee.id;
        const employeeUser = await prisma.userAccount.create({
            data: {
                username: linkedEmployeeId,
                displayName: employee.name,
                email: employee.email,
                passwordHash: "preserved-hash",
                employeeId: linkedEmployeeId,
                roles: { create: { roleId: employeeRole.id, assignedByUserId: actorUserId } },
            },
        });
        linkedUserId = employeeUser.id;

        const promoted = await createAdminUser({
            username: "ignored",
            displayName: "ignored",
            email: "ignored@example.invalid",
            passwordHash: "must-not-replace",
            employeeId: linkedEmployeeId,
            roleCode: "HR_ADMIN",
            actorUserId,
        });
        const persisted = await prisma.userAccount.findUniqueOrThrow({
            where: { id: promoted.id },
            select: { passwordHash: true, employeeId: true, roles: { select: { role: { select: { code: true } } } } },
        });
        expect(persisted.passwordHash).toBe("preserved-hash");
        expect(persisted.employeeId).toBe(linkedEmployeeId);
        expect(persisted.roles.map(({ role }) => role.code)).toEqual(["HR_ADMIN"]);
    });

    it("protects the super admin role and status from menu mutations", async () => {
        await expect(updateAdminUser({ id: actorUserId, actorUserId, isActive: false }))
            .rejects.toMatchObject({ status: 409 });
        await expect(updateAdminUser({ id: actorUserId, actorUserId, roleCode: "HR_ADMIN" }))
            .rejects.toMatchObject({ status: 409 });
    });
});

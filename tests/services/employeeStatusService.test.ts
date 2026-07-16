import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const tx = {
        employee: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            updateMany: vi.fn(),
            update: vi.fn(),
        },
        userAccount: { findUnique: vi.fn(), update: vi.fn() },
        userRoleAssignment: { count: vi.fn() },
        pushSubscription: { deleteMany: vi.fn() },
        employeeStatusHistory: { create: vi.fn() },
        auditLog: { create: vi.fn() },
    };
    return {
        tx,
        transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
});

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/timezone", () => ({ toWIBDateString: () => "2026-07-16" }));

import { changeEmployeeStatus, EmployeeStatusError } from "@/lib/services/employeeStatusService";

const auditActor = {
    userId: "actor-user-id",
    identifier: "HR001",
    name: "HR Admin",
    role: "HR_ADMIN",
    type: "USER" as const,
};

const activeEmployee = {
    id: "employee-uuid",
    employeeId: "EMP001",
    name: "Employee One",
    isActive: true,
    userAccount: {
        id: "employee-user-id",
        isActive: true,
        roles: [{ role: { code: "EMPLOYEE_USER" } }],
    },
};

const activeHrAccount = {
    id: auditActor.userId,
    isActive: true,
    roles: [{ role: { permissions: [{ permission: { code: "hr.manage" } }] } }],
};

describe("employeeStatusService.changeEmployeeStatus", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tx.employee.findUnique.mockResolvedValue(activeEmployee);
        mocks.tx.userAccount.findUnique.mockResolvedValue(activeHrAccount);
        mocks.tx.employee.findMany.mockResolvedValue([]);
        mocks.tx.userRoleAssignment.count.mockResolvedValue(2);
        mocks.tx.employee.updateMany.mockResolvedValue({ count: 0 });
        mocks.tx.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
        mocks.tx.userAccount.update.mockResolvedValue({});
        mocks.tx.employee.update.mockResolvedValue({
            id: activeEmployee.id,
            employeeId: activeEmployee.employeeId,
            name: activeEmployee.name,
            isActive: false,
            statusChangedAt: new Date("2026-07-16T08:00:00.000Z"),
        });
        mocks.tx.employeeStatusHistory.create.mockResolvedValue({
            id: "history-uuid",
            employeeId: activeEmployee.employeeId,
            wasActive: true,
            isActive: false,
            reason: "Kontrak telah berakhir",
            effectiveDate: new Date("2026-07-16T00:00:00.000Z"),
            changedByUserId: auditActor.userId,
            changedByIdentifier: auditActor.identifier,
            createdAt: new Date("2026-07-16T08:00:00.000Z"),
            actor: { username: auditActor.identifier, displayName: auditActor.name },
        });
        mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-uuid" });
    });

    it("updates employment status, revokes login sessions, removes push credentials, and writes histories atomically", async () => {
        const result = await changeEmployeeStatus(activeEmployee.id, {
            isActive: false,
            reason: "Kontrak telah berakhir",
            effectiveDate: "2026-07-16",
        }, auditActor);

        expect(result.employee.isActive).toBe(false);
        expect(mocks.tx.employee.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ isActive: false }),
        }));
        expect(mocks.tx.userAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: activeEmployee.userAccount.id },
            data: { isActive: false, sessionVersion: { increment: 1 } },
        }));
        expect(mocks.tx.pushSubscription.deleteMany).toHaveBeenCalledWith({
            where: { userId: activeEmployee.userAccount.id },
        });
        expect(mocks.tx.employeeStatusHistory.create).toHaveBeenCalledOnce();
        expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
    });

    it("rejects a future effective date before opening a transaction", async () => {
        await expect(changeEmployeeStatus(activeEmployee.id, {
            isActive: false, reason: "Kontrak berakhir", effectiveDate: "2026-07-17",
        }, auditActor)).rejects.toMatchObject({ status: 400 } satisfies Partial<EmployeeStatusError>);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("rejects a calendar date that does not exist", async () => {
        await expect(changeEmployeeStatus(activeEmployee.id, {
            isActive: false, reason: "Kontrak berakhir", effectiveDate: "2026-02-30",
        }, auditActor)).rejects.toMatchObject({ status: 400 } satisfies Partial<EmployeeStatusError>);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("prevents an admin from deactivating their own linked employee account", async () => {
        mocks.tx.employee.findUnique.mockResolvedValue({
            ...activeEmployee,
            userAccount: { ...activeEmployee.userAccount, id: auditActor.userId },
        });

        await expect(changeEmployeeStatus(activeEmployee.id, {
            isActive: false, reason: "Tidak boleh dilakukan", effectiveDate: "2026-07-16",
        }, auditActor)).rejects.toMatchObject({ status: 409 } satisfies Partial<EmployeeStatusError>);
        expect(mocks.tx.employee.update).not.toHaveBeenCalled();
    });

    it("prevents deactivation of the last active super admin", async () => {
        mocks.tx.employee.findUnique.mockResolvedValue({
            ...activeEmployee,
            userAccount: {
                ...activeEmployee.userAccount,
                roles: [{ role: { code: "SUPER_ADMIN" } }],
            },
        });
        mocks.tx.userRoleAssignment.count.mockResolvedValue(1);

        await expect(changeEmployeeStatus(activeEmployee.id, {
            isActive: false, reason: "Akhir masa kerja", effectiveDate: "2026-07-16",
        }, auditActor)).rejects.toMatchObject({ status: 409 } satisfies Partial<EmployeeStatusError>);
    });

    it("requires an explicit direct-report reassignment decision", async () => {
        mocks.tx.employee.findMany.mockResolvedValue([{ employeeId: "EMP002" }]);
        await expect(changeEmployeeStatus(activeEmployee.id, {
            isActive: false, reason: "Akhir masa kerja", effectiveDate: "2026-07-16",
        }, auditActor)).rejects.toMatchObject({ status: 409 } satisfies Partial<EmployeeStatusError>);
        expect(mocks.tx.employee.updateMany).not.toHaveBeenCalled();
    });
});

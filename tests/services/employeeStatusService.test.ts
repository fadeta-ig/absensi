import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const tx = {
        employee: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            updateMany: vi.fn(),
            update: vi.fn(),
        },
        pushSubscription: { deleteMany: vi.fn() },
        employeeStatusHistory: { create: vi.fn() },
        auditLog: { create: vi.fn() },
    };
    return {
        tx,
        transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
});

vi.mock("@/lib/prisma", () => ({
    prisma: { $transaction: mocks.transaction },
}));

vi.mock("@/lib/timezone", () => ({
    toWIBDateString: () => "2026-07-16",
}));

import {
    changeEmployeeStatus,
    EmployeeStatusError,
} from "@/lib/services/employeeStatusService";

const activeEmployee = {
    id: "employee-uuid",
    employeeId: "EMP001",
    name: "Employee One",
    role: "employee",
    isActive: true,
};

const activeHrActor = {
    employeeId: "HR001",
    role: "hr",
    isActive: true,
};

describe("employeeStatusService.changeEmployeeStatus", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tx.employee.findUnique
            .mockResolvedValueOnce(activeEmployee)
            .mockResolvedValueOnce(activeHrActor);
        mocks.tx.employee.findMany.mockResolvedValue([]);
        mocks.tx.employee.count.mockResolvedValue(2);
        mocks.tx.employee.updateMany.mockResolvedValue({ count: 0 });
        mocks.tx.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
        mocks.tx.employee.update.mockResolvedValue({
            ...activeEmployee,
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
            changedBy: activeHrActor.employeeId,
            createdAt: new Date("2026-07-16T08:00:00.000Z"),
            actor: { employeeId: activeHrActor.employeeId, name: "HR Admin" },
        });
        mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-uuid" });
    });

    it("updates status, revokes sessions, removes push subscriptions, and writes both histories atomically", async () => {
        const result = await changeEmployeeStatus(
            activeEmployee.id,
            {
                isActive: false,
                reason: "Kontrak telah berakhir",
                effectiveDate: "2026-07-16",
            },
            activeHrActor.employeeId
        );

        expect(result.employee.isActive).toBe(false);
        expect(mocks.tx.employee.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                isActive: false,
                sessionVersion: { increment: 1 },
            }),
        }));
        expect(mocks.tx.pushSubscription.deleteMany).toHaveBeenCalledWith({
            where: { employeeId: activeEmployee.employeeId },
        });
        expect(mocks.tx.employeeStatusHistory.create).toHaveBeenCalledOnce();
        expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
    });

    it("rejects a future effective date before opening a transaction", async () => {
        await expect(changeEmployeeStatus(
            activeEmployee.id,
            { isActive: false, reason: "Kontrak berakhir", effectiveDate: "2026-07-17" },
            activeHrActor.employeeId
        )).rejects.toMatchObject({ status: 400 } satisfies Partial<EmployeeStatusError>);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("rejects a calendar date that does not exist", async () => {
        await expect(changeEmployeeStatus(
            activeEmployee.id,
            { isActive: false, reason: "Kontrak berakhir", effectiveDate: "2026-02-30" },
            activeHrActor.employeeId
        )).rejects.toMatchObject({ status: 400 } satisfies Partial<EmployeeStatusError>);
        expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("prevents HR from deactivating their own account", async () => {
        mocks.tx.employee.findUnique.mockReset();
        mocks.tx.employee.findUnique
            .mockResolvedValueOnce({ ...activeEmployee, employeeId: "HR001", role: "hr" })
            .mockResolvedValueOnce(activeHrActor);

        await expect(changeEmployeeStatus(
            activeEmployee.id,
            { isActive: false, reason: "Tidak boleh dilakukan", effectiveDate: "2026-07-16" },
            "HR001"
        )).rejects.toMatchObject({ status: 409 } satisfies Partial<EmployeeStatusError>);
        expect(mocks.tx.employee.update).not.toHaveBeenCalled();
    });

    it("prevents deactivation of the last active HR account", async () => {
        mocks.tx.employee.findUnique.mockReset();
        mocks.tx.employee.findUnique
            .mockResolvedValueOnce({ ...activeEmployee, employeeId: "HR002", role: "hr" })
            .mockResolvedValueOnce(activeHrActor);
        mocks.tx.employee.count.mockResolvedValue(1);

        await expect(changeEmployeeStatus(
            activeEmployee.id,
            { isActive: false, reason: "Akhir masa kerja", effectiveDate: "2026-07-16" },
            "HR001"
        )).rejects.toMatchObject({ status: 409 } satisfies Partial<EmployeeStatusError>);
    });

    it("requires an explicit direct-report reassignment decision", async () => {
        mocks.tx.employee.findMany.mockResolvedValue([{ employeeId: "EMP002" }]);

        await expect(changeEmployeeStatus(
            activeEmployee.id,
            { isActive: false, reason: "Akhir masa kerja", effectiveDate: "2026-07-16" },
            activeHrActor.employeeId
        )).rejects.toMatchObject({ status: 409 } satisfies Partial<EmployeeStatusError>);
        expect(mocks.tx.employee.updateMany).not.toHaveBeenCalled();
    });
});

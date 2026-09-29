import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const tx = {
        workShift: {
            findUnique: vi.fn(),
            updateMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            findMany: vi.fn(),
            findFirst: vi.fn(),
        },
        workShiftDay: {
            findMany: vi.fn(),
        },
        employee: {
            count: vi.fn(),
        },
        shiftAssignment: {
            count: vi.fn(),
        },
    };

    return {
        tx,
        transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
});

vi.mock("@/lib/prisma", () => ({
    prisma: {
        $transaction: mocks.transaction,
        workShift: { findMany: vi.fn() },
    },
}));

import {
    createShift,
    deleteShift,
    ShiftConflictError,
    ShiftValidationError,
    updateShift,
    validateShiftDefinition,
} from "@/lib/services/shiftService";

const shiftRow = {
    id: "shift-1",
    name: "Shift Pagi",
    isDefault: false,
    lateCheckIn: 15,
    earlyCheckIn: 30,
    lateCheckOut: 60,
    earlyCheckOut: 0,
    days: [],
};

const days = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    startTime: "07:00",
    endTime: "15:00",
    isOff: dayOfWeek === 0,
}));

describe("shiftService atomic behavior", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tx.workShift.findUnique.mockResolvedValue({ id: "shift-1", isDefault: false });
        mocks.tx.workShift.updateMany.mockResolvedValue({ count: 1 });
        mocks.tx.workShift.create.mockResolvedValue(shiftRow);
        mocks.tx.workShift.update.mockResolvedValue(shiftRow);
        mocks.tx.workShift.delete.mockResolvedValue(shiftRow);
        mocks.tx.employee.count.mockResolvedValue(0);
        mocks.tx.shiftAssignment.count.mockResolvedValue(0);
        mocks.tx.workShiftDay.findMany.mockResolvedValue(days);
    });

    it("clears the previous default and creates the new shift in one transaction", async () => {
        await createShift({ name: "Shift Pagi", isDefault: true, days });

        expect(mocks.transaction).toHaveBeenCalledOnce();
        expect(mocks.tx.workShift.updateMany).toHaveBeenCalledWith({ data: { isDefault: false } });
        expect(mocks.tx.workShift.create).toHaveBeenCalledOnce();
    });

    it("keeps default clearing and creation inside the rejecting transaction", async () => {
        const error = new Error("create failed");
        mocks.tx.workShift.create.mockRejectedValue(error);

        await expect(createShift({ name: "Shift Gagal", isDefault: true, days })).rejects.toBe(error);

        expect(mocks.transaction).toHaveBeenCalledOnce();
        expect(mocks.tx.workShift.updateMany).toHaveBeenCalledOnce();
        expect(mocks.tx.workShift.create).toHaveBeenCalledOnce();
    });

    it("replaces days through the same atomic shift update", async () => {
        await updateShift("shift-1", { days });

        expect(mocks.transaction).toHaveBeenCalledOnce();
        expect(mocks.tx.workShift.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: "shift-1" },
            data: expect.objectContaining({
                days: {
                    deleteMany: {},
                    create: days,
                },
            }),
        }));
    });

    it("clears other defaults during an atomic update", async () => {
        await updateShift("shift-1", { isDefault: true });

        expect(mocks.tx.workShift.updateMany).toHaveBeenCalledWith({
            where: { id: { not: "shift-1" } },
            data: { isDefault: false },
        });
        expect(mocks.tx.workShift.update).toHaveBeenCalledOnce();
    });

    it("rejects unsetting the current default without a replacement", async () => {
        mocks.tx.workShift.findUnique.mockResolvedValue({ id: "shift-1", isDefault: true });

        await expect(updateShift("shift-1", { isDefault: false })).rejects.toMatchObject({
            name: "ShiftConflictError",
            statusCode: 409,
        });
        expect(mocks.tx.workShift.update).not.toHaveBeenCalled();
    });

    it("rejects deletion of a default shift and reports assignments", async () => {
        mocks.tx.workShift.findUnique.mockResolvedValue({ id: "shift-1", isDefault: true });
        mocks.tx.employee.count.mockResolvedValue(3);

        await expect(deleteShift("shift-1")).rejects.toMatchObject({
            name: "ShiftConflictError",
            statusCode: 409,
            assignmentCount: 3,
        } satisfies Partial<ShiftConflictError>);
        expect(mocks.tx.workShift.delete).not.toHaveBeenCalled();
    });

    it("rejects deletion of an assigned shift and reports assignments", async () => {
        mocks.tx.workShift.findUnique.mockResolvedValue({ id: "shift-1", isDefault: false });
        mocks.tx.employee.count.mockResolvedValue(2);

        await expect(deleteShift("shift-1")).rejects.toMatchObject({
            name: "ShiftConflictError",
            statusCode: 409,
            assignmentCount: 2,
        } satisfies Partial<ShiftConflictError>);
        expect(mocks.tx.workShift.delete).not.toHaveBeenCalled();
    });

    it("rejects deletion of a shift used only by roster assignments", async () => {
        mocks.tx.workShift.findUnique.mockResolvedValue({ id: "shift-1", isDefault: false });
        mocks.tx.employee.count.mockResolvedValue(0);
        mocks.tx.shiftAssignment.count.mockResolvedValue(2);

        await expect(deleteShift("shift-1")).rejects.toMatchObject({
            name: "ShiftConflictError",
            statusCode: 409,
        });
        expect(mocks.tx.workShift.delete).not.toHaveBeenCalled();
    });

    it("returns false without counting assignments when the shift does not exist", async () => {
        mocks.tx.workShift.findUnique.mockResolvedValue(null);

        await expect(deleteShift("missing-shift")).resolves.toBe(false);

        expect(mocks.tx.employee.count).not.toHaveBeenCalled();
        expect(mocks.tx.workShift.delete).not.toHaveBeenCalled();
    });

    it("rejects zero-day, duplicate-day, bad-time, and negative-tolerance definitions at service level", () => {
        expect(() => validateShiftDefinition([], {})).toThrowError(ShiftValidationError);
        expect(() => validateShiftDefinition(
            [0, 0, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "07:00", endTime: "15:00", isOff: false })),
            {},
        )).toThrowError(ShiftValidationError);
        expect(() => validateShiftDefinition(
            days.map((d) => (d.dayOfWeek === 1 ? { ...d, startTime: "7 pagi" } : d)),
            {},
        )).toThrowError(ShiftValidationError);
        expect(() => validateShiftDefinition(days, { lateCheckIn: -1 })).toThrowError(ShiftValidationError);
        expect(() => validateShiftDefinition(days, { lateCheckIn: 1.5 })).toThrowError(ShiftValidationError);
        expect(() => validateShiftDefinition(days, {})).not.toThrow();
    });

    it("validates HH:mm on off days and rejects equal working-day start and end times", () => {
        expect(() => validateShiftDefinition(
            days.map((d) => d.dayOfWeek === 0 ? { ...d, startTime: "libur", endTime: "libur", isOff: true } : d),
            {},
        )).toThrowError(ShiftValidationError);
        expect(() => validateShiftDefinition(
            days.map((d) => d.dayOfWeek === 1 ? { ...d, startTime: "08:00", endTime: "08:00", isOff: false } : d),
            {},
        )).toThrowError(ShiftValidationError);
        expect(() => validateShiftDefinition(
            days.map((d) => d.dayOfWeek === 0 ? { ...d, startTime: "00:00", endTime: "00:00", isOff: true } : d),
            {},
        )).not.toThrow();
    });

    it("blocks createShift with an incomplete schedule even when called directly", async () => {
        await expect(createShift({ name: "Tanpa Jadwal", isDefault: false, days: [] })).rejects.toMatchObject({
            name: "ShiftValidationError",
            statusCode: 400,
        });
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
});

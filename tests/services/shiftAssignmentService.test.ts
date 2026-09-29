import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        $queryRaw: vi.fn(),
        employee: { findUnique: vi.fn(), findMany: vi.fn() },
        workShift: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
        shiftAssignment: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
    assignShiftsBulk,
    cancelAssignment,
    countWorkingDaysForEmployee,
    getRosterForDate,
    resolveShiftForDate,
} from "@/lib/services/shiftAssignmentService";

const db = prisma as unknown as {
    $transaction: Mock;
    $queryRaw: Mock;
    employee: Record<string, Mock>;
    workShift: Record<string, Mock>;
    shiftAssignment: Record<string, Mock>;
};

const shiftA = {
    id: "shift-a",
    name: "Shift 1",
    earlyCheckIn: 30,
    lateCheckIn: 15,
    earlyCheckOut: 0,
    lateCheckOut: 60,
    days: [{ dayOfWeek: 1, startTime: "07:00", endTime: "15:00", isOff: false }],
};
const shiftB = { ...shiftA, id: "shift-b", name: "Shift 2" };

describe("shiftAssignmentService", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
        db.$queryRaw.mockResolvedValue([{ employee_id: "EMP001" }]);
        db.shiftAssignment.findMany.mockResolvedValue([]);
        db.shiftAssignment.findFirst.mockResolvedValue(null);
        db.employee.findUnique.mockResolvedValue({ shiftId: "shift-a" });
        db.workShift.findUnique.mockResolvedValue(shiftA);
        db.workShift.findFirst.mockResolvedValue(shiftB);
    });

    it("prefers the assignment covering the date over shiftId", async () => {
        db.shiftAssignment.findMany.mockResolvedValue([{
            shiftId: "shift-b",
            effectiveFrom: new Date("2026-10-05T00:00:00.000Z"),
            effectiveTo: null,
            shift: shiftB,
        }]);
        const resolved = await resolveShiftForDate(db as never, "EMP001", "2026-10-06");
        expect(resolved?.shiftId).toBe("shift-b");
        expect(resolved?.source).toBe("assignment");
    });

    it("falls back to shiftId then default when nothing covers the date", async () => {
        const resolved = await resolveShiftForDate(db as never, "EMP001", "2026-10-04");
        expect(resolved?.shiftId).toBe("shift-a");
        expect(resolved?.source).toBe("fallback");

        db.employee.findUnique.mockResolvedValue({ shiftId: null });
        db.workShift.findUnique.mockResolvedValue(null);
        const def = await resolveShiftForDate(db as never, "EMP001", "2026-10-04");
        expect(def?.shiftId).toBe("shift-b");
        expect(def?.source).toBe("default");
    });

    it("rejects invalid date keys", async () => {
        await expect(resolveShiftForDate(db as never, "EMP001", "besok")).rejects.toMatchObject({
            code: "INVALID_RANGE",
            statusCode: 400,
        });
    });

    it("chains the previous open assignment and rejects overlaps", async () => {
        db.shiftAssignment.findMany.mockResolvedValue([]);
        db.shiftAssignment.findFirst.mockResolvedValue(null);
        db.shiftAssignment.updateMany.mockResolvedValue({ count: 1 });
        db.shiftAssignment.create.mockResolvedValue({ id: "asg-1" });

        const outcome = await assignShiftsBulk([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: "2026-10-12",
        }]);
        expect(outcome.applied).toBe(1);
        expect(db.shiftAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ employeeId: "EMP001", effectiveTo: null }),
        }));
        expect(db.shiftAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ employeeId: "EMP001", shiftId: "shift-b" }),
        }));
    });

    it("rejects overlapping assignments and unknown employees/shifts", async () => {
        db.shiftAssignment.findFirst.mockResolvedValue({ id: "asg-old" });
        await expect(assignShiftsBulk([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: "2026-10-12",
        }])).rejects.toMatchObject({ code: "OVERLAP", statusCode: 409 });

        await expect(assignShiftsBulk([])).rejects.toMatchObject({ code: "INVALID_RANGE" });
        await expect(assignShiftsBulk([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: "2026-10-12",
            effectiveTo: "2026-10-10",
        }])).rejects.toMatchObject({ code: "INVALID_RANGE" });
    });

    it("counts working days per-date across a rotation", async () => {
        db.shiftAssignment.findMany.mockImplementation(async (args: {
            where: { employeeId: string; effectiveFrom: { lte: Date } };
        }) => {
            const key = (args.where.effectiveFrom.lte as Date).toISOString().slice(0, 10);
            // Shift B (isOff Senin) mulai 2026-10-12; sebelumnya Shift A (masuk Senin).
            if (key >= "2026-10-12") {
                return [{
                    shiftId: "shift-b",
                    effectiveFrom: new Date("2026-10-12T00:00:00.000Z"),
                    effectiveTo: null,
                    shift: {
                        ...shiftB,
                        days: [{ dayOfWeek: 1, startTime: "15:00", endTime: "23:00", isOff: true }],
                    },
                }];
            }
            return [];
        });
        // 5-11 Okt: shift A (Senin masuk, hanya Minggu libur) = 6 hari;
        // 12 Okt: shift B Senin off = 0. Total 6 — membuktikan hitung per tanggal.
        const count = await countWorkingDaysForEmployee(db as never, "EMP001", "2026-10-05", "2026-10-12");
        expect(count).toBe(6);
    });

    it("counts the exact 366-calendar-day boundary without truncation", async () => {
        db.workShift.findUnique.mockResolvedValue({
            ...shiftA,
            days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                dayOfWeek,
                startTime: "08:00",
                endTime: "17:00",
                isOff: false,
            })),
        });

        const count = await countWorkingDaysForEmployee(
            db as never,
            "EMP001",
            "2024-01-01",
            "2024-12-31",
        );

        expect(count).toBe(366);
    });

    it("rejects a 367-calendar-day range before resolving any shift", async () => {
        await expect(countWorkingDaysForEmployee(
            db as never,
            "EMP001",
            "2024-01-01",
            "2025-01-01",
        )).rejects.toMatchObject({
            code: "INVALID_RANGE",
            statusCode: 400,
            message: "Rentang cuti maksimal 366 hari kalender.",
        });
        expect(db.shiftAssignment.findMany).not.toHaveBeenCalled();
    });

    it("rejects intra-batch overlaps deterministically regardless of input order", async () => {
        db.shiftAssignment.findFirst.mockResolvedValue(null);
        const batch = [
            { employeeId: "EMP001", shiftId: "shift-b", effectiveFrom: "2026-10-12", effectiveTo: "2026-10-20" },
            { employeeId: "EMP001", shiftId: "shift-a", effectiveFrom: "2026-10-10", effectiveTo: "2026-10-15" },
        ];
        await expect(assignShiftsBulk(batch)).rejects.toMatchObject({ code: "OVERLAP", statusCode: 409 });
        await expect(assignShiftsBulk([...batch].reverse())).rejects.toMatchObject({ code: "OVERLAP", statusCode: 409 });
        expect(db.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it("rejects empty-string effectiveTo and invalid ranges", async () => {
        await expect(assignShiftsBulk([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: "2026-10-12",
            effectiveTo: "",
        }])).rejects.toMatchObject({ code: "INVALID_RANGE", statusCode: 400 });
    });

    it("throws on invalid leave-range input instead of returning 0", async () => {
        await expect(countWorkingDaysForEmployee(db as never, "EMP001", "besok", "2026-10-12"))
            .rejects.toMatchObject({ code: "INVALID_RANGE", statusCode: 400 });
        await expect(countWorkingDaysForEmployee(db as never, "EMP001", "2026-10-12", "2026-10-05"))
            .rejects.toMatchObject({ code: "INVALID_RANGE", statusCode: 400 });
    });

    it("cancels only future assignments", async () => {
        db.shiftAssignment.findUnique.mockResolvedValue({
            id: "asg-future",
            effectiveFrom: new Date("2999-01-05T00:00:00.000Z"),
        });
        db.shiftAssignment.delete.mockResolvedValue({ id: "asg-future" });
        db.shiftAssignment.findFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: "asg-previous" });
        db.shiftAssignment.update.mockResolvedValue({ id: "asg-previous" });
        await cancelAssignment("EMP001", "2999-01-05");
        expect(db.shiftAssignment.delete).toHaveBeenCalledWith({ where: { id: "asg-future" } });
        expect(db.shiftAssignment.update).toHaveBeenCalledWith({
            where: { id: "asg-previous" },
            data: { effectiveTo: null },
        });

        await expect(cancelAssignment("EMP001", "2020-01-01"))
            .rejects.toMatchObject({ code: "INVALID_RANGE", statusCode: 409 });

        db.shiftAssignment.findUnique.mockResolvedValue(null);
        await expect(cancelAssignment("EMP001", "2999-01-06"))
            .rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
    });

    it("bridges the predecessor to the next successor when cancelling a middle future assignment", async () => {
        const successorFrom = new Date("2999-01-19T00:00:00.000Z");
        db.shiftAssignment.findUnique.mockResolvedValue({
            id: "asg-middle",
            effectiveFrom: new Date("2999-01-12T00:00:00.000Z"),
        });
        db.shiftAssignment.findFirst
            .mockResolvedValueOnce({ effectiveFrom: successorFrom })
            .mockResolvedValueOnce({ id: "asg-previous" });

        await cancelAssignment("EMP001", "2999-01-12");

        expect(db.$transaction).toHaveBeenCalledTimes(1);
        expect(db.$queryRaw).toHaveBeenCalledTimes(1);
        expect(db.shiftAssignment.findFirst).toHaveBeenNthCalledWith(1, {
            where: {
                employeeId: "EMP001",
                effectiveFrom: { gt: new Date("2999-01-12T00:00:00.000Z") },
            },
            orderBy: { effectiveFrom: "asc" },
            select: { effectiveFrom: true },
        });
        expect(db.shiftAssignment.update).toHaveBeenCalledWith({
            where: { id: "asg-previous" },
            data: { effectiveTo: successorFrom },
        });
    });

    it("lists the roster for one date", async () => {
        db.employee.findMany = vi.fn().mockResolvedValue([{ employeeId: "EMP001", shiftId: "shift-a" }]);
        db.shiftAssignment.findMany.mockResolvedValue([{
            id: "asg-1",
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: new Date("2026-10-12T00:00:00.000Z"),
            effectiveTo: null,
        }]);
        db.workShift.findMany.mockResolvedValue([]);
        const roster = await getRosterForDate("2026-10-12");
        expect(roster).toEqual([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            source: "assignment",
            assignment: {
                id: "asg-1",
                effectiveFrom: "2026-10-12",
                effectiveTo: null,
            },
        }]);
    });

    it("falls back to shiftId and default in the batched roster", async () => {
        db.employee.findMany = vi.fn().mockResolvedValue([
            { employeeId: "EMP001", shiftId: "shift-a" },
            { employeeId: "EMP002", shiftId: null },
        ]);
        db.shiftAssignment.findMany.mockResolvedValue([]);
        db.workShift.findMany.mockResolvedValue([{ id: "shift-a" }]);
        db.workShift.findFirst.mockResolvedValue({ id: "shift-b" });
        const roster = await getRosterForDate("2026-10-12");
        expect(roster).toEqual([
            { employeeId: "EMP001", shiftId: "shift-a", source: "fallback", assignment: null },
            { employeeId: "EMP002", shiftId: "shift-b", source: "default", assignment: null },
        ]);
    });

    it("scopes assignment lookup and default decisions to active employees", async () => {
        db.employee.findMany.mockResolvedValue([
            { employeeId: "EMP001", shiftId: null },
        ]);
        db.shiftAssignment.findMany.mockResolvedValue([{
            id: "inactive-asg",
            employeeId: "INACTIVE001",
            shiftId: "shift-a",
            effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
            effectiveTo: null,
        }]);
        db.workShift.findFirst.mockResolvedValue({ id: "shift-b" });

        const roster = await getRosterForDate("2026-10-12");

        expect(db.shiftAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ employeeId: { in: ["EMP001"] } }),
        }));
        expect(db.workShift.findFirst).toHaveBeenCalledWith({
            where: { isDefault: true },
            select: { id: true },
        });
        expect(roster).toEqual([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            source: "default",
            assignment: null,
        }]);
    });
});

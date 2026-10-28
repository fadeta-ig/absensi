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

vi.mock("@/lib/timezone", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/timezone")>();
    return {
        ...actual,
        toWIBDateString: vi.fn(() => "2026-10-10"),
    };
});

import { prisma } from "@/lib/prisma";
import {
    assignShiftsBulk,
    cancelAssignment,
    countWorkingDaysForEmployee,
    getRosterForDate,
    getRosterTimeline,
    resolveShiftForDate,
    resolveShiftsForRange,
    updateAssignmentEnd,
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
        db.shiftAssignment.findUnique.mockResolvedValue(null);
        db.employee.findUnique.mockResolvedValue({ shiftId: "shift-a" });
        db.workShift.findUnique.mockResolvedValue(shiftA);
        db.workShift.findFirst.mockResolvedValue(shiftB);
        db.workShift.findMany.mockResolvedValue([{ id: "shift-a" }, { id: "shift-b" }]);
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

    it("truncates an existing open or bounded assignment that starts before the new period", async () => {
        db.shiftAssignment.findMany.mockResolvedValueOnce([{
            id: "asg-prev",
            shiftId: "shift-a",
            effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
            effectiveTo: null,
        }]);
        db.shiftAssignment.findFirst.mockResolvedValue(null);
        db.shiftAssignment.update.mockResolvedValue({ id: "asg-prev" });
        db.shiftAssignment.create.mockResolvedValue({ id: "asg-new" });

        const outcome = await assignShiftsBulk([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: "2026-10-12",
        }]);

        expect(outcome.applied).toBe(1);
        expect(db.shiftAssignment.update).toHaveBeenCalledWith({
            where: { id: "asg-prev" },
            data: { effectiveTo: new Date("2026-10-12T00:00:00.000Z") },
        });
        expect(db.shiftAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ employeeId: "EMP001", shiftId: "shift-b" }),
        }));
    });

    it("splits an existing assignment when a bounded period is inserted in the middle", async () => {
        db.shiftAssignment.findMany.mockResolvedValueOnce([{
            id: "asg-wide",
            shiftId: "shift-a",
            effectiveFrom: new Date("2026-10-05T00:00:00.000Z"),
            effectiveTo: new Date("2026-10-25T00:00:00.000Z"),
        }]);
        db.shiftAssignment.findFirst.mockResolvedValue(null);
        db.shiftAssignment.update.mockResolvedValue({ id: "asg-wide" });
        db.shiftAssignment.create.mockResolvedValue({ id: "asg-created" });

        const outcome = await assignShiftsBulk([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: "2026-10-12",
            effectiveTo: "2026-10-19",
        }]);

        expect(outcome.applied).toBe(1);
        expect(outcome.plan[0].actions).toEqual([
            expect.objectContaining({ type: "truncate", assignmentId: "asg-wide", resultFrom: "2026-10-05", resultTo: "2026-10-12" }),
            expect.objectContaining({ type: "split", assignmentId: "asg-wide", resultFrom: "2026-10-19", resultTo: "2026-10-25" }),
        ]);
        expect(db.shiftAssignment.update).toHaveBeenCalledWith({
            where: { id: "asg-wide" },
            data: { effectiveTo: new Date("2026-10-12T00:00:00.000Z") },
        });
        expect(db.shiftAssignment.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
            data: expect.objectContaining({
                employeeId: "EMP001",
                shiftId: "shift-a",
                effectiveFrom: new Date("2026-10-19T00:00:00.000Z"),
                effectiveTo: new Date("2026-10-25T00:00:00.000Z"),
            }),
        }));
        expect(db.shiftAssignment.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
            data: expect.objectContaining({
                employeeId: "EMP001",
                shiftId: "shift-b",
                effectiveFrom: new Date("2026-10-12T00:00:00.000Z"),
                effectiveTo: new Date("2026-10-19T00:00:00.000Z"),
            }),
        }));
    });

    it("rejects overlapping future assignments by default and replaces/trims them when replaceFuture is true", async () => {
        db.shiftAssignment.findMany.mockResolvedValueOnce([{
            id: "asg-future",
            shiftId: "shift-a",
            effectiveFrom: new Date("2026-10-12T00:00:00.000Z"),
            effectiveTo: new Date("2026-10-20T00:00:00.000Z"),
        }]);

        await expect(assignShiftsBulk([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: "2026-10-12",
            effectiveTo: "2026-10-15",
        }])).rejects.toMatchObject({ code: "OVERLAP", statusCode: 409 });

        // With replaceFuture: true, trims the start of the existing assignment to 2026-10-15
        db.shiftAssignment.findMany.mockResolvedValueOnce([{
            id: "asg-future",
            shiftId: "shift-a",
            effectiveFrom: new Date("2026-10-12T00:00:00.000Z"),
            effectiveTo: new Date("2026-10-20T00:00:00.000Z"),
        }]);
        db.shiftAssignment.findFirst.mockResolvedValue(null);
        db.shiftAssignment.update.mockResolvedValue({ id: "asg-future" });
        db.shiftAssignment.create.mockResolvedValue({ id: "asg-new" });

        const outcome = await assignShiftsBulk([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: "2026-10-12",
            effectiveTo: "2026-10-15",
        }], "user-1", { replaceFuture: true });

        expect(outcome.applied).toBe(1);
        expect(db.shiftAssignment.update).toHaveBeenCalledWith({
            where: { id: "asg-future" },
            data: { effectiveFrom: new Date("2026-10-15T00:00:00.000Z") },
        });
    });

    it("supports dryRun mode and rolls back without persisting changes", async () => {
        db.shiftAssignment.findMany
            .mockResolvedValueOnce([{
                id: "asg-open",
                shiftId: "shift-a",
                effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
                effectiveTo: null,
            }])
            .mockResolvedValueOnce([{
                id: "asg-split-tail",
                shiftId: "shift-a",
                effectiveFrom: new Date("2026-10-19T00:00:00.000Z"),
                effectiveTo: null,
                shift: shiftA,
            }]);
        db.shiftAssignment.findFirst.mockResolvedValue(null);
        db.shiftAssignment.update.mockResolvedValue({ id: "asg-open" });
        db.shiftAssignment.create.mockResolvedValue({ id: "asg-temp" });

        const outcome = await assignShiftsBulk([{
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: "2026-10-12",
            effectiveTo: "2026-10-19",
        }], null, { dryRun: true });

        expect(outcome.dryRun).toBe(true);
        expect(outcome.applied).toBe(0);
        expect(outcome.plan[0].after).toEqual({
            date: "2026-10-19",
            shiftId: "shift-a",
            source: "assignment",
        });
    });

    it("rejects two open-ended items with the same start date in one batch as 409 OVERLAP", async () => {
        await expect(assignShiftsBulk([
            { employeeId: "EMP001", shiftId: "shift-a", effectiveFrom: "2026-10-12" },
            { employeeId: "EMP001", shiftId: "shift-b", effectiveFrom: "2026-10-12" },
        ])).rejects.toMatchObject({ code: "OVERLAP", statusCode: 409 });
    });

    it("counts working days per-date across a rotation in a single range query", async () => {
        db.shiftAssignment.findMany.mockResolvedValue([{
            shiftId: "shift-b",
            effectiveFrom: new Date("2026-10-12T00:00:00.000Z"),
            effectiveTo: null,
            shift: {
                ...shiftB,
                days: [{ dayOfWeek: 1, startTime: "15:00", endTime: "23:00", isOff: true }],
            },
        }]);
        // 5-11 Okt: shift A (Senin masuk, hanya Minggu libur) = 6 hari;
        // 12 Okt: shift B Senin off = 0. Total 6 — membuktikan hitung per tanggal.
        const count = await countWorkingDaysForEmployee(db as never, "EMP001", "2026-10-05", "2026-10-12");
        expect(count).toBe(6);
        expect(db.shiftAssignment.findMany).toHaveBeenCalledTimes(1);
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
        expect(db.shiftAssignment.findMany).toHaveBeenCalledTimes(1);
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

    it("allows cancelling today's or future assignments and rejects past ones", async () => {
        db.shiftAssignment.findUnique.mockResolvedValue({
            id: "asg-today",
            shiftId: "shift-b",
            effectiveFrom: new Date("2026-10-10T00:00:00.000Z"),
            effectiveTo: null,
        });
        db.shiftAssignment.delete.mockResolvedValue({ id: "asg-today" });
        db.shiftAssignment.findFirst.mockResolvedValue({ id: "asg-previous", shiftId: "shift-a" });
        db.shiftAssignment.update.mockResolvedValue({ id: "asg-previous" });

        const cancelled = await cancelAssignment("EMP001", "2026-10-10");
        expect(cancelled.id).toBe("asg-today");
        expect(db.shiftAssignment.delete).toHaveBeenCalledWith({ where: { id: "asg-today" } });
        expect(db.shiftAssignment.update).toHaveBeenCalledWith({
            where: { id: "asg-previous" },
            data: { effectiveTo: null },
        });

        await expect(cancelAssignment("EMP001", "2026-10-09"))
            .rejects.toMatchObject({ code: "INVALID_RANGE", statusCode: 409 });

        db.shiftAssignment.findUnique.mockResolvedValue(null);
        await expect(cancelAssignment("EMP001", "2999-01-06"))
            .rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
    });

    it("merges predecessor and successor when they share the same shift upon cancelling a split middle assignment", async () => {
        const middleEnd = new Date("2999-01-19T00:00:00.000Z");
        db.shiftAssignment.findUnique
            .mockResolvedValueOnce({
                id: "asg-middle",
                shiftId: "shift-b",
                effectiveFrom: new Date("2999-01-12T00:00:00.000Z"),
                effectiveTo: middleEnd,
            })
            .mockResolvedValueOnce({
                id: "asg-tail",
                shiftId: "shift-a",
                effectiveTo: null,
            });
        db.shiftAssignment.findFirst.mockResolvedValueOnce({
            id: "asg-head",
            shiftId: "shift-a",
        });

        const result = await cancelAssignment("EMP001", "2999-01-12");

        expect(result.extendedPreviousId).toBe("asg-head");
        expect(result.mergedSuccessorId).toBe("asg-tail");
        expect(db.shiftAssignment.delete).toHaveBeenCalledWith({ where: { id: "asg-tail" } });
        expect(db.shiftAssignment.update).toHaveBeenCalledWith({
            where: { id: "asg-head" },
            data: { effectiveTo: null },
        });
    });

    it("updates an assignment end date and prevents overlapping the next assignment", async () => {
        db.shiftAssignment.findUnique.mockResolvedValue({
            id: "asg-1",
            shiftId: "shift-b",
            effectiveTo: null,
        });
        db.shiftAssignment.findFirst.mockResolvedValue({
            effectiveFrom: new Date("2026-10-20T00:00:00.000Z"),
        });
        db.shiftAssignment.update.mockResolvedValue({ id: "asg-1" });

        const updated = await updateAssignmentEnd("EMP001", "2026-10-10", "2026-10-18");
        expect(updated.changed).toBe(true);
        expect(updated.effectiveTo).toBe("2026-10-18");

        await expect(updateAssignmentEnd("EMP001", "2026-10-10", "2026-10-25")).rejects.toMatchObject({
            code: "OVERLAP",
            statusCode: 409,
        });
    });

    it("builds a multi-day roster timeline with per-day cells", async () => {
        db.employee.findMany.mockResolvedValue([{ employeeId: "EMP001", shiftId: "shift-a" }]);
        db.workShift.findMany.mockResolvedValue([{ id: "shift-a", isDefault: true }, { id: "shift-b", isDefault: false }]);
        db.shiftAssignment.findMany.mockResolvedValue([{
            id: "asg-1",
            employeeId: "EMP001",
            shiftId: "shift-b",
            effectiveFrom: new Date("2026-10-11T00:00:00.000Z"),
            effectiveTo: new Date("2026-10-13T00:00:00.000Z"),
        }]);

        const timeline = await getRosterTimeline("2026-10-10", 4);
        expect(timeline.days).toBe(4);
        expect(timeline.employees[0].cells).toEqual([
            { date: "2026-10-10", shiftId: "shift-a", source: "fallback", assignmentId: null },
            { date: "2026-10-11", shiftId: "shift-b", source: "assignment", assignmentId: "asg-1" },
            { date: "2026-10-12", shiftId: "shift-b", source: "assignment", assignmentId: "asg-1" },
            { date: "2026-10-13", shiftId: "shift-a", source: "fallback", assignmentId: null },
        ]);
    });

    it("resolves a date range in batch via resolveShiftsForRange", async () => {
        db.shiftAssignment.findMany.mockResolvedValue([{
            id: "asg-1",
            shiftId: "shift-b",
            effectiveFrom: new Date("2026-10-11T00:00:00.000Z"),
            effectiveTo: null,
            shift: shiftB,
        }]);
        const days = await resolveShiftsForRange(db as never, "EMP001", "2026-10-10", "2026-10-12");
        expect(days.map((d) => ({ date: d.date, source: d.shift?.source, shiftId: d.shift?.shiftId }))).toEqual([
            { date: "2026-10-10", source: "fallback", shiftId: "shift-a" },
            { date: "2026-10-11", source: "assignment", shiftId: "shift-b" },
            { date: "2026-10-12", source: "assignment", shiftId: "shift-b" },
        ]);
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

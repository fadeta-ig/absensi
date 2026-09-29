import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
    assignShiftsBulk,
    cancelAssignment,
    getRosterForDate,
    resolveShiftForDate,
    ShiftAssignmentError,
} from "@/lib/services/shiftAssignmentService";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

describeWithDatabase("shift roster database integration", () => {
    const suffix = `${Date.now()}`;
    const employeeId = `ATT_TEST_ROSTER_${suffix}`;
    let employeeRecordId = "";
    let shiftDayId = "";
    let shiftNightId = "";

    beforeAll(async () => {
        const url = new URL(process.env.DATABASE_URL ?? "");
        if (url.pathname.slice(1) !== "hris_attendance_test") {
            throw new Error(`Refusing roster integration target: ${url.pathname.slice(1) || "unknown"}`);
        }
        const [department, position, shiftDay, shiftNight] = await Promise.all([
            prisma.department.findFirst({ where: { isActive: true }, select: { id: true } }),
            prisma.position.findFirst({ where: { isActive: true }, select: { id: true } }),
            prisma.workShift.findFirst({ where: { name: { contains: "Pagi" } }, select: { id: true } }),
            prisma.workShift.findFirst({ where: { name: { contains: "Malam" } }, select: { id: true } }),
        ]);
        if (!department || !position || !shiftDay || !shiftNight) {
            throw new Error("Reference data unavailable for roster integration test.");
        }
        shiftDayId = shiftDay.id;
        shiftNightId = shiftNight.id;
        const employee = await prisma.employee.create({
            data: {
                employeeId,
                name: "ATT_TEST Roster",
                email: `roster-${suffix}@example.invalid`,
                phone: "0000000000",
                departmentId: department.id,
                positionId: position.id,
                joinDate: new Date("2035-01-01T00:00:00.000Z"),
                isActive: true,
                shiftId: shiftDayId,
            },
        });
        employeeRecordId = employee.id;
    });

    afterAll(async () => {
        await prisma.shiftAssignment.deleteMany({ where: { employeeId } });
        if (employeeRecordId) await prisma.employee.deleteMany({ where: { id: employeeRecordId } });
    });

    it("chains assignments and resolves the shift per date", async () => {
        const outcome = await assignShiftsBulk([
            { employeeId, shiftId: shiftDayId, effectiveFrom: "2035-02-01" },
            { employeeId, shiftId: shiftNightId, effectiveFrom: "2035-02-09" },
            { employeeId, shiftId: shiftDayId, effectiveFrom: "2035-02-16" },
        ]);
        expect(outcome.applied).toBe(3);

        const before = await resolveShiftForDate(prisma, employeeId, "2035-02-05");
        expect(before?.shiftId).toBe(shiftDayId);
        expect(before?.source).toBe("assignment");

        const after = await resolveShiftForDate(prisma, employeeId, "2035-02-10");
        expect(after?.shiftId).toBe(shiftNightId);

        const roster = await getRosterForDate("2035-02-10");
        expect(roster.find((r) => r.employeeId === employeeId)?.shiftId).toBe(shiftNightId);

        await cancelAssignment(employeeId, "2035-02-09");
        const predecessor = await prisma.shiftAssignment.findUnique({
            where: {
                employeeId_effectiveFrom: {
                    employeeId,
                    effectiveFrom: new Date("2035-02-01T00:00:00.000Z"),
                },
            },
            select: { effectiveTo: true },
        });
        expect(predecessor?.effectiveTo).toEqual(new Date("2035-02-16T00:00:00.000Z"));
        expect((await resolveShiftForDate(prisma, employeeId, "2035-02-10"))?.shiftId).toBe(shiftDayId);
    });

    it("rejects overlapping assignments", async () => {
        await expect(assignShiftsBulk([{
            employeeId,
            shiftId: shiftDayId,
            effectiveFrom: "2035-02-05",
            effectiveTo: "2035-02-15",
        }])).rejects.toMatchObject({ code: "OVERLAP", statusCode: 409 });
    });

    it("rejects unknown employees and shifts", async () => {
        await expect(assignShiftsBulk([{
            employeeId: "ATT_TEST_MISSING",
            shiftId: shiftDayId,
            effectiveFrom: "2035-03-01",
        }])).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
        expect(ShiftAssignmentError).toBeDefined();
    });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
    AttendanceCorrectionError,
    resolveCorrection,
    submitCorrection,
} from "@/lib/services/attendanceCorrectionService";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

describeWithDatabase("attendance correction database integration", () => {
    const suffix = `${Date.now()}`;
    const employeeId = `ATT_TEST_CORR_${suffix}`;
    const targetDate = "2035-01-20";
    let employeeRecordId = "";    let shiftId = "";

    beforeAll(async () => {
        const url = new URL(process.env.DATABASE_URL ?? "");
        if (url.pathname.slice(1) !== "hris_attendance_test") {
            throw new Error(`Refusing correction integration target: ${url.pathname.slice(1) || "unknown"}`);
        }
        const [department, position] = await Promise.all([
            prisma.department.findFirst({ where: { isActive: true }, select: { id: true } }),
            prisma.position.findFirst({ where: { isActive: true }, select: { id: true } }),
        ]);
        if (!department || !position) throw new Error("Reference data unavailable for correction integration test.");
        const shift = await prisma.workShift.create({
            data: {
                name: `ATT_TEST_CORR_SHIFT_${suffix}`,
                lateCheckIn: 0,
                earlyCheckIn: 120,
                lateCheckOut: 0,
                earlyCheckOut: 0,
                days: {
                    create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                        dayOfWeek, startTime: "08:00", endTime: "17:00", isOff: false,
                    })),
                },
            },
        });
        shiftId = shift.id;
        const employee = await prisma.employee.create({
            data: {
                employeeId,
                name: "Attendance Correction Integration Test",
                email: `attendance-correction-${suffix}@example.invalid`,
                phone: "0000000000",
                departmentId: department.id,
                positionId: position.id,
                joinDate: new Date("2035-01-01T00:00:00.000Z"),
                isActive: true,
                shiftId,
            },
        });
        employeeRecordId = employee.id;
    });

    afterAll(async () => {
        await prisma.attendanceCorrection.deleteMany({ where: { employeeId } });
        await prisma.leaveRequest.deleteMany({ where: { employeeId } });
        await prisma.attendanceRecord.deleteMany({ where: { employeeId } });
        if (employeeRecordId) await prisma.employee.deleteMany({ where: { id: employeeRecordId } });
        if (shiftId) await prisma.workShift.deleteMany({ where: { id: shiftId } });
    });

    it("deduplicates pending requests and resolves a NULL-manager correction atomically", async () => {
        const input = {
            employeeId,
            targetDate,
            proposedClockIn: "2035-01-20T23:00:00+07:00",
            proposedClockOut: "2035-01-21T07:00:00+07:00",
            reason: "ATT_TEST overnight correction",
        };
        const submissions = await Promise.allSettled([submitCorrection(input), submitCorrection(input)]);
        expect(submissions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejectedSubmission = submissions.find((result) => result.status === "rejected");
        expect(rejectedSubmission?.status).toBe("rejected");
        if (rejectedSubmission?.status === "rejected") {
            expect(rejectedSubmission.reason).toBeInstanceOf(AttendanceCorrectionError);
            expect(rejectedSubmission.reason.code).toBe("PENDING_EXISTS");
        }

        const pending = await prisma.attendanceCorrection.findMany({ where: { employeeId, status: "PENDING" } });
        expect(pending).toHaveLength(1);
        expect(pending[0].assignedManagerId).toBeNull();

        const resolutions = await Promise.allSettled([
            resolveCorrection(pending[0].id, "APPROVED", "WIG001"),
            resolveCorrection(pending[0].id, "REJECTED", "WIG001"),
        ]);
        expect(resolutions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejectedResolution = resolutions.find((result) => result.status === "rejected");
        expect(rejectedResolution?.status).toBe("rejected");
        if (rejectedResolution?.status === "rejected") {
            expect(rejectedResolution.reason).toBeInstanceOf(AttendanceCorrectionError);
            expect(rejectedResolution.reason.code).toBe("ALREADY_PROCESSED");
        }

        const storedCorrection = await prisma.attendanceCorrection.findUniqueOrThrow({ where: { id: pending[0].id } });
        if (storedCorrection.status === "APPROVED") {
            const attendance = await prisma.attendanceRecord.findUniqueOrThrow({
                where: { employeeId_date: { employeeId, date: new Date(`${targetDate}T00:00:00.000Z`) } },
            });
            expect(attendance.clockIn?.toISOString()).toBe("2035-01-20T16:00:00.000Z");
            expect(attendance.clockOut?.toISOString()).toBe("2035-01-21T00:00:00.000Z");
        } else {
            expect(storedCorrection.status).toBe("REJECTED");
            expect(await prisma.attendanceRecord.count({ where: { employeeId } })).toBe(0);
        }
    });

    it("recomputes late to present and blocks correction on pending/approved leave", async () => {
        const recomputeDate = "2035-01-22";
        await prisma.attendanceRecord.create({
            data: {
                employeeId,
                date: new Date(`${recomputeDate}T00:00:00.000Z`),
                clockIn: new Date("2035-01-22T02:00:00.000Z"), // 09:00 WIB, late
                status: "late",
            },
        });
        const correction = await submitCorrection({
            employeeId,
            targetDate: recomputeDate,
            proposedClockIn: "2035-01-22T07:59:00+07:00",
            reason: "ATT_TEST recompute status",
        });
        await resolveCorrection(correction.id, "APPROVED", "WIG001");
        const updatedAttendance = await prisma.attendanceRecord.findUniqueOrThrow({
            where: { employeeId_date: { employeeId, date: new Date(`${recomputeDate}T00:00:00.000Z`) } },
        });
        expect(updatedAttendance.status).toBe("present");

        const leaveDate = "2035-01-23";
        const leave = await prisma.leaveRequest.create({
            data: {
                employeeId,
                type: "sick",
                startDate: new Date(`${leaveDate}T00:00:00.000Z`),
                endDate: new Date(`${leaveDate}T00:00:00.000Z`),
                reason: "ATT_TEST leave conflict",
                status: "pending",
            },
        });
        await expect(submitCorrection({
            employeeId,
            targetDate: leaveDate,
            proposedClockIn: `${leaveDate}T08:00:00+07:00`,
            reason: "ATT_TEST conflicting correction",
        })).rejects.toMatchObject({ code: "LEAVE_CONFLICT", statusCode: 409 });
        expect(await prisma.attendanceCorrection.count({ where: { employeeId, targetDate: new Date(`${leaveDate}T00:00:00.000Z`) } })).toBe(0);

        await prisma.leaveRequest.update({ where: { id: leave.id }, data: { status: "approved" } });
        await expect(submitCorrection({
            employeeId,
            targetDate: leaveDate,
            proposedClockIn: `${leaveDate}T08:00:00+07:00`,
            reason: "ATT_TEST approved leave conflict",
        })).rejects.toMatchObject({ code: "LEAVE_CONFLICT", statusCode: 409 });
    });

    it("accepts overnight H+1 clock-in and attributes it to the shift date", async () => {
        const nightSuffix = `${Date.now()}-night`;
        const nightEmployeeId = `ATT_TEST_NIGHT_${nightSuffix}`;
        const department = await prisma.department.findFirst({ where: { isActive: true }, select: { id: true } });
        const position = await prisma.position.findFirst({ where: { isActive: true }, select: { id: true } });
        if (!department || !position) throw new Error("Reference data unavailable.");
        const nightShift = await prisma.workShift.create({
            data: {
                name: `ATT_TEST_NIGHT_SHIFT_${nightSuffix}`,
                lateCheckIn: 15,
                earlyCheckIn: 30,
                lateCheckOut: 60,
                earlyCheckOut: 0,
                days: {
                    create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                        dayOfWeek, startTime: "23:00", endTime: "07:00", isOff: false,
                    })),
                },
            },
        });
        const nightEmployee = await prisma.employee.create({
            data: {
                employeeId: nightEmployeeId,
                name: "ATT_TEST Night",
                email: `night-${nightSuffix}@example.invalid`,
                phone: "0000000000",
                departmentId: department.id,
                positionId: position.id,
                joinDate: new Date("2035-01-01T00:00:00.000Z"),
                isActive: true,
                shiftId: nightShift.id,
            },
        });
        try {
            const h1Date = "2035-01-27"; // Monday
            const correction = await submitCorrection({
                employeeId: nightEmployeeId,
                targetDate: h1Date,
                proposedClockIn: "2035-01-28T00:01:00+07:00",
                reason: "ATT_TEST overnight H+1",
            });
            expect(correction.targetDate).toBe(h1Date);
            await resolveCorrection(correction.id, "APPROVED", "WIG001");
            const attendance = await prisma.attendanceRecord.findUniqueOrThrow({
                where: { employeeId_date: { employeeId: nightEmployeeId, date: new Date(`${h1Date}T00:00:00.000Z`) } },
            });
            expect(attendance.clockIn?.toISOString()).toBe("2035-01-27T17:01:00.000Z");
            expect(attendance.status).toBe("late");
        } finally {
            await prisma.attendanceCorrection.deleteMany({ where: { employeeId: nightEmployeeId } });
            await prisma.attendanceRecord.deleteMany({ where: { employeeId: nightEmployeeId } });
            await prisma.employee.deleteMany({ where: { id: nightEmployee.id } });
            await prisma.workShift.deleteMany({ where: { id: nightShift.id } });
        }
    });
});

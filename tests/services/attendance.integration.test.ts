import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
    AttendanceMutationError,
    performAttendanceMutation,
} from "@/lib/services/attendanceService";

const describeWithDatabase = process.env.RUN_DB_INTEGRATION === "1" ? describe : describe.skip;

describeWithDatabase("attendance mutation database integration", () => {
    const suffix = `${Date.now()}`;
    const employeeId = `ATT_TEST_${suffix}`;
    const shiftName = `ATT_TEST_SHIFT_${suffix}`;
    const offDayShiftName = `ATT_TEST_OFF_SHIFT_${suffix}`;
    const shiftDate = "2035-01-15";
    let shiftId = "";
    let offDayShiftId = "";

    beforeAll(async () => {
        const url = new URL(process.env.DATABASE_URL ?? "");
        const databaseName = url.pathname.slice(1);
        if (databaseName !== "hris_attendance_test") {
            throw new Error(`Refusing attendance integration target: ${databaseName || "unknown"}`);
        }

        const [department, position] = await Promise.all([
            prisma.department.findFirst({ where: { isActive: true }, select: { id: true } }),
            prisma.position.findFirst({ where: { isActive: true }, select: { id: true } }),
        ]);
        if (!department || !position) throw new Error("Reference data is unavailable for attendance integration tests.");

        const shift = await prisma.workShift.create({
            data: {
                name: shiftName,
                earlyCheckIn: 30,
                lateCheckIn: 15,
                earlyCheckOut: 0,
                lateCheckOut: 60,
                days: {
                    create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                        dayOfWeek,
                        startTime: "23:00",
                        endTime: "07:00",
                        isOff: false,
                    })),
                },
            },
        });
        shiftId = shift.id;
        const offDayShift = await prisma.workShift.create({
            data: {
                name: offDayShiftName,
                days: {
                    create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                        dayOfWeek,
                        startTime: "08:00",
                        endTime: "17:00",
                        isOff: true,
                    })),
                },
            },
        });
        offDayShiftId = offDayShift.id;

        await prisma.employee.create({
            data: {
                employeeId,
                name: "ATT_TEST Attendance Integration",
                email: `attendance-${suffix}@example.invalid`,
                phone: "0000000000",
                departmentId: department.id,
                positionId: position.id,
                joinDate: new Date("2035-01-01T00:00:00.000Z"),
                shiftId,
                isActive: true,
            },
        });
    });

    afterAll(async () => {
        await prisma.attendanceRecord.deleteMany({ where: { employeeId } });
        await prisma.shiftAssignment.deleteMany({ where: { employeeId } });
        await prisma.employee.deleteMany({ where: { employeeId } });
        await prisma.workShift.deleteMany({ where: { name: { in: [shiftName, offDayShiftName] } } });
    });

    it("records one clock-in and one clock-out under concurrent requests", async () => {
        const clockInNow = new Date("2035-01-15T16:00:00.000Z"); // 23:00 WIB
        const clockInInput = {
            employeeId,
            expectedAction: "CLOCK_IN" as const,
            expectedShiftDate: shiftDate,
            now: clockInNow,
            photo: "ATT_TEST_CLOCK_IN_PHOTO",
            location: null,
        };

        const clockInResults = await Promise.allSettled([
            performAttendanceMutation(clockInInput),
            performAttendanceMutation(clockInInput),
        ]);

        expect(clockInResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejectedClockIn = clockInResults.find((result) => result.status === "rejected");
        expect(rejectedClockIn?.status).toBe("rejected");
        if (rejectedClockIn?.status === "rejected") {
            expect(rejectedClockIn.reason).toBeInstanceOf(AttendanceMutationError);
            expect(rejectedClockIn.reason.statusCode).toBe(409);
        }

        const openRows = await prisma.attendanceRecord.findMany({ where: { employeeId } });
        expect(openRows).toHaveLength(1);
        expect(openRows[0].clockIn?.toISOString()).toBe(clockInNow.toISOString());
        expect(openRows[0].clockOut).toBeNull();

        const clockOutNow = new Date("2035-01-16T08:30:00.000Z"); // 15:30 WIB, after old 14:00 cutoff
        const clockOutInput = {
            ...clockInInput,
            expectedAction: "CLOCK_OUT" as const,
            now: clockOutNow,
            photo: "ATT_TEST_CLOCK_OUT_PHOTO",
        };
        const clockOutResults = await Promise.allSettled([
            performAttendanceMutation(clockOutInput),
            performAttendanceMutation(clockOutInput),
        ]);

        expect(clockOutResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejectedClockOut = clockOutResults.find((result) => result.status === "rejected");
        expect(rejectedClockOut?.status).toBe("rejected");
        if (rejectedClockOut?.status === "rejected") {
            expect(rejectedClockOut.reason).toBeInstanceOf(AttendanceMutationError);
            expect(rejectedClockOut.reason.statusCode).toBe(409);
        }

        const completed = await prisma.attendanceRecord.findMany({ where: { employeeId } });
        expect(completed).toHaveLength(1);
        expect(completed[0].clockOut?.toISOString()).toBe(clockOutNow.toISOString());
        expect(completed[0].clockOutPhoto).toBe("ATT_TEST_CLOCK_OUT_PHOTO");
    });

    it("waits for a concurrent roster commit before resolving the attendance shift", async () => {
        const rosterDate = "2035-01-17";
        const rosterStaged = deferred<void>();
        const allowRosterCommit = deferred<void>();
        const rosterTransaction = prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT employee_id FROM employees WHERE employee_id = ${employeeId} FOR UPDATE
            `;
            await tx.shiftAssignment.create({
                data: {
                    employeeId,
                    shiftId: offDayShiftId,
                    effectiveFrom: new Date(`${rosterDate}T00:00:00.000Z`),
                },
            });
            rosterStaged.resolve();
            await withTimeout(allowRosterCommit.promise, 5_000, "roster commit gate");
        }, { maxWait: 5_000, timeout: 10_000 });
        const rosterReady = Promise.race([
            rosterStaged.promise,
            rosterTransaction.then(() => {
                throw new Error("Roster transaction committed before the staging gate was observed.");
            }),
        ]);

        let attendanceMutation: ReturnType<typeof performAttendanceMutation> | undefined;

        try {
            await withTimeout(rosterReady, 5_000, "roster transaction staging");
            attendanceMutation = performAttendanceMutation({
                employeeId,
                expectedAction: "CLOCK_IN",
                expectedShiftDate: rosterDate,
                now: new Date("2035-01-17T05:00:00.000Z"), // 12:00 WIB
                photo: "ATT_TEST_LOCKED_ROSTER_PHOTO",
                location: null,
                offDayReason: "ATT_TEST roster committed",
            });
            await expectPending(attendanceMutation, 150);
            allowRosterCommit.resolve();
            await withTimeout(rosterTransaction, 5_000, "roster transaction commit");

            const result = await withTimeout(attendanceMutation, 5_000, "attendance after roster commit");
            expect(result.target.shiftDate).toBe(rosterDate);
            expect(result.target.scheduleDay?.isOff).toBe(true);
            expect(result.isOffDay).toBe(true);
            expect(result.record.offDayReason).toBe("ATT_TEST roster committed");
        } finally {
            allowRosterCommit.resolve();
            await Promise.allSettled([
                rosterTransaction,
                ...(attendanceMutation ? [attendanceMutation] : []),
            ]);
        }
    });
});

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function expectPending(promise: Promise<unknown>, milliseconds: number): Promise<void> {
    const outcome = await Promise.race([
        promise.then(() => "settled" as const, () => "settled" as const),
        new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), milliseconds)),
    ]);
    expect(outcome).toBe("pending");
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), milliseconds);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

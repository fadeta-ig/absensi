import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const events: string[] = [];
    const tx = {
        $queryRaw: vi.fn(async () => {
            events.push("employee-lock");
            return [{ employee_id: "EMP001" }];
        }),
        attendanceRecord: {
            findUnique: vi.fn(async () => null),
            create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
                id: "attendance-1",
                ...args.data,
                clockOut: null,
                clockOutLocation: null,
                clockOutPhoto: null,
                notes: null,
            })),
            updateMany: vi.fn(),
            findUniqueOrThrow: vi.fn(),
        },
    };
    return {
        events,
        tx,
        transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
        resolveShiftForDate: vi.fn(async () => {
            events.push("shift-resolve");
            return {
                shiftId: "shift-1",
                shiftName: "Shift Pagi",
                source: "assignment" as const,
                days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                    dayOfWeek,
                    startTime: "08:00",
                    endTime: "17:00",
                    isOff: false,
                })),
                tolerance: {
                    earlyCheckIn: 30,
                    lateCheckIn: 15,
                    earlyCheckOut: 0,
                    lateCheckOut: 60,
                },
            };
        }),
    };
});

vi.mock("@/lib/prisma", () => ({
    prisma: {
        $transaction: mocks.transaction,
        attendanceRecord: { findUnique: vi.fn() },
    },
}));

vi.mock("@/lib/services/shiftAssignmentService", () => ({
    resolveShiftForDate: mocks.resolveShiftForDate,
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { performAttendanceMutation } from "@/lib/services/attendanceService";

describe("attendance mutation roster locking", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.events.length = 0;
    });

    it("locks the employee before resolving dated roster shifts", async () => {
        await performAttendanceMutation({
            employeeId: "EMP001",
            expectedAction: "CLOCK_IN",
            expectedShiftDate: "2026-09-29",
            now: new Date("2026-09-29T01:00:00.000Z"),
            photo: "data:image/jpeg;base64,test",
            location: null,
        });

        expect(mocks.events[0]).toBe("employee-lock");
        expect(mocks.events.slice(1)).toEqual(["shift-resolve", "shift-resolve"]);
        expect(mocks.resolveShiftForDate).toHaveBeenCalledTimes(2);
        expect(mocks.resolveShiftForDate).toHaveBeenCalledWith(mocks.tx, "EMP001", "2026-09-29");
        expect(mocks.resolveShiftForDate).toHaveBeenCalledWith(mocks.tx, "EMP001", "2026-09-28");
    });
});

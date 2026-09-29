import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    employeeFindUnique: vi.fn(),
    resolveShiftForDate: vi.fn(),
    resolveAttendanceTargetForEmployee: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: mocks.unauthorizedResponse,
    serverErrorResponse: mocks.serverErrorResponse,
}));
vi.mock("@/lib/networkValidator", () => ({
    extractClientIp: vi.fn(() => "192.168.20.10"),
    isOfficeWifiNetwork: vi.fn(() => true),
}));
vi.mock("@/lib/prisma", () => ({
    prisma: { employee: { findUnique: mocks.employeeFindUnique } },
}));
vi.mock("@/lib/services/shiftAssignmentService", () => ({
    resolveShiftForDate: mocks.resolveShiftForDate,
}));
vi.mock("@/lib/services/attendanceShiftHelper", () => ({
    resolveAttendanceTargetForEmployee: mocks.resolveAttendanceTargetForEmployee,
    isOvernightSchedule: vi.fn((startTime: string, endTime: string) => endTime < startTime),
}));

import { GET } from "@/app/api/attendance/network/route";

const scheduleDays = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startTime: "23:00",
    endTime: "07:00",
    isOff: false,
}));

describe("attendance network context", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-29T00:30:00.000Z"));
        vi.resetAllMocks();
        mocks.requireAuth.mockResolvedValue({ employeeId: "EMP001" });
        mocks.employeeFindUnique.mockResolvedValue({ bypassLocation: false, shiftId: "shift-today" });
        mocks.resolveShiftForDate.mockImplementation(async (_client: unknown, _employeeId: string, date: string) => ({
            shiftId: date === "2026-09-28" ? "shift-yesterday" : "shift-today",
            shiftName: date === "2026-09-28" ? "Shift Malam Lama" : "Shift Pagi Baru",
            days: scheduleDays,
            tolerance: { earlyCheckIn: 0, lateCheckIn: 0, earlyCheckOut: 0, lateCheckOut: 0 },
            source: "assignment",
        }));
        mocks.resolveAttendanceTargetForEmployee.mockResolvedValue({
            mode: "CLOCK_OUT",
            existingRecord: { id: "attendance-1" },
            shiftDate: "2026-09-28",
            scheduleDay: scheduleDays[1],
            isOvernight: true,
            relativeClockMinutes: 1890,
        });
    });

    afterEach(() => vi.useRealTimers());

    it("uses yesterday's shift name when the resolver targets yesterday", async () => {
        const response = await GET(new NextRequest("http://localhost/api/attendance/network"));

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.shiftDate).toBe("2026-09-28");
        expect(payload.shiftName).toBe("Shift Malam Lama");
        expect(payload.shiftName).not.toBe("Shift Pagi Baru");
    });
});

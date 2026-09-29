import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    employeeFindUnique: vi.fn(),
    resolveShiftForDate: vi.fn(),
    toWIBDateString: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: mocks.unauthorizedResponse,
    forbiddenResponse: mocks.forbiddenResponse,
    serverErrorResponse: mocks.serverErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({
    prisma: {
        employee: { findUnique: mocks.employeeFindUnique },
    },
}));

vi.mock("@/lib/services/shiftAssignmentService", () => ({
    resolveShiftForDate: mocks.resolveShiftForDate,
}));

vi.mock("@/lib/timezone", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/timezone")>();
    return {
        ...actual,
        toWIBDateString: mocks.toWIBDateString,
    };
});

import { GET } from "@/app/api/employee/shift-schedule/route";

const mockShift = {
    shiftId: "shift-1",
    shiftName: "Shift Pagi",
    source: "assignment",
    days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        startTime: "08:00",
        endTime: "16:00",
        isOff: dayOfWeek === 0 || dayOfWeek === 6,
    })),
};

describe("employee shift-schedule route", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.requireAuth.mockResolvedValue({ employeeId: "EMP001" });
        mocks.employeeFindUnique.mockResolvedValue({ id: "1" });
        mocks.toWIBDateString.mockReturnValue("2026-09-29");
        mocks.resolveShiftForDate.mockResolvedValue(mockShift);
    });

    it("requires authentication and an employee account", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        expect((await GET(new NextRequest("http://localhost/api/employee/shift-schedule"))).status).toBe(401);

        mocks.requireAuth.mockResolvedValue({ employeeId: null });
        expect((await GET(new NextRequest("http://localhost/api/employee/shift-schedule"))).status).toBe(403);
    });

    it("rejects invalid days parameter", async () => {
        expect((await GET(new NextRequest("http://localhost/api/employee/shift-schedule?days=40"))).status).toBe(400);
        expect((await GET(new NextRequest("http://localhost/api/employee/shift-schedule?days=0"))).status).toBe(400);
        expect((await GET(new NextRequest("http://localhost/api/employee/shift-schedule?days=abc"))).status).toBe(400);
    });

    it("returns schedule for the requested days (default 14)", async () => {
        const response = await GET(new NextRequest("http://localhost/api/employee/shift-schedule"));
        expect(response.status).toBe(200);
        const data = await response.json();
        
        expect(data).toHaveLength(14);
        expect(data[0].date).toBe("2026-09-29"); // Tuesday (dayOfWeek = 2 in UTC)
        expect(data[0].shiftName).toBe("Shift Pagi");
        expect(data[0].isOff).toBe(false);

        // check caching headers
        expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
});

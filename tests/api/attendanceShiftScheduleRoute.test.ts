import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    employeeFindUnique: vi.fn(),
    shiftFindUnique: vi.fn(),
    shiftFindFirst: vi.fn(),
    assignmentFindMany: vi.fn(),
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
        workShift: { findUnique: mocks.shiftFindUnique, findFirst: mocks.shiftFindFirst },
        shiftAssignment: { findMany: mocks.assignmentFindMany },
    },
}));

import { GET } from "@/app/api/attendance/shift-schedule/route";

const nightShift = {
    id: "shift-night",
    name: "Shift 3",
    days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        startTime: "23:00",
        endTime: "07:00",
        isOff: false,
    })),
};

describe("attendance shift-schedule route", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.requireAuth.mockResolvedValue({ employeeId: "EMP001" });
        mocks.employeeFindUnique.mockResolvedValue({ shiftId: "shift-night" });
        mocks.shiftFindUnique.mockResolvedValue(nightShift);
        mocks.assignmentFindMany.mockResolvedValue([]);
    });

    it("requires authentication and an employee account", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        expect((await GET(new NextRequest("http://localhost/api/attendance/shift-schedule?date=2026-09-28"))).status).toBe(401);

        mocks.requireAuth.mockResolvedValue({ employeeId: null });
        expect((await GET(new NextRequest("http://localhost/api/attendance/shift-schedule?date=2026-09-28"))).status).toBe(403);
    });

    it("rejects invalid dates", async () => {
        expect((await GET(new NextRequest("http://localhost/api/attendance/shift-schedule?date=besok"))).status).toBe(400);
    });

    it("returns the overnight schedule for the requested date", async () => {
        const response = await GET(new NextRequest("http://localhost/api/attendance/shift-schedule?date=2026-09-28"));
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({
            date: "2026-09-28",
            schedule: {
                shiftName: "Shift 3",
                startTime: "23:00",
                endTime: "07:00",
                isOff: false,
                isOvernight: true,
            },
        });
    });

    it("falls back to the default shift", async () => {
        mocks.employeeFindUnique.mockResolvedValue({ shiftId: null });
        mocks.shiftFindFirst.mockResolvedValue(nightShift);
        const response = await GET(new NextRequest("http://localhost/api/attendance/shift-schedule?date=2026-09-28"));
        expect(response.status).toBe(200);
        expect((await response.json()).schedule.isOvernight).toBe(true);
    });
});

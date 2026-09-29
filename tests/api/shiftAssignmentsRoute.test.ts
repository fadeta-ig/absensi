import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    getRosterForDate: vi.fn(),
    assignShiftsBulk: vi.fn(),
    cancelAssignment: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "unauthorized" }, { status: 401 })),
    forbiddenResponse: vi.fn(() => NextResponse.json({ error: "forbidden" }, { status: 403 })),
    serverErrorResponse: vi.fn(() => NextResponse.json({ error: "internal" }, { status: 500 })),
    validateBody: vi.fn(async (request: NextRequest, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) => {
        const parsed = schema.safeParse(await request.json());
        if (!parsed.success) {
            return { error: NextResponse.json({ error: "validation" }, { status: 400 }) };
        }
        return { data: parsed.data };
    }),
}));

vi.mock("@/lib/services/shiftAssignmentService", () => {
    class ShiftAssignmentError extends Error {
        constructor(
            message: string,
            public code: "OVERLAP" | "NOT_FOUND" | "INVALID_RANGE",
            public statusCode: number,
        ) {
            super(message);
        }
    }
    return {
        ShiftAssignmentError,
        getRosterForDate: mocks.getRosterForDate,
        assignShiftsBulk: mocks.assignShiftsBulk,
        cancelAssignment: mocks.cancelAssignment,
    };
});

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/timezone", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/timezone")>();
    return { ...actual, toWIBDateString: () => "2026-09-29" };
});

import { DELETE, GET } from "@/app/api/shifts/assignments/route";

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
    return new NextRequest(`http://localhost${path}`, init);
}

describe("shift assignments API route", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.requireAuth.mockResolvedValue({
            userId: "user-1",
            username: "WIG001",
            permissions: ["hr.manage"],
        });
    });

    it("exposes the exact active assignment interval for the selected roster date", async () => {
        mocks.getRosterForDate.mockResolvedValue([{
            employeeId: "EMP001",
            shiftId: "shift-night",
            source: "assignment",
            assignment: {
                id: "asg-future",
                effectiveFrom: "2026-10-05",
                effectiveTo: "2026-10-12",
            },
        }]);

        const response = await GET(request("/api/shifts/assignments?date=2026-10-06"));

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({
            date: "2026-10-06",
            today: "2026-09-29",
            roster: [{
                employeeId: "EMP001",
                shiftId: "shift-night",
                source: "assignment",
                assignment: {
                    id: "asg-future",
                    effectiveFrom: "2026-10-05",
                    effectiveTo: "2026-10-12",
                },
            }],
        });
        expect(mocks.getRosterForDate).toHaveBeenCalledWith("2026-10-06");
    });

    it("forwards exact employee and effective-from metadata when cancelling", async () => {
        const response = await DELETE(request("/api/shifts/assignments", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ employeeId: "EMP001", effectiveFrom: "2026-10-05" }),
        }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(mocks.cancelAssignment).toHaveBeenCalledWith("EMP001", "2026-10-05");
    });

    it("requires hr.manage before exposing roster assignment history", async () => {
        mocks.requireAuth.mockResolvedValue({ permissions: ["employee.self"] });

        const response = await GET(request("/api/shifts/assignments?date=2026-10-06"));

        expect(response.status).toBe(403);
        expect(mocks.getRosterForDate).not.toHaveBeenCalled();
    });
});

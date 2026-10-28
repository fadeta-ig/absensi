import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    getRosterForDate: vi.fn(),
    getRosterTimeline: vi.fn(),
    assignShiftsBulk: vi.fn(),
    cancelAssignment: vi.fn(),
    updateAssignmentEnd: vi.fn(),
    logAction: vi.fn(),
    actorFromSession: vi.fn((session: { userId?: string; username: string }) => ({
        userId: session.userId ?? null,
        identifier: session.username,
        type: "USER",
    })),
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
            public details?: unknown,
        ) {
            super(message);
        }
    }
    return {
        ShiftAssignmentError,
        ROSTER_TIMELINE_MAX_DAYS: 31,
        getRosterForDate: mocks.getRosterForDate,
        getRosterTimeline: mocks.getRosterTimeline,
        assignShiftsBulk: mocks.assignShiftsBulk,
        cancelAssignment: mocks.cancelAssignment,
        updateAssignmentEnd: mocks.updateAssignmentEnd,
    };
});

vi.mock("@/lib/services/auditService", () => ({
    logAction: mocks.logAction,
    actorFromSession: mocks.actorFromSession,
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/timezone", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/timezone")>();
    return { ...actual, toWIBDateString: () => "2026-09-29" };
});

import { DELETE, GET, PATCH, POST } from "@/app/api/shifts/assignments/route";
import { GET as GET_TIMELINE } from "@/app/api/shifts/assignments/timeline/route";

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

    it("records an audit log when assigning shifts and skips audit on dryRun", async () => {
        mocks.assignShiftsBulk.mockResolvedValueOnce({
            applied: 1,
            dryRun: false,
            results: [{ employeeId: "EMP001", shiftId: "shift-night", effectiveFrom: "2026-10-05", effectiveTo: null }],
            plan: [{ employeeId: "EMP001", shiftId: "shift-night", effectiveFrom: "2026-10-05", effectiveTo: null, actions: [], conflicts: [], after: null }],
            conflicts: [],
        });

        const response = await POST(request("/api/shifts/assignments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                assignments: [{ employeeId: "EMP001", shiftId: "shift-night", effectiveFrom: "2026-10-05" }],
                replaceFuture: true,
            }),
        }));

        expect(response.status).toBe(201);
        expect(mocks.assignShiftsBulk).toHaveBeenCalledWith(
            [{ employeeId: "EMP001", shiftId: "shift-night", effectiveFrom: "2026-10-05" }],
            "user-1",
            { replaceFuture: true, dryRun: undefined },
        );
        expect(mocks.logAction).toHaveBeenCalledWith(
            "ROSTER_ASSIGN_BULK",
            "ShiftAssignment",
            expect.objectContaining({ identifier: "WIG001" }),
            "EMP001",
            expect.objectContaining({ applied: 1, replaceFuture: true }),
        );

        // dryRun returns 200 and does not call logAction
        mocks.logAction.mockClear();
        mocks.assignShiftsBulk.mockResolvedValueOnce({
            applied: 0,
            dryRun: true,
            results: [],
            plan: [],
            conflicts: [],
        });
        const dryRes = await POST(request("/api/shifts/assignments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                assignments: [{ employeeId: "EMP001", shiftId: "shift-night", effectiveFrom: "2026-10-05" }],
                dryRun: true,
            }),
        }));
        expect(dryRes.status).toBe(200);
        expect(mocks.logAction).not.toHaveBeenCalled();
    });

    it("updates an assignment end date via PATCH and logs the audit entry", async () => {
        mocks.updateAssignmentEnd.mockResolvedValue({
            id: "asg-1",
            employeeId: "EMP001",
            shiftId: "shift-night",
            effectiveFrom: "2026-10-05",
            previousEffectiveTo: null,
            effectiveTo: "2026-10-12",
            changed: true,
        });

        const response = await PATCH(request("/api/shifts/assignments", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                employeeId: "EMP001",
                effectiveFrom: "2026-10-05",
                effectiveTo: "2026-10-12",
            }),
        }));

        expect(response.status).toBe(200);
        expect(mocks.updateAssignmentEnd).toHaveBeenCalledWith("EMP001", "2026-10-05", "2026-10-12");
        expect(mocks.logAction).toHaveBeenCalledWith(
            "ROSTER_UPDATE_END",
            "ShiftAssignment",
            expect.objectContaining({ identifier: "WIG001" }),
            "asg-1",
            expect.objectContaining({ effectiveTo: "2026-10-12" }),
        );
    });

    it("forwards exact employee and effective-from metadata when cancelling and logs audit", async () => {
        mocks.cancelAssignment.mockResolvedValue({
            id: "asg-future",
            employeeId: "EMP001",
            shiftId: "shift-night",
            effectiveFrom: "2026-10-05",
            effectiveTo: null,
            extendedPreviousId: null,
            mergedSuccessorId: null,
        });

        const response = await DELETE(request("/api/shifts/assignments", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ employeeId: "EMP001", effectiveFrom: "2026-10-05" }),
        }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            cancelled: {
                id: "asg-future",
                employeeId: "EMP001",
                shiftId: "shift-night",
                effectiveFrom: "2026-10-05",
                effectiveTo: null,
                extendedPreviousId: null,
                mergedSuccessorId: null,
            },
        });
        expect(mocks.cancelAssignment).toHaveBeenCalledWith("EMP001", "2026-10-05");
        expect(mocks.logAction).toHaveBeenCalledWith(
            "ROSTER_CANCEL",
            "ShiftAssignment",
            expect.objectContaining({ identifier: "WIG001" }),
            "asg-future",
            expect.objectContaining({ employeeId: "EMP001", effectiveFrom: "2026-10-05" }),
        );
    });

    it("serves the multi-day timeline endpoint and validates days", async () => {
        mocks.getRosterTimeline.mockResolvedValue({
            from: "2026-10-05",
            to: "2026-10-11",
            today: "2026-09-29",
            days: 7,
            defaultShiftId: "shift-day",
            employees: [],
            assignments: [],
        });

        const okRes = await GET_TIMELINE(request("/api/shifts/assignments/timeline?from=2026-10-05&days=7"));
        expect(okRes.status).toBe(200);
        expect(mocks.getRosterTimeline).toHaveBeenCalledWith("2026-10-05", 7);

        const badRes = await GET_TIMELINE(request("/api/shifts/assignments/timeline?days=99"));
        expect(badRes.status).toBe(400);
    });

    it("requires hr.manage before exposing roster assignment history", async () => {
        mocks.requireAuth.mockResolvedValue({ permissions: ["employee.self"] });

        const response = await GET(request("/api/shifts/assignments?date=2026-10-06"));

        expect(response.status).toBe(403);
        expect(mocks.getRosterForDate).not.toHaveBeenCalled();
    });
});

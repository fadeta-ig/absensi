import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    validateBody: vi.fn(),
    createLeaveRequest: vi.fn(),
    employeeFindUnique: vi.fn(),
    workShiftFindUnique: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "unauthorized" }, { status: 401 })),
    forbiddenResponse: vi.fn(() => NextResponse.json({ error: "forbidden" }, { status: 403 })),
    validateBody: mocks.validateBody,
    serverErrorResponse: vi.fn(() => NextResponse.json({ error: "internal" }, { status: 500 })),
}));

vi.mock("@/lib/services/leaveService", () => ({
    getLeaveRequests: vi.fn(),
    createLeaveRequest: mocks.createLeaveRequest,
    updateLeaveRequest: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        employee: { findUnique: mocks.employeeFindUnique },
        workShift: { findUnique: mocks.workShiftFindUnique },
    },
}));

vi.mock("@/lib/services/auditService", () => ({
    actorFromSession: vi.fn(() => ({ id: "user-1" })),
    logAction: vi.fn(async () => undefined),
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/leave/route";

describe("leave POST dated-roster authority", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.requireAuth.mockResolvedValue({
            employeeId: "EMP001",
            username: "employee-1",
            permissions: ["employee.self"],
        });
        mocks.validateBody.mockResolvedValue({
            data: {
                type: "annual",
                startDate: "2026-10-05",
                endDate: "2026-10-06",
                reason: "Keperluan keluarga",
            },
        });
        mocks.createLeaveRequest.mockResolvedValue({
            id: "leave-1",
            employeeId: "EMP001",
            type: "annual",
            startDate: "2026-10-05",
            endDate: "2026-10-06",
            reason: "Keperluan keluarga",
            status: "pending",
            createdAt: "2026-09-29T00:00:00.000Z",
        });
    });

    it("delegates annual balance and working-day validation only to the dated-roster service", async () => {
        const response = await POST(new NextRequest("http://localhost/api/leave", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
        }));

        expect(response.status).toBe(201);
        expect(mocks.createLeaveRequest).toHaveBeenCalledWith(expect.objectContaining({
            employeeId: "EMP001",
            type: "annual",
            startDate: "2026-10-05",
            endDate: "2026-10-06",
            status: "pending",
        }));
        expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
        expect(mocks.workShiftFindUnique).not.toHaveBeenCalled();
    });
});

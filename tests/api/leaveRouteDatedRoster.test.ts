import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    validateBody: vi.fn(),
    createLeaveRequest: vi.fn(),
    createLeaveRequestsBatch: vi.fn(),
    updateLeaveRequestsBulk: vi.fn(),
    deleteLeaveRequest: vi.fn(),
    getEmployeeLeaveBalance: vi.fn(),
    employeeFindUnique: vi.fn(),
    workShiftFindUnique: vi.fn(),
    logAction: vi.fn(async () => undefined),
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
    getEmployeeLeaveBalance: mocks.getEmployeeLeaveBalance,
    createLeaveRequest: mocks.createLeaveRequest,
    createLeaveRequestsBatch: mocks.createLeaveRequestsBatch,
    updateLeaveRequest: vi.fn(),
    updateLeaveRequestsBulk: mocks.updateLeaveRequestsBulk,
    deleteLeaveRequest: mocks.deleteLeaveRequest,
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        employee: { findUnique: mocks.employeeFindUnique },
        workShift: { findUnique: mocks.workShiftFindUnique },
    },
}));

vi.mock("@/lib/services/auditService", () => ({
    actorFromSession: vi.fn(() => ({ id: "user-1" })),
    logAction: mocks.logAction,
}));

vi.mock("@/lib/logger", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DELETE, POST, PUT } from "@/app/api/leave/route";

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

    it("delegates discrete multi-date batch creation to createLeaveRequestsBatch in a single request", async () => {
        mocks.validateBody.mockResolvedValue({
            data: {
                type: "annual",
                dates: ["2026-11-12", "2026-11-13"],
                reason: "Cuti keluarga",
                attachment: null,
            },
        });
        mocks.createLeaveRequestsBatch.mockResolvedValue([
            {
                id: "leave-b1",
                employeeId: "EMP001",
                type: "annual",
                startDate: "2026-11-12",
                endDate: "2026-11-12",
                reason: "Cuti keluarga",
                status: "pending",
                createdAt: "2026-11-11T00:00:00.000Z",
            },
            {
                id: "leave-b2",
                employeeId: "EMP001",
                type: "annual",
                startDate: "2026-11-13",
                endDate: "2026-11-13",
                reason: "Cuti keluarga",
                status: "pending",
                createdAt: "2026-11-11T00:00:00.000Z",
            },
        ]);

        const response = await POST(new NextRequest("http://localhost/api/leave", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
        }));

        expect(response.status).toBe(201);
        const json = await response.json();
        expect(json.count).toBe(2);
        expect(mocks.createLeaveRequestsBatch).toHaveBeenCalledWith({
            employeeId: "EMP001",
            type: "annual",
            dates: ["2026-11-12", "2026-11-13"],
            reason: "Cuti keluarga",
            status: "pending",
            attachment: null,
        });
    });

    it("delegates bulk PUT ids[] to updateLeaveRequestsBulk in a single request", async () => {
        mocks.requireAuth.mockResolvedValue({
            employeeId: "HR001",
            username: "hr-admin",
            role: "hr",
            permissions: ["hr.manage"],
        });
        mocks.validateBody.mockResolvedValue({
            data: {
                ids: ["leave-b1", "leave-b2"],
                status: "approved",
            },
        });
        mocks.updateLeaveRequestsBulk.mockResolvedValue({
            updated: [],
            succeededIds: ["leave-b1", "leave-b2"],
            failed: [],
        });

        const response = await PUT(new NextRequest("http://localhost/api/leave", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
        }));

        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.succeededIds).toEqual(["leave-b1", "leave-b2"]);
        expect(mocks.updateLeaveRequestsBulk).toHaveBeenCalledWith(["leave-b1", "leave-b2"], "approved");
    });

    it("enforces hr.manage permission on DELETE /api/leave and returns restored quota payload", async () => {
        mocks.requireAuth.mockResolvedValueOnce(null);
        const unauthRes = await DELETE(new NextRequest("http://localhost/api/leave?id=leave-1", { method: "DELETE" }));
        expect(unauthRes.status).toBe(401);

        mocks.requireAuth.mockResolvedValueOnce({
            employeeId: "EMP001",
            username: "employee-1",
            role: "hr",
            permissions: ["employee.self"],
        });
        const forbiddenRes = await DELETE(new NextRequest("http://localhost/api/leave?id=leave-1", { method: "DELETE" }));
        expect(forbiddenRes.status).toBe(403);
        expect(mocks.deleteLeaveRequest).not.toHaveBeenCalled();

        mocks.requireAuth.mockResolvedValueOnce({
            employeeId: "HR001",
            username: "hr-admin",
            permissions: ["hr.manage"],
        });
        mocks.validateBody.mockResolvedValueOnce({ data: { id: "leave-1" } });
        mocks.deleteLeaveRequest.mockResolvedValueOnce({
            deleted: {
                id: "leave-1",
                employeeId: "ID-24050016",
                type: "annual",
                startDate: "2026-12-24",
                endDate: "2026-12-29",
                reason: "Keperluan Keluarga",
                status: "approved",
                createdAt: "2026-11-02T00:01:27.000Z",
            },
            restoredAnnualDays: 4,
            employeeQuota: {
                employeeId: "ID-24050016",
                totalLeave: 6,
                usedLeave: 0,
                remainingLeave: 6,
            },
        });
        mocks.logAction.mockResolvedValueOnce(undefined);

        const okRes = await DELETE(new NextRequest("http://localhost/api/leave?id=leave-1", { method: "DELETE" }));
        expect(okRes.status).toBe(200);
        const json = await okRes.json();
        expect(json.restoredAnnualDays).toBe(4);
        expect(json.employeeQuota.remainingLeave).toBe(6);
        expect(mocks.deleteLeaveRequest).toHaveBeenCalledWith("leave-1");
        expect(mocks.logAction).toHaveBeenCalledWith(
            "DELETE_LEAVE",
            "LEAVE_REQUEST",
            expect.anything(),
            "leave-1",
            expect.objectContaining({
                employeeId: "ID-24050016",
                restoredAnnualDays: 4,
            }),
        );
    });

    it("returns 404 when DELETE /api/leave targets a non-existent leave request", async () => {
        mocks.requireAuth.mockResolvedValueOnce({
            employeeId: "HR001",
            username: "hr-admin",
            permissions: ["hr.manage"],
        });
        mocks.validateBody.mockResolvedValueOnce({ data: { id: "missing-id" } });
        mocks.deleteLeaveRequest.mockResolvedValueOnce(null);

        const res = await DELETE(new NextRequest("http://localhost/api/leave?id=missing-id", { method: "DELETE" }));
        expect(res.status).toBe(404);
    });
});

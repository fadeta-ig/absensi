import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeWig002Session, makeWorkerSession, makeEmployeeSession, VALID_PNG_SIGNATURE } from "../fixtures/cleaning";

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "unauthorized" }, { status: 401 })),
    forbiddenResponse: vi.fn(() => NextResponse.json({ error: "forbidden" }, { status: 403 })),
    serverErrorResponse: vi.fn(() => NextResponse.json({ error: "internal" }, { status: 500 })),
    validateBody: vi.fn(async (request: NextRequest, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) => {
        const json = await request.json();
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
            return { error: NextResponse.json({ error: "validation" }, { status: 400 }) };
        }
        return { data: parsed.data };
    }),
}));

vi.mock("@/lib/services/cleaningService", () => {
    class CleaningError extends Error {
        constructor(message: string, public statusCode = 400) {
            super(message);
        }
    }

    return {
        CleaningError,
        isWig002: (session: { username: string; permissions: string[] }) => (
            session.username === "WIG002" && session.permissions.includes("ga.manage")
        ),
    };
});

vi.mock("@/lib/services/cleaningApprovalService", () => ({
    listGaApprovals: vi.fn(),
    getGaApprovalDetail: vi.fn(),
    openApprovalPeriod: vi.fn(),
    reopenApprovalSlot: vi.fn(),
    getEligibleReviewers: vi.fn(),
    listEmployeeApprovalTasks: vi.fn(),
    getEmployeeApprovalDetail: vi.fn(),
    signApprovalPeriod: vi.fn(),
    getCleaningPdfExportData: vi.fn(),
}));

import { requireAuth } from "@/lib/middleware/apiGuard";
import {
    listGaApprovals,
    getGaApprovalDetail,
    openApprovalPeriod,
    reopenApprovalSlot,
    getEligibleReviewers,
    listEmployeeApprovalTasks,
    getEmployeeApprovalDetail,
    signApprovalPeriod,
    getCleaningPdfExportData,
} from "@/lib/services/cleaningApprovalService";

import { GET as gaApprovalsGET, POST as gaApprovalsPOST } from "@/app/api/ga/cleaning/approvals/route";
import { POST as gaReopenPOST } from "@/app/api/ga/cleaning/approvals/reopen/route";
import { GET as gaReviewersGET } from "@/app/api/ga/cleaning/approvals/reviewers/route";
import { GET as exportPdfGET } from "@/app/api/ga/cleaning/approvals/export-pdf/route";
import { GET as empApprovalsGET } from "@/app/api/employee/cleaning/approvals/route";
import { POST as empSignPOST } from "@/app/api/employee/cleaning/approvals/sign/route";

describe("Cleaning Approval API Routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("GA Cleaning Approvals Route (/api/ga/cleaning/approvals)", () => {
        it("AC-1: rejects unauthenticated requests on GET", async () => {
            vi.mocked(requireAuth).mockResolvedValue(null);
            const req = new NextRequest("http://localhost/api/ga/cleaning/approvals");
            const res = await gaApprovalsGET(req);
            expect(res.status).toBe(401);
        });

        it("AC-1: rejects non-WIG002 requests on GET", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeWorkerSession());
            const req = new NextRequest("http://localhost/api/ga/cleaning/approvals");
            const res = await gaApprovalsGET(req);
            expect(res.status).toBe(403);
        });

        it("AC-12: returns approval list for WIG002", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
            vi.mocked(listGaApprovals).mockResolvedValue({
                data: [],
                pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
            } as never);

            const req = new NextRequest("http://localhost/api/ga/cleaning/approvals?monthWib=2026-09");
            const res = await gaApprovalsGET(req);
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(listGaApprovals).toHaveBeenCalled();
        });

        it("AC-12: returns approval detail when mode=detail", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
            vi.mocked(getGaApprovalDetail).mockResolvedValue({
                status: "WAITING_FOR_SIGNATURES",
                roomId: "room-1",
                roomName: "Ruang A",
                monthWib: "2026-09",
            } as never);

            const req = new NextRequest("http://localhost/api/ga/cleaning/approvals?roomId=room-1&monthWib=2026-09&mode=detail");
            const res = await gaApprovalsGET(req);
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(getGaApprovalDetail).toHaveBeenCalledWith(expect.anything(), "room-1", "2026-09");
        });

        it("AC-2 & AC-3: opens a new approval period via POST", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
            vi.mocked(openApprovalPeriod).mockResolvedValue({
                approval: { id: "app-1" },
                derivedStatus: "WAITING_FOR_SIGNATURES",
                isNew: true,
            } as never);

            const req = new NextRequest("http://localhost/api/ga/cleaning/approvals", {
                method: "POST",
                body: JSON.stringify({
                    roomId: "11111111-1111-4111-8111-111111111111",
                    monthWib: "2026-09",
                    inspectedByEmployeeId: "EMP001",
                    knownByEmployeeId: "EMP002",
                }),
            });

            const res = await gaApprovalsPOST(req);
            expect(res.status).toBe(201);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.isNew).toBe(true);
        });
    });

    describe("GA Reopen Route (/api/ga/cleaning/approvals/reopen)", () => {
        it("AC-9: reopens slot with valid reason and WIG002 auth", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
            vi.mocked(reopenApprovalSlot).mockResolvedValue({
                success: true,
                reopenedRole: "INSPECTED_BY",
                derivedStatus: "WAITING_FOR_SIGNATURES",
            } as never);

            const req = new NextRequest("http://localhost/api/ga/cleaning/approvals/reopen", {
                method: "POST",
                body: JSON.stringify({
                    approvalId: "11111111-1111-4111-8111-111111111111",
                    role: "INSPECTED_BY",
                    reopenReason: "Checklist perlu diperbaiki",
                }),
            });

            const res = await gaReopenPOST(req);
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(reopenApprovalSlot).toHaveBeenCalled();
        });
    });

    describe("GA Reviewers Route (/api/ga/cleaning/approvals/reviewers)", () => {
        it("AC-2: returns eligible reviewers list for WIG002", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
            vi.mocked(getEligibleReviewers).mockResolvedValue([
                { id: "e-1", employeeId: "EMP001", name: "Reviewer 1" },
            ] as never);

            const res = await gaReviewersGET();
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.data).toHaveLength(1);
        });
    });

    describe("Employee Approvals Routes (/api/employee/cleaning/approvals)", () => {
        it("AC-5: rejects employee read if no employeeId in session", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeWorkerSession({ employeeId: null }));
            const req = new NextRequest("http://localhost/api/employee/cleaning/approvals");
            const res = await empApprovalsGET(req);
            expect(res.status).toBe(403);
        });

        it("AC-5: returns tasks for active employee", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession());
            vi.mocked(listEmployeeApprovalTasks).mockResolvedValue({
                data: [],
                pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
            } as never);

            const req = new NextRequest("http://localhost/api/employee/cleaning/approvals");
            const res = await empApprovalsGET(req);
            expect(res.status).toBe(200);
            expect(listEmployeeApprovalTasks).toHaveBeenCalled();
        });

        it("AC-5: returns approval detail when approvalId is passed", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession());
            vi.mocked(getEmployeeApprovalDetail).mockResolvedValue({
                id: "app-1",
                roomName: "Ruang A",
            } as never);

            const req = new NextRequest("http://localhost/api/employee/cleaning/approvals?approvalId=11111111-1111-4111-8111-111111111111");
            const res = await empApprovalsGET(req);
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(getEmployeeApprovalDetail).toHaveBeenCalled();
        });

        it("AC-6 & AC-7: signs slot via POST", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession());
            vi.mocked(signApprovalPeriod).mockResolvedValue({
                success: true,
                signatureId: "sig-123",
                derivedStatus: "PARTIALLY_SIGNED",
            } as never);

            const req = new NextRequest("http://localhost/api/employee/cleaning/approvals/sign", {
                method: "POST",
                headers: { "x-idempotency-key": "idem-123" },
                body: JSON.stringify({
                    approvalId: "11111111-1111-4111-8111-111111111111",
                    role: "INSPECTED_BY",
                    signaturePayload: VALID_PNG_SIGNATURE,
                }),
            });

            const res = await empSignPOST(req);
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(signApprovalPeriod).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    approvalId: "11111111-1111-4111-8111-111111111111",
                    role: "INSPECTED_BY",
                    idempotencyKey: "idem-123",
                })
            );
        });
    });

    describe("GA PDF Export Route (/api/ga/cleaning/approvals/export-pdf)", () => {
        it("returns PDF export payload for WIG002", async () => {
            vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
            vi.mocked(getCleaningPdfExportData).mockResolvedValue({
                roomName: "Ruangan CEO",
                monthWib: "2026-08",
                daysInMonth: 31,
                items: [],
                matrix: [],
                inspectedBy: { employeeName: "Manager A", employeeId: "EMP001" },
                knownBy: { employeeName: "Direksi B", employeeId: "EMP002" },
            } as never);

            const req = new NextRequest("http://localhost/api/ga/cleaning/approvals/export-pdf?roomId=room-1&monthWib=2026-08");
            const res = await exportPdfGET(req);
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.data.roomName).toBe("Ruangan CEO");
            expect(getCleaningPdfExportData).toHaveBeenCalledWith(expect.anything(), "room-1", "2026-08");
        });
    });
});

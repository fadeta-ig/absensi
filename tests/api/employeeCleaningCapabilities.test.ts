import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { makeEmployeeSession } from "../fixtures/cleaning";

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "unauthorized" }, { status: 401 })),
    forbiddenResponse: vi.fn(() => NextResponse.json({ error: "forbidden" }, { status: 403 })),
    serverErrorResponse: vi.fn(() => NextResponse.json({ error: "internal" }, { status: 500 })),
}));

vi.mock("@/lib/services/cleaningApprovalService", () => ({
    getEmployeeCleaningCapabilities: vi.fn(),
}));

import { requireAuth } from "@/lib/middleware/apiGuard";
import { getEmployeeCleaningCapabilities } from "@/lib/services/cleaningApprovalService";
import { GET } from "@/app/api/employee/cleaning/capabilities/route";

describe("Employee cleaning capabilities (mock murni)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("401 tanpa sesi; 403 tanpa employeeId", async () => {
        vi.mocked(requireAuth).mockResolvedValue(null);
        expect((await GET()).status).toBe(401);

        vi.mocked(requireAuth).mockResolvedValue({ ...makeEmployeeSession(), employeeId: null });
        expect((await GET()).status).toBe(403);
    });

    it("teruskan isReviewer/isTopViewer", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession());
        vi.mocked(getEmployeeCleaningCapabilities).mockResolvedValue({ isReviewer: true, isTopViewer: false });
        const res = await GET();
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            success: true,
            data: { isReviewer: true, isTopViewer: false },
        });
    });
});

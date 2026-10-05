import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeWig002Session, makeEmployeeSession } from "../fixtures/cleaning";

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

vi.mock("@/lib/services/appSettingsService", () => ({
    getCleaningDefaultReviewers: vi.fn(),
    updateCleaningDefaultReviewers: vi.fn(),
}));

vi.mock("@/lib/services/cleaningApprovalService", () => ({
    openAllMonthlyApprovals: vi.fn(),
}));

import { requireAuth } from "@/lib/middleware/apiGuard";
import { getCleaningDefaultReviewers, updateCleaningDefaultReviewers } from "@/lib/services/appSettingsService";
import { openAllMonthlyApprovals } from "@/lib/services/cleaningApprovalService";
import { GET as defaultsGET, PUT as defaultsPUT } from "@/app/api/ga/cleaning/settings/default-reviewers/route";
import { POST as openAllPOST } from "@/app/api/ga/cleaning/approvals/open-all/route";

function putRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/ga/cleaning/settings/default-reviewers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("Default reviewers + open-all routes (mock murni)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("401 tanpa sesi; 403 non-WIG002", async () => {
        vi.mocked(requireAuth).mockResolvedValue(null);
        expect((await defaultsGET()).status).toBe(401);

        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession());
        expect((await defaultsGET()).status).toBe(403);
        expect(
            (
                await openAllPOST(
                    new NextRequest("http://localhost/api/ga/cleaning/approvals/open-all", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ monthWib: "2026-10" }),
                    })
                )
            ).status
        ).toBe(403);
    });

    it("GET teruskan defaults; PUT validasi + simpan", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(getCleaningDefaultReviewers).mockResolvedValue({
            inspectedByEmployeeId: "ID-1",
            knownByEmployeeId: "ID-2",
        });
        const getRes = await defaultsGET();
        expect(getRes.status).toBe(200);

        expect((await defaultsPUT(putRequest({}))).status).toBe(400);

        vi.mocked(updateCleaningDefaultReviewers).mockResolvedValue({
            key: "cleaning.defaultReviewers",
            inspectedByEmployeeId: "ID-1",
            knownByEmployeeId: "ID-2",
        });
        const putRes = await defaultsPUT(putRequest({ inspectedByEmployeeId: "ID-1", knownByEmployeeId: "ID-2" }));
        expect(putRes.status).toBe(200);
        expect(updateCleaningDefaultReviewers).toHaveBeenCalledWith("ID-1", "ID-2", expect.any(String));
    });

    it("open-all teruskan hasil bulk", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(openAllMonthlyApprovals).mockResolvedValue({ created: 8, skipped: 2, monthWib: "2026-10" });
        const res = await openAllPOST(
            new NextRequest("http://localhost/api/ga/cleaning/approvals/open-all", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ monthWib: "2026-10" }),
            })
        );
        expect(res.status).toBe(201);
        await expect(res.json()).resolves.toEqual({
            success: true,
            data: { created: 8, skipped: 2, monthWib: "2026-10" },
        });
    });
});

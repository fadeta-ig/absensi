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

vi.mock("@/lib/services/cleaningOverviewService", () => ({
    getTopViewerOverview: vi.fn(),
}));

vi.mock("@/lib/services/appSettingsService", () => ({
    getCleaningTopViewerInfo: vi.fn(),
    updateCleaningTopViewer: vi.fn(),
}));

vi.mock("@/lib/services/cleaningService", () => {
    class CleaningError extends Error {
        constructor(
            message: string,
            public statusCode = 400
        ) {
            super(message);
            this.name = "CleaningError";
        }
    }
    return {
        CleaningError,
        isWig002: (session: { username: string; permissions: string[] }) =>
            session.username === "WIG002" && session.permissions.includes("ga.manage"),
        requireWig002OrTopViewer: vi.fn(),
    };
});

import { requireAuth } from "@/lib/middleware/apiGuard";
import { requireWig002OrTopViewer } from "@/lib/services/cleaningService";
import { getTopViewerOverview } from "@/lib/services/cleaningOverviewService";
import { getCleaningTopViewerInfo, updateCleaningTopViewer } from "@/lib/services/appSettingsService";
import { GET as overviewGET } from "@/app/api/ga/cleaning/overview/route";
import { GET as topViewerGET, PUT as topViewerPUT } from "@/app/api/ga/cleaning/settings/top-viewer/route";

function gmSession() {
    return makeEmployeeSession({ employeeId: "ID-24050016", username: "ID-24050016" });
}

describe("Top viewer routes (mock murni)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("overview GET 401 tanpa sesi; top-viewer GET/PUT 401 tanpa sesi", async () => {
        vi.mocked(requireAuth).mockResolvedValue(null);
        expect((await overviewGET(new NextRequest("http://localhost/api/ga/cleaning/overview?monthWib=2026-10"))).status).toBe(401);
        expect((await topViewerGET()).status).toBe(401);
        expect(
            (
                await topViewerPUT(
                    new NextRequest("http://localhost/api/ga/cleaning/settings/top-viewer", {
                        method: "PUT",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ employeeId: "ID-24050016" }),
                    })
                )
            ).status
        ).toBe(401);
    });

    it("overview GET teruskan data agregat bila lolos guard", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(requireWig002OrTopViewer).mockResolvedValue(undefined);
        vi.mocked(getTopViewerOverview).mockResolvedValue({ monthWib: "2026-10", rooms: [] });
        const res = await overviewGET(new NextRequest("http://localhost/api/ga/cleaning/overview?monthWib=2026-10"));
        expect(res.status).toBe(200);
        expect(getTopViewerOverview).toHaveBeenCalledWith("2026-10", null);
    });

    it("overview GET 403 bila guard menolak (GM tak ditunjuk)", async () => {
        vi.mocked(requireAuth).mockResolvedValue(gmSession());
        vi.mocked(requireWig002OrTopViewer).mockRejectedValue(new Error("Hanya WIG002 dengan ga.manage yang dapat mengelola kebersihan."));
        const res = await overviewGET(new NextRequest("http://localhost/api/ga/cleaning/overview?monthWib=2026-10"));
        expect(res.status).toBe(403);
        expect(getTopViewerOverview).not.toHaveBeenCalled();
    });

    it("top-viewer PUT 400 bila body tak valid; teruskan info bila valid", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        const bad = await topViewerPUT(
            new NextRequest("http://localhost/api/ga/cleaning/settings/top-viewer", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({}),
            })
        );
        expect(bad.status).toBe(400);

        vi.mocked(updateCleaningTopViewer).mockResolvedValue({
            key: "cleaning.topViewer.employeeId",
            employeeId: "ID-24050016",
        });
        vi.mocked(getCleaningTopViewerInfo).mockResolvedValue({
            employeeId: "ID-24050016",
            name: "General Manager",
            isActive: true,
        });
        const ok = await topViewerPUT(
            new NextRequest("http://localhost/api/ga/cleaning/settings/top-viewer", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ employeeId: "ID-24050016" }),
            })
        );
        expect(ok.status).toBe(200);
        expect(updateCleaningTopViewer).toHaveBeenCalledWith("ID-24050016", expect.any(String));
    });

    it("top-viewer PUT ditolak untuk GM (kunci WIG002)", async () => {
        vi.mocked(requireAuth).mockResolvedValue(gmSession());
        const res = await topViewerPUT(
            new NextRequest("http://localhost/api/ga/cleaning/settings/top-viewer", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ employeeId: "ID-24050016" }),
            })
        );
        expect(res.status).toBe(403);
        expect(updateCleaningTopViewer).not.toHaveBeenCalled();
    });
});

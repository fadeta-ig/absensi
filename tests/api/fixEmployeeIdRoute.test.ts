import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    previewNipFixImpact: vi.fn(),
    fixEmployeeNip: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/middleware/apiGuard")>();
    return {
        ...actual,
        requireAuth: mocks.requireAuth,
        unauthorizedResponse: mocks.unauthorizedResponse,
        forbiddenResponse: mocks.forbiddenResponse,
        serverErrorResponse: mocks.serverErrorResponse,
    };
});
vi.mock("@/lib/services/employeeNipService", () => ({
    canFixEmployeeNip: (session: { username?: string }) => session?.username === "WIG001",
    previewNipFixImpact: mocks.previewNipFixImpact,
    fixEmployeeNip: mocks.fixEmployeeNip,
    NipFixError: class extends Error {
        statusCode: number;
        constructor(message: string, statusCode = 400) {
            super(message);
            this.statusCode = statusCode;
        }
    },
}));

import { GET, POST } from "@/app/api/employees/fix-employee-id/route";

const WIG_SESSION = { username: "WIG001", permissions: ["hr.manage"] };

function getRequest(): NextRequest {
    return new NextRequest("http://localhost/api/employees/fix-employee-id?employeeUuid=11111111-1111-4111-8111-111111111111&newEmployeeId=ID-002");
}

function postRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/employees/fix-employee-id", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("fix-employee-id guard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireAuth.mockResolvedValue(WIG_SESSION);
    });

    it("401 tanpa sesi, 403 bukan WIG001", async () => {
        mocks.requireAuth.mockResolvedValueOnce(null);
        expect((await GET(getRequest())).status).toBe(401);
        mocks.requireAuth.mockResolvedValueOnce({ username: "HR001", permissions: ["hr.manage"] });
        expect((await GET(getRequest())).status).toBe(403);
    });

    it("400 bila parameter tak valid; teruskan preview bila valid", async () => {
        mocks.previewNipFixImpact.mockResolvedValue({ newEmployeeId: "ID-002" });
        const bad = new NextRequest("http://localhost/api/employees/fix-employee-id?employeeUuid=bukan-uuid&newEmployeeId=x");
        expect((await GET(bad)).status).toBe(400);
        expect((await GET(getRequest())).status).toBe(200);
    });

    it("POST menolak tanpa centang sadar; sukses bila lengkap", async () => {
        expect((await POST(postRequest({ employeeUuid: "11111111-1111-4111-8111-111111111111", newEmployeeId: "ID-002" }))).status).toBe(400);
        mocks.fixEmployeeNip.mockResolvedValue({ oldEmployeeId: "ID-001", newEmployeeId: "ID-002" });
        const res = await POST(
            postRequest({ employeeUuid: "11111111-1111-4111-8111-111111111111", newEmployeeId: "ID-002", acknowledged: true }),
        );
        expect(res.status).toBe(200);
    });
});

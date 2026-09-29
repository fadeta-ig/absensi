import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    findUnique: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: mocks.unauthorizedResponse,
    forbiddenResponse: mocks.forbiddenResponse,
    serverErrorResponse: mocks.serverErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { attendanceRecord: { findUnique: mocks.findUnique } } }));

import { GET } from "@/app/api/attendance/photos/[id]/route";

const context = { params: Promise.resolve({ id: "attendance-1" }) };

describe("attendance photo route", () => {
    beforeEach(() => vi.resetAllMocks());

    it("requires authentication and hr.manage", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        expect((await GET(new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=clockIn"), context)).status).toBe(401);

        mocks.requireAuth.mockResolvedValue({ permissions: ["employee.self"] });
        expect((await GET(new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=clockIn"), context)).status).toBe(403);
    });

    it("rejects invalid phases and missing/corrupt photos", async () => {
        mocks.requireAuth.mockResolvedValue({ permissions: ["hr.manage"] });
        expect((await GET(new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=bad"), context)).status).toBe(400);

        mocks.findUnique.mockResolvedValue(null);
        expect((await GET(new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=clockIn"), context)).status).toBe(404);

        mocks.findUnique.mockResolvedValue({ clockInPhoto: "not-a-data-url", clockOutPhoto: null });
        expect((await GET(new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=clockIn"), context)).status).toBe(404);
    });

    it("returns a private no-store binary image", async () => {
        mocks.requireAuth.mockResolvedValue({ permissions: ["hr.manage"] });
        mocks.findUnique.mockResolvedValue({
            clockInPhoto: `data:image/jpeg;base64,${Buffer.from("photo").toString("base64")}`,
            clockOutPhoto: null,
        });

        const response = await GET(new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=clockIn"), context);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/jpeg");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("photo");
    });
});

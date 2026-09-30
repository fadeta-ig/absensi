import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    findUnique: vi.fn(),
    readAttendancePhotoFile: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: mocks.unauthorizedResponse,
    forbiddenResponse: mocks.forbiddenResponse,
    serverErrorResponse: mocks.serverErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { attendanceRecord: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/services/attendanceService", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/services/attendanceService")>();
    return { ...actual, readAttendancePhotoFile: mocks.readAttendancePhotoFile };
});

import { GET } from "@/app/api/attendance/photos/[id]/route";

const context = { params: Promise.resolve({ id: "attendance-1" }) };
const HR_SESSION = { permissions: ["hr.manage"] };

describe("attendance photo dual-read (Gel.2a, mock)", () => {
    beforeEach(() => vi.resetAllMocks());

    it("mengutamakan file disk bila path ada", async () => {
        mocks.requireAuth.mockResolvedValue(HR_SESSION);
        mocks.findUnique.mockResolvedValue({
            clockInPhotoPath: "EMP001/uuid-selfie.jpg",
            clockInPhoto: null,
            clockOutPhotoPath: null,
            clockOutPhoto: null,
        });
        mocks.readAttendancePhotoFile.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0x01]));

        const response = await GET(
            new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=clockIn"),
            context,
        );
        expect(mocks.readAttendancePhotoFile).toHaveBeenCalledWith("EMP001/uuid-selfie.jpg");
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/jpeg");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        const bytes = new Uint8Array(await response.arrayBuffer());
        expect(bytes[0]).toBe(0xff);
        expect(bytes[1]).toBe(0xd8);
    });

    it("fallback ke base64 lama bila path kosong (kode lama dipertahankan)", async () => {
        mocks.requireAuth.mockResolvedValue(HR_SESSION);
        mocks.findUnique.mockResolvedValue({
            clockInPhotoPath: null,
            clockInPhoto: `data:image/jpeg;base64,${Buffer.from("legacy").toString("base64")}`,
            clockOutPhotoPath: null,
            clockOutPhoto: null,
        });

        const response = await GET(
            new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=clockIn"),
            context,
        );
        expect(mocks.readAttendancePhotoFile).not.toHaveBeenCalled();
        expect(response.status).toBe(200);
        expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("legacy");
    });

    it("404 bila path ada tetapi berkas hilang di disk", async () => {
        mocks.requireAuth.mockResolvedValue(HR_SESSION);
        mocks.findUnique.mockResolvedValue({
            clockInPhotoPath: "EMP001/hilang.jpg",
            clockInPhoto: null,
            clockOutPhotoPath: null,
            clockOutPhoto: null,
        });
        mocks.readAttendancePhotoFile.mockRejectedValue(new Error("ENOENT"));

        const response = await GET(
            new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=clockIn"),
            context,
        );
        expect(response.status).toBe(404);
    });

    it("404 bila tidak ada path maupun base64", async () => {
        mocks.requireAuth.mockResolvedValue(HR_SESSION);
        mocks.findUnique.mockResolvedValue({
            clockInPhotoPath: null,
            clockInPhoto: null,
            clockOutPhotoPath: null,
            clockOutPhoto: null,
        });

        const response = await GET(
            new NextRequest("http://localhost/api/attendance/photos/attendance-1?phase=clockOut"),
            context,
        );
        expect(response.status).toBe(404);
    });
});

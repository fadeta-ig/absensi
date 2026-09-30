import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(JSON.stringify({ error: "unauth" }), { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(JSON.stringify({ error: "server" }), { status: 500 })),
    findUniqueEmployee: vi.fn(),
    performAttendanceMutation: vi.fn(),
    saveAttendancePhoto: vi.fn(),
    deleteAttendancePhotoFile: vi.fn(),
    getUploadLimit: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: mocks.unauthorizedResponse,
    forbiddenResponse: mocks.forbiddenResponse,
    serverErrorResponse: mocks.serverErrorResponse,
    parseFormData: vi.fn(async (request: Request) => {
        try {
            return { data: await request.formData() };
        } catch {
            return { error: new Response(JSON.stringify({ error: "form" }), { status: 400 }) };
        }
    }),
}));
vi.mock("@/lib/prisma", () => ({
    prisma: { employee: { findUnique: mocks.findUniqueEmployee } },
}));
vi.mock("@/lib/services/attendanceService", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/services/attendanceService")>();
    return {
        ...actual,
        performAttendanceMutation: mocks.performAttendanceMutation,
        saveAttendancePhoto: mocks.saveAttendancePhoto,
        deleteAttendancePhotoFile: mocks.deleteAttendancePhotoFile,
    };
});
vi.mock("@/lib/services/appSettingsService", () => ({
    getUploadLimit: mocks.getUploadLimit,
}));

import { POST } from "@/app/api/attendance/route";
import { AttendanceMutationError } from "@/lib/services/attendanceService";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x00, 0x01]);
const SESSION = { employeeId: "EMP001", permissions: ["employee.self"] };

function multipartRequest(fields: Record<string, string>, photo?: File | string | null): NextRequest {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (photo instanceof File) form.append("photo", photo, "selfie.jpg");
    else if (typeof photo === "string") form.append("photo", photo);
    return new NextRequest("http://localhost/api/attendance", { method: "POST", body: form });
}

function mockBypassEmployee() {
    mocks.findUniqueEmployee.mockResolvedValue({ employeeId: "EMP001", bypassLocation: true, locations: [] });
}

describe("POST /api/attendance multipart 1-step (Gel.2a, mock)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.getUploadLimit.mockResolvedValue(2);
        mocks.saveAttendancePhoto.mockResolvedValue("EMP001/uuid-selfie.jpg");
        mocks.deleteAttendancePhotoFile.mockResolvedValue(undefined);
        mocks.performAttendanceMutation.mockResolvedValue({
            record: { id: "r1", employeeId: "EMP001", clockIn: "2026-09-30T00:00:00Z", clockOut: null },
            target: { mode: "CLOCK_IN", shiftDate: "2026-09-30", isOvernight: false },
            isOffDay: false,
        });
    });

    it("wajib login", async () => {
        mocks.requireAuth.mockResolvedValue(null);
        const response = await POST(multipartRequest({ action: "CLOCK_IN", shiftDate: "2026-09-30" }));
        expect(response.status).toBe(401);
    });

    it("menolak kontrak JSON-base64 lama dengan pesan refresh aplikasi", async () => {
        mocks.requireAuth.mockResolvedValue(SESSION);
        const request = new NextRequest("http://localhost/api/attendance", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "CLOCK_IN", shiftDate: "2026-09-30", photo: "data:image/jpeg;base64,xx" }),
        });
        const response = await POST(request);
        const json = await response.json() as { error: string };
        expect(response.status).toBe(400);
        expect(json.error).toMatch(/refresh aplikasi/i);
        expect(mocks.saveAttendancePhoto).not.toHaveBeenCalled();
    });

    it("menolak string base64 yang diselundupkan via multipart", async () => {
        mocks.requireAuth.mockResolvedValue(SESSION);
        const response = await POST(
            multipartRequest({ action: "CLOCK_IN", shiftDate: "2026-09-30" }, "data:image/jpeg;base64,xx"),
        );
        const json = await response.json() as { error: string };
        expect(response.status).toBe(400);
        expect(json.error).toMatch(/refresh aplikasi/i);
    });

    it("400 bila foto tidak ada atau bukan JPEG", async () => {
        mocks.requireAuth.mockResolvedValue(SESSION);
        mockBypassEmployee();

        const missing = await POST(multipartRequest({ action: "CLOCK_IN", shiftDate: "2026-09-30" }));
        expect(missing.status).toBe(400);

        const fakePng = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "selfie.jpg", { type: "image/jpeg" });
        const notJpeg = await POST(
            multipartRequest({ action: "CLOCK_IN", shiftDate: "2026-09-30" }, fakePng),
        );
        expect(notJpeg.status).toBe(400);
        expect(((await notJpeg.json()) as { error: string }).error).toMatch(/JPEG/);
    });

    it("400 bila melebihi batas setting upload.selfie.maxMb", async () => {
        mocks.requireAuth.mockResolvedValue(SESSION);
        mockBypassEmployee();
        mocks.getUploadLimit.mockResolvedValue(0.00001);
        const oversized = Buffer.concat([JPEG_BYTES, Buffer.alloc(64, 0x41)]);
        const big = new File([new Uint8Array(oversized)], "selfie.jpg", { type: "image/jpeg" });
        const response = await POST(
            multipartRequest({ action: "CLOCK_IN", shiftDate: "2026-09-30" }, big),
        );
        expect(response.status).toBe(400);
        expect(mocks.saveAttendancePhoto).not.toHaveBeenCalled();
    });

    it("menyimpan 1-step dan memanggil mutasi dengan photoPath (tanpa kolom base64)", async () => {
        mocks.requireAuth.mockResolvedValue(SESSION);
        mockBypassEmployee();
        const file = new File([new Uint8Array(JPEG_BYTES)], "selfie.jpg", { type: "image/jpeg" });
        const response = await POST(
            multipartRequest(
                {
                    action: "CLOCK_IN",
                    shiftDate: "2026-09-30",
                    location: JSON.stringify({ lat: -6.2, lng: 106.8 }),
                },
                file,
            ),
        );

        expect(mocks.getUploadLimit).toHaveBeenCalledWith("upload.selfie.maxMb");
        expect(mocks.saveAttendancePhoto).toHaveBeenCalledWith("EMP001", expect.any(Buffer), 2 * 1024 * 1024);
        expect(mocks.performAttendanceMutation).toHaveBeenCalledWith(
            expect.objectContaining({ employeeId: "EMP001", expectedAction: "CLOCK_IN", photoPath: "EMP001/uuid-selfie.jpg" }),
        );
        expect(mocks.performAttendanceMutation).not.toHaveBeenCalledWith(
            expect.objectContaining({ photo: expect.anything() }),
        );
        expect(response.status).toBe(200);
        const json = await response.json() as { shiftDate: string; action: string };
        expect(json.shiftDate).toBe("2026-09-30");
        expect(json.action).toBe("CLOCK_IN");
    });

    it("membersihkan file yatim bila mutasi gagal dan meneruskan status konflik", async () => {
        mocks.requireAuth.mockResolvedValue(SESSION);
        mockBypassEmployee();
        mocks.performAttendanceMutation.mockRejectedValue(
            new AttendanceMutationError("Presensi untuk shift ini sudah tercatat lengkap.", "ALREADY_COMPLETED", 409),
        );
        const file = new File([new Uint8Array(JPEG_BYTES)], "selfie.jpg", { type: "image/jpeg" });
        const response = await POST(
            multipartRequest({ action: "CLOCK_OUT", shiftDate: "2026-09-30" }, file),
        );

        expect(mocks.deleteAttendancePhotoFile).toHaveBeenCalledWith("EMP001/uuid-selfie.jpg");
        expect(response.status).toBe(409);
    });
});

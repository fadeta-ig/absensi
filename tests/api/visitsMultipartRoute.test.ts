import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    getVisitReportById: vi.fn(),
    clockInVisit: vi.fn(),
    clockOutVisit: vi.fn(),
    logAction: vi.fn(),
    actorFromSession: vi.fn(() => ({})),
    getUploadLimit: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", async (importOriginal) => ({
    ...((await importOriginal()) as Record<string, unknown>),
    requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/services/visitService", () => ({
    getVisitReports: vi.fn(),
    getVisitReportById: mocks.getVisitReportById,
    createVisitDraft: vi.fn(),
    updateVisitDraft: vi.fn(),
    clockInVisit: mocks.clockInVisit,
    clockOutVisit: mocks.clockOutVisit,
    verifyVisit: vi.fn(),
    deleteVisitReport: vi.fn(),
}));
vi.mock("@/lib/services/auditService", () => ({
    actorFromSession: mocks.actorFromSession,
    logAction: mocks.logAction,
}));
vi.mock("@/lib/services/appSettingsService", () => ({
    getUploadLimit: mocks.getUploadLimit,
}));

import { POST } from "@/app/api/visits/route";

const SESSION = { employeeId: "EMP001", username: "WIG001", role: "employee", permissions: ["employee.self"] };
const LOCATION = { lat: -6.2088, lng: 106.8456 };

async function jpegBytes(width = 640, height = 480): Promise<Buffer> {
    return sharp({
        create: { width, height, channels: 3, background: { r: 44, g: 120, b: 180 } },
    }).jpeg({ quality: 80 }).toBuffer();
}

function meta(index: number) {
    return {
        capturedAtDevice: "2026-07-20T06:59:00.000Z",
        category: index === 0 ? "LOKASI" : "AKTIVITAS",
        caption: null,
    };
}

async function multipartRequest(payload: Record<string, unknown>, files: File[], metas: unknown[]): Promise<NextRequest> {
    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    form.set("photosMeta", JSON.stringify(metas));
    for (const file of files) form.append("photos", file, file.name);
    return new NextRequest("http://localhost/api/visits", { method: "POST", body: form });
}

function jpegFile(bytes: Buffer, name: string): File {
    return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}

describe("visits route multipart (jalur hemat)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.requireAuth.mockResolvedValue(SESSION);
        mocks.getUploadLimit.mockResolvedValue(2);
        mocks.logAction.mockResolvedValue(undefined);
        mocks.getVisitReportById.mockResolvedValue({
            employeeId: "EMP001",
            status: "draft",
            visitLocation: { lat: -6.2088, lng: 106.8456 },
            visitRadius: 300,
            clientName: "PT Contoh",
        });
    });

    it("clock_in multipart: teruskan Buffer ke service dan balas 200", async () => {
        const bytes = await jpegBytes();
        mocks.clockInVisit.mockResolvedValue({ photos: [{ phase: "CLOCK_IN", id: "p1", sha256Original: "ab" }] });

        const request = await multipartRequest(
            { action: "clock_in", id: "visit-1", location: LOCATION },
            [jpegFile(bytes, "a.jpg"), jpegFile(bytes, "b.jpg")],
            [meta(0), meta(1)],
        );
        const response = await POST(request);
        expect(response.status).toBe(200);
        expect(mocks.clockInVisit).toHaveBeenCalledOnce();
        const [, data] = mocks.clockInVisit.mock.calls[0] as [Record<string, unknown>, { photos: { buffer: Buffer }[] }];
        expect(data.photos).toHaveLength(2);
        expect(Buffer.isBuffer(data.photos[0].buffer)).toBe(true);
        expect(data.photos[0].buffer.equals(bytes)).toBe(true);
        expect(mocks.logAction).toHaveBeenCalledOnce();
    });

    it("clock_out multipart memakai meta kategori dan result", async () => {
        const bytes = await jpegBytes();
        mocks.getVisitReportById.mockResolvedValue({
            employeeId: "EMP001",
            status: "clocked_in",
            visitLocation: { lat: -6.2088, lng: 106.8456 },
            visitRadius: 300,
            clientName: "PT Contoh",
        });
        mocks.clockOutVisit.mockResolvedValue({ photos: [] });

        const request = await multipartRequest(
            { action: "clock_out", id: "visit-1", location: LOCATION, result: "Deal" },
            [jpegFile(bytes, "a.jpg"), jpegFile(bytes, "b.jpg")],
            [meta(0), meta(1)],
        );
        const response = await POST(request);
        expect(response.status).toBe(200);
        const [, data] = mocks.clockOutVisit.mock.calls[0] as [Record<string, unknown>, { photos: { category: string }[]; result: string }];
        expect(data.photos[0].category).toBe("LOKASI");
        expect(data.result).toBe("Deal");
    });

    it("menolak jumlah file tak sesuai meta dan foto < 2", async () => {
        const bytes = await jpegBytes();
        const mismatch = await multipartRequest(
            { action: "clock_in", id: "visit-1", location: LOCATION },
            [jpegFile(bytes, "a.jpg")],
            [meta(0), meta(1)],
        );
        expect((await POST(mismatch)).status).toBe(400);

        const tooFew = await multipartRequest(
            { action: "clock_in", id: "visit-1", location: LOCATION },
            [jpegFile(bytes, "a.jpg")],
            [meta(0)],
        );
        expect((await POST(tooFew)).status).toBe(400);
        expect(mocks.clockInVisit).not.toHaveBeenCalled();
    });

    it("menolak MIME non-JPEG, magic tak cocok, dan file over-limit setting", async () => {
        const bytes = await jpegBytes();
        const png = await sharp({
            create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 1, b: 1 } },
        }).png().toBuffer();

        const wrongMime = await multipartRequest(
            { action: "clock_in", id: "visit-1", location: LOCATION },
            [new File([new Uint8Array(png)], "a.png", { type: "image/png" }), jpegFile(bytes, "b.jpg")],
            [meta(0), meta(1)],
        );
        expect((await POST(wrongMime)).status).toBe(400);

        const wrongMagic = await multipartRequest(
            { action: "clock_in", id: "visit-1", location: LOCATION },
            [new File([new Uint8Array(png)], "a.jpg", { type: "image/jpeg" }), jpegFile(bytes, "b.jpg")],
            [meta(0), meta(1)],
        );
        expect((await POST(wrongMagic)).status).toBe(400);

        mocks.getUploadLimit.mockResolvedValue(0.001);
        const oversize = await multipartRequest(
            { action: "clock_in", id: "visit-1", location: LOCATION },
            [jpegFile(bytes, "a.jpg"), jpegFile(bytes, "b.jpg")],
            [meta(0), meta(1)],
        );
        expect((await POST(oversize)).status).toBe(413);
        expect(mocks.clockInVisit).not.toHaveBeenCalled();
    });

    it("jalur JSON-base64 lama tetap jalan (kompatibilitas mundur)", async () => {
        const bytes = await jpegBytes();
        const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
        mocks.clockInVisit.mockResolvedValue({ photos: [] });

        const request = new NextRequest("http://localhost/api/visits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "clock_in",
                id: "visit-1",
                location: LOCATION,
                photos: [
                    { dataUrl, capturedAtDevice: "2026-07-20T06:59:00.000Z", category: "LOKASI", caption: null },
                    { dataUrl, capturedAtDevice: "2026-07-20T06:59:00.000Z", category: "AKTIVITAS", caption: null },
                ],
            }),
        });
        const response = await POST(request);
        expect(response.status).toBe(200);
        expect(mocks.clockInVisit).toHaveBeenCalledOnce();
    });
});

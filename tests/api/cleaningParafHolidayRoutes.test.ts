import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeWig002Session, makeWorkerSession, makeEmployeeSession, CLEANING_IDS } from "../fixtures/cleaning";

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
            this.name = "CleaningError";
        }
    }
    return {
        CleaningError,
        isWig002: (session: { username: string; permissions: string[] }) =>
            session.username === "WIG002" && session.permissions.includes("ga.manage"),
    };
});

vi.mock("@/lib/services/cleaningParafService", () => ({
    getParafStatus: vi.fn(),
    signDailyParaf: vi.fn(),
    listCleaningHolidays: vi.fn(),
    createCleaningHoliday: vi.fn(),
    deleteCleaningHoliday: vi.fn(),
}));

import { requireAuth } from "@/lib/middleware/apiGuard";
import { CleaningError } from "@/lib/services/cleaningService";
import {
    getParafStatus,
    signDailyParaf,
    listCleaningHolidays,
    createCleaningHoliday,
    deleteCleaningHoliday,
} from "@/lib/services/cleaningParafService";
import { GET as parafGET, POST as parafPOST } from "@/app/api/cleaning/paraf/route";
import { GET as holidaysGET, POST as holidaysPOST, DELETE as holidaysDELETE } from "@/app/api/cleaning/holidays/route";

describe("Cleaning Paraf & Holiday API Routes (mock murni)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("401 bila tanpa sesi pada GET paraf dan GET libur", async () => {
        vi.mocked(requireAuth).mockResolvedValue(null);

        const parafRes = await parafGET(
            new NextRequest(`http://localhost/api/cleaning/paraf?roomId=${CLEANING_IDS.room}&wibDate=2026-09-21`)
        );
        expect(parafRes.status).toBe(401);

        const holidayRes = await holidaysGET();
        expect(holidayRes.status).toBe(401);
    });

    it("401 bila tanpa sesi pada POST paraf dan POST libur", async () => {
        vi.mocked(requireAuth).mockResolvedValue(null);

        const parafRes = await parafPOST(
            new NextRequest("http://localhost/api/cleaning/paraf", {
                method: "POST",
                body: JSON.stringify({
                    roomId: "11111111-1111-4111-8111-111111111111",
                    wibDate: "2026-09-21",
                    signerEmployeeId: "EMP001",
                }),
            })
        );
        expect(parafRes.status).toBe(401);

        const holidayRes = await holidaysPOST(
            new NextRequest("http://localhost/api/cleaning/holidays", {
                method: "POST",
                body: JSON.stringify({ wibDate: "2026-09-21", description: "Libur test" }),
            })
        );
        expect(holidayRes.status).toBe(401);
    });

    it("403 bila reviewer membaca paraf ruangan yang bukan tugasnya", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "EMP999" }));
        vi.mocked(getParafStatus).mockResolvedValue({
            roomId: CLEANING_IDS.room,
            wibDate: "2026-09-21",
            reviewers: { inspectedByEmployeeId: "EMP001", knownByEmployeeId: "EMP002" },
        } as never);

        const res = await parafGET(
            new NextRequest(`http://localhost/api/cleaning/paraf?roomId=${CLEANING_IDS.room}&wibDate=2026-09-21`)
        );
        expect(res.status).toBe(403);
    });

    it("403 bila signer berbeda dari sesi sendiri", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "EMP001" }));

        const res = await parafPOST(
            new NextRequest("http://localhost/api/cleaning/paraf", {
                method: "POST",
                body: JSON.stringify({
                    roomId: "11111111-1111-4111-8111-111111111111",
                    wibDate: "2026-09-22",
                    signerEmployeeId: "EMP002",
                }),
            })
        );
        expect(res.status).toBe(403);
        expect(signDailyParaf).not.toHaveBeenCalled();
    });

    it("403 bila non-WIG002 mencoba mutasi libur", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWorkerSession());

        const postRes = await holidaysPOST(
            new NextRequest("http://localhost/api/cleaning/holidays", {
                method: "POST",
                body: JSON.stringify({ wibDate: "2026-12-25", description: "Natal" }),
            })
        );
        expect(postRes.status).toBe(403);

        const deleteRes = await holidaysDELETE(
            new NextRequest("http://localhost/api/cleaning/holidays?id=holiday-1", { method: "DELETE" })
        );
        expect(deleteRes.status).toBe(403);
    });

    it("409 bila service menolak checklist belum 100%", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeEmployeeSession({ employeeId: "EMP001" }));
        vi.mocked(signDailyParaf).mockRejectedValue(new CleaningError("Checklist belum 100% selesai sehingga belum dapat diparaf.", 409));

        const res = await parafPOST(
            new NextRequest("http://localhost/api/cleaning/paraf", {
                method: "POST",
                body: JSON.stringify({
                    roomId: "11111111-1111-4111-8111-111111111111",
                    wibDate: "2026-09-22",
                    signerEmployeeId: "EMP001",
                }),
            })
        );
        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.error).toMatch(/100%/);
    });

    it("409 bila tanggal libur ganda", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(createCleaningHoliday).mockRejectedValue(new CleaningError("Tanggal libur tersebut sudah terdaftar.", 409));

        const res = await holidaysPOST(
            new NextRequest("http://localhost/api/cleaning/holidays", {
                method: "POST",
                body: JSON.stringify({ wibDate: "2026-12-25", description: "Natal" }),
            })
        );
        expect(res.status).toBe(409);
    });

    it("WIG002 boleh melihat semua paraf dan mengelola libur", async () => {
        vi.mocked(requireAuth).mockResolvedValue(makeWig002Session());
        vi.mocked(getParafStatus).mockResolvedValue({
            roomId: CLEANING_IDS.room,
            wibDate: "2026-09-21",
            reviewers: { inspectedByEmployeeId: "EMP001", knownByEmployeeId: "EMP002" },
        } as never);
        vi.mocked(listCleaningHolidays).mockResolvedValue([] as never);
        vi.mocked(deleteCleaningHoliday).mockResolvedValue({
            success: true,
            id: "holiday-1",
            wibDate: "2026-12-25",
        } as never);

        const parafRes = await parafGET(
            new NextRequest(`http://localhost/api/cleaning/paraf?roomId=${CLEANING_IDS.room}&wibDate=2026-09-21`)
        );
        expect(parafRes.status).toBe(200);

        const listRes = await holidaysGET();
        expect(listRes.status).toBe(200);

        const deleteRes = await holidaysDELETE(
            new NextRequest("http://localhost/api/cleaning/holidays?id=holiday-1", { method: "DELETE" })
        );
        expect(deleteRes.status).toBe(200);
    });
});

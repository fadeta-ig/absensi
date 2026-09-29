import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
    forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
    serverErrorResponse: vi.fn(() => new Response(null, { status: 500 })),
    employeeFindMany: vi.fn(),
    attendanceFindMany: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: mocks.unauthorizedResponse,
    forbiddenResponse: mocks.forbiddenResponse,
    serverErrorResponse: mocks.serverErrorResponse,
}));
vi.mock("@/lib/prisma", () => ({
    prisma: {
        employee: { findMany: mocks.employeeFindMany },
        attendanceRecord: { findMany: mocks.attendanceFindMany },
    },
}));

import { GET } from "@/app/api/export/route";

describe("attendance matrix export", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.requireAuth.mockResolvedValue({ role: "hr" });
        mocks.employeeFindMany.mockResolvedValue([{
            employeeId: "EMP001",
            name: "Budi",
            departmentRel: { name: "IT" },
            positionRel: { name: "Staff" },
        }]);
        mocks.attendanceFindMany.mockResolvedValue([{
            id: "attendance-1",
            employeeId: "EMP001",
            date: new Date("2026-09-28T00:00:00.000Z"),
            clockIn: new Date("2026-09-28T16:00:00.000Z"),
            clockOut: new Date("2026-09-29T00:00:00.000Z"),
            status: "present",
            notes: "Tugas inventaris",
            isOffDay: true,
            offDayReason: "Piket akhir pekan",
        }]);
    });

    it("retains clock times and includes notes plus off-day reason in each matrix date cell", async () => {
        const response = await GET(new NextRequest(
            "http://localhost/api/export?type=attendance&startDate=2026-09-28&endDate=2026-09-28&mode=matrix&format=preview"
        ));

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.headers).toContain("09-28");
        expect(payload.data[0]["09-28"]).toBe(
            "23:00\n07:00\nCatatan: Tugas inventaris\nAlasan libur: Piket akhir pekan"
        );
    });
});

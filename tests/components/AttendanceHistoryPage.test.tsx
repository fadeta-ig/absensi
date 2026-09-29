// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AttendanceHistoryPage from "@/app/employee/attendance-history/page";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), reportClientError: vi.fn() }));

vi.mock("@/hooks/useAttendanceServerContext", () => ({
    useAttendanceServerContext: () => ({
        context: { serverWibDate: "2026-09-29" },
        isOnline: true,
        isFresh: true,
    }),
}));
vi.mock("@/components/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: mocks.reportClientError,
    getResponseErrorMessage: vi.fn(async (_response: Response, fallback: string) => fallback),
}));
vi.mock("@/lib/export", () => ({ exportToExcel: vi.fn() }));

function response(data: unknown): Response {
    return { ok: true, status: 200, json: vi.fn(async () => data) } as unknown as Response;
}

describe("AttendanceHistoryPage", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubGlobal("fetch", vi.fn(async () => response([{
            id: "attendance-1",
            date: "2026-09-28",
            clockIn: "2026-09-28T16:00:00.000Z",
            clockOut: "2026-09-29T00:00:00.000Z",
            status: "present",
            isOffDay: true,
            offDayReason: "Piket operasional malam",
        }])));
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("formats attendance instants in WIB, keeps overnight duration, and exposes the reason", async () => {
        render(<AttendanceHistoryPage />);

        expect(await screen.findByText(/23[.:]00 WIB/)).toBeInTheDocument();
        expect(screen.getByText(/07[.:]00 WIB/)).toBeInTheDocument();
        expect(screen.getByText("8j 0m")).toBeInTheDocument();
        expect(screen.getByText("Hari Libur")).toBeInTheDocument();
        expect(screen.getByText("Alasan: Piket operasional malam")).toBeInTheDocument();
    });

    it("shows the overnight badge for an open normal record using API shift metadata", async () => {
        vi.mocked(fetch).mockResolvedValue(response([{
            id: "attendance-open",
            date: "2026-09-28",
            shiftDate: "2026-09-28",
            clockIn: "2026-09-28T16:00:00.000Z",
            clockOut: null,
            status: "present",
            isOffDay: false,
            shiftName: "Shift Malam",
            shiftStartTime: "23:00",
            shiftEndTime: "07:00",
            isOvernight: true,
        }]));

        render(<AttendanceHistoryPage />);

        expect(await screen.findByText("Lintas Hari")).toBeInTheDocument();
        expect(screen.getByTitle("Shift Malam: 23:00-07:00")).toBeInTheDocument();
        expect(screen.getByText("--:--")).toBeInTheDocument();
    });
});

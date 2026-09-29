// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    toast: vi.fn(),
    reportClientError: vi.fn(),
    searchParams: { get: vi.fn(() => null) },
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.searchParams }));
vi.mock("@/components/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("@/lib/export", () => ({ exportToExcel: vi.fn(), exportToPdfTable: vi.fn() }));
vi.mock("@/lib/clientErrors", () => ({
    getResponseErrorMessage: vi.fn(async (_response: Response, fallback: string) => fallback),
    reportClientError: mocks.reportClientError,
}));
vi.mock("@/app/dashboard/attendance/components/AttendanceSummary", () => ({ AttendanceSummary: () => null }));
vi.mock("@/app/dashboard/attendance/components/AttendanceFilters", () => ({ AttendanceFilters: () => null }));
vi.mock("@/app/dashboard/attendance/components/AttendanceLogTab", () => ({ AttendanceLogTab: () => null }));
vi.mock("@/app/dashboard/attendance/components/AttendanceCorrectionTab", () => ({ AttendanceCorrectionTab: () => null }));
vi.mock("@/app/dashboard/attendance/components/AttendanceAbsentTab", () => ({
    AttendanceAbsentTab: ({
        targetDate,
        onTargetDateChange,
        absentEmployees,
    }: {
        targetDate: string;
        onTargetDateChange: (date: string) => void;
        absentEmployees: Array<{ employeeId: string; statusType: string }>;
    }) => (
        <div>
            <span data-testid="target-date">{targetDate}</span>
            <span data-testid="absent-statuses">
                {absentEmployees.map((employee) => `${employee.employeeId}:${employee.statusType}`).join(",")}
            </span>
            <button type="button" onClick={() => onTargetDateChange("2026-09-18")}>Pilih tanggal lama</button>
            <button type="button" onClick={() => onTargetDateChange("2026-09-19")}>Pilih hari ini</button>
        </div>
    ),
}));

import AttendanceMonitorPage from "@/app/dashboard/attendance/page";

function jsonResponse(data: unknown, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 500,
        json: vi.fn(async () => data),
    } as unknown as Response;
}

describe("AttendanceMonitorPage roster loading", () => {
    let failRoster = false;
    const rosterUrls: string[] = [];

    beforeEach(() => {
        vi.resetAllMocks();
        failRoster = false;
        rosterUrls.length = 0;
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/employees") {
                return jsonResponse([{
                    id: "employee-1",
                    employeeId: "EMP001",
                    name: "Budi",
                    department: "IT",
                    division: "Technology",
                    position: "Staff",
                    isActive: true,
                    shiftId: "shift-early",
                }, {
                    id: "employee-2",
                    employeeId: "EMP002",
                    name: "Siti",
                    department: "IT",
                    division: "Technology",
                    position: "Staff",
                    isActive: true,
                    shiftId: "shift-early",
                }]);
            }
            if (url === "/api/master/departments" || url === "/api/master/divisions") return jsonResponse([]);
            if (url === "/api/attendance/network") {
                return jsonResponse({
                    serverWibDate: "2026-09-19",
                    serverWibNow: "2026-09-19T02:00:00+07:00",
                });
            }
            if (url === "/api/attendance") return jsonResponse([{
                id: "attendance-open",
                employeeId: "EMP002",
                date: "2026-09-18",
                clockIn: "2026-09-18T16:00:00.000Z",
                clockOut: null,
                status: "present",
            }]);
            if (url === "/api/leave") return jsonResponse([]);
            if (url === "/api/shifts") {
                return jsonResponse([
                    {
                        id: "shift-early",
                        name: "Shift Dini Hari",
                        isDefault: true,
                        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                            dayOfWeek,
                            startTime: "00:00",
                            endTime: "08:00",
                            isOff: false,
                        })),
                    },
                    {
                        id: "shift-off",
                        name: "Shift Libur",
                        isDefault: false,
                        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                            dayOfWeek,
                            startTime: "08:00",
                            endTime: "17:00",
                            isOff: true,
                        })),
                    },
                    {
                        id: "shift-night",
                        name: "Shift Malam",
                        isDefault: false,
                        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                            dayOfWeek,
                            startTime: "23:00",
                            endTime: "07:00",
                            isOff: false,
                        })),
                    },
                ]);
            }
            if (url.startsWith("/api/holidays?")) return jsonResponse({ data: [] });
            if (url === "/api/attendance/correction") return jsonResponse([]);
            if (url.startsWith("/api/shifts/assignments?date=")) {
                rosterUrls.push(url);
                if (failRoster) return jsonResponse({ error: "failed" }, false);
                const date = new URL(url, "http://localhost").searchParams.get("date");
                return jsonResponse({
                    roster: date === "2026-09-18"
                        ? [
                            { employeeId: "EMP001", shiftId: "shift-off" },
                            { employeeId: "EMP002", shiftId: "shift-early" },
                        ]
                        : date === "2026-09-17"
                            ? [
                                { employeeId: "EMP001", shiftId: "shift-early" },
                                { employeeId: "EMP002", shiftId: "shift-night" },
                            ]
                            : [
                                { employeeId: "EMP001", shiftId: "shift-early" },
                                { employeeId: "EMP002", shiftId: "shift-early" },
                            ],
                });
            }
            throw new Error(`Unexpected fetch: ${url}`);
        }));
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("clears stale target and H-1 roster maps when the next date roster request fails", async () => {
        render(<AttendanceMonitorPage />);

        fireEvent.click(await screen.findByRole("button", { name: /Belum Hadir/ }));
        await waitFor(() => expect(screen.getByTestId("target-date")).toHaveTextContent("2026-09-19"));

        fireEvent.click(screen.getByRole("button", { name: "Pilih tanggal lama" }));
        await waitFor(() => expect(screen.getByTestId("absent-statuses")).toHaveTextContent("EMP001:off_day"));
        expect(rosterUrls).toEqual(expect.arrayContaining([
            "/api/shifts/assignments?date=2026-09-18",
            "/api/shifts/assignments?date=2026-09-17",
        ]));

        failRoster = true;
        fireEvent.click(screen.getByRole("button", { name: "Pilih hari ini" }));

        await waitFor(() => expect(screen.getByTestId("target-date")).toHaveTextContent("2026-09-19"));
        await waitFor(() => expect(screen.getByTestId("absent-statuses")).toHaveTextContent("EMP001:unpresent,EMP002:unpresent"));
        await waitFor(() => expect(rosterUrls).toEqual(expect.arrayContaining([
            "/api/shifts/assignments?date=2026-09-19",
            "/api/shifts/assignments?date=2026-09-18",
        ])));
        await waitFor(() => expect(mocks.reportClientError).toHaveBeenCalledWith(
            "AttendanceMonitorPage",
            "Gagal memuat roster shift presensi",
            expect.any(Error),
            { targetDate: "2026-09-19", previousDate: "2026-09-18" },
        ));
    });
});

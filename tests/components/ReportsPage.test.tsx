// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "@/app/dashboard/reports/page";

const clientMocks = vi.hoisted(() => ({
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_response: Response, fallback: string) => fallback),
    exportToExcel: vi.fn(),
    exportToPdfMatrix: vi.fn(),
}));

vi.mock("@/lib/clientErrors", () => ({
    reportClientError: clientMocks.reportClientError,
    getResponseErrorMessage: clientMocks.getResponseErrorMessage,
}));
vi.mock("@/lib/export", () => ({
    exportToExcel: clientMocks.exportToExcel,
    exportToPdfMatrix: clientMocks.exportToPdfMatrix,
}));

function response(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: vi.fn(async () => data),
        clone() { return this; },
    } as unknown as Response;
}

describe("ReportsPage", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("renders notes and off-day reason after both clock lines in a matrix preview", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/master/divisions" || url === "/api/master/departments" || url === "/api/employees") {
                return response([]);
            }
            if (url.startsWith("/api/export?")) {
                return response({
                    sheetName: "Rekap Presensi",
                    period: "2026-09-28",
                    totalRecords: 1,
                    headers: ["Nama Karyawan", "09-28"],
                    data: [{
                        "Nama Karyawan": "Budi",
                        "09-28": "23:00\n07:00\nCatatan: Tugas inventaris\nAlasan libur: Piket akhir pekan",
                    }],
                });
            }
            throw new Error(`Unexpected fetch ${url}`);
        }));
        const user = userEvent.setup();
        render(<ReportsPage />);

        await user.click(screen.getByRole("button", { name: "Preview" }));

        const note = await screen.findByText("Catatan: Tugas inventaris");
        const dateCell = note.closest("td");
        expect(dateCell).not.toBeNull();
        expect(within(dateCell!).getByText("23:00")).toBeInTheDocument();
        expect(within(dateCell!).getByText("07:00")).toBeInTheDocument();
        expect(within(dateCell!).getByText("Alasan libur: Piket akhir pekan")).toBeInTheDocument();
    });
});

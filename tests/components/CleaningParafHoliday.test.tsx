// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CleaningRecapPage from "@/app/ga/cleaning/recap/page";
import CleaningHolidaysPage from "@/app/ga/cleaning/holidays/page";
import { CLEANING_IDS } from "../fixtures/cleaning";

const clientMocks = vi.hoisted(() => ({
    toast: vi.fn(),
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_response: Response, fallback: string) => fallback),
}));

vi.mock("@/components/Toast", () => ({ useToast: () => clientMocks.toast }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: clientMocks.reportClientError,
    getResponseErrorMessage: clientMocks.getResponseErrorMessage,
}));
vi.mock("@/lib/exportCleaningPdf", () => ({ exportCleaningMatrixPdf: vi.fn() }));

function response(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://example.test/api",
        json: vi.fn(async () => data),
        clone() {
            return this;
        },
    } as unknown as Response;
}

function installRecapFetch(parafOverride: Record<string, unknown> = {}) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/ga/cleaning/recap")) {
            return response({
                data: {
                    month: "2026-09",
                    dates: ["2026-09-22"],
                    matrix: [
                        {
                            room: { id: CLEANING_IDS.room, name: "Ruang Test Cleaning" },
                            days: [{ date: "2026-09-22", status: "BELUM" }],
                        },
                    ],
                },
            });
        }
        if (url.includes("/api/ga/cleaning/checklists")) {
            return response({
                data: {
                    type: "record",
                    checklist: {
                        id: CLEANING_IDS.checklist,
                        wibDate: "2026-09-22",
                        roomNameSnapshot: "Ruang Test Cleaning",
                        derivedStatus: "BELUM",
                        items: [
                            {
                                id: CLEANING_IDS.checklistItem,
                                itemNameSnapshot: "Lantai",
                                isActive: true,
                                isComplete: false,
                                lastChangedAt: null,
                                lastChangedBy: null,
                            },
                        ],
                    },
                },
            });
        }
        if (url.includes("/api/cleaning/paraf")) {
            return response({
                data: {
                    roomId: CLEANING_IDS.room,
                    roomName: "Ruang Test Cleaning",
                    wibDate: "2026-09-22",
                    monthWib: "2026-09",
                    isWeekend: false,
                    isHoliday: false,
                    isFree: false,
                    holidayDescription: null,
                    checklist: { exists: true, activeCount: 2, completedCount: 1, percent: 50, isComplete: false },
                    reviewers: { inspectedByEmployeeId: "EMP001", knownByEmployeeId: "EMP002" },
                    parafs: [],
                    missingRoles: ["INSPECTED_BY", "KNOWN_BY"],
                    ...parafOverride,
                },
            });
        }
        throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

describe("Paraf harian di rekap GA (render + lock)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("menampilkan section paraf per ruangan-tanggal beserta status", async () => {
        installRecapFetch();
        const user = userEvent.setup();
        render(<CleaningRecapPage />);

        await user.click(await screen.findByTitle("Ruang Test Cleaning - 2026-09-22: BELUM"));

        expect(await screen.findByTestId("paraf-section")).toBeInTheDocument();
        expect(screen.getByText(/Checklist 50%/)).toBeInTheDocument();
        expect(screen.getByText(/EMP001 \/ EMP002/)).toBeInTheDocument();
    });

    it("mengunci tombol paraf bila checklist belum 100%", async () => {
        installRecapFetch();
        const user = userEvent.setup();
        render(<CleaningRecapPage />);

        await user.click(await screen.findByTitle("Ruang Test Cleaning - 2026-09-22: BELUM"));

        expect(await screen.findByText(/Selesaikan semua checklist 100% dulu, baru bisa paraf/)).toBeInTheDocument();
        const buttons = await screen.findAllByRole("button", { name: /Paraf ·/ });
        expect(buttons).toHaveLength(2);
        for (const button of buttons) {
            expect(button).toBeDisabled();
            expect(button).toHaveAttribute("title", "Paraf terkunci");
        }
    });

    it("menampilkan bebas paraf untuk hari libur", async () => {
        installRecapFetch({ isHoliday: true, isFree: true, holidayDescription: "Cuti bersama" });
        const user = userEvent.setup();
        render(<CleaningRecapPage />);

        await user.click(await screen.findByTitle("Ruang Test Cleaning - 2026-09-22: BELUM"));

        expect(await screen.findByText(/Bebas paraf/)).toBeInTheDocument();
        expect(screen.getByText(/Cuti bersama/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Paraf ·/ })).not.toBeInTheDocument();
    });

    it("membuka modal konfirmasi paraf yang aksesibel", async () => {
        installRecapFetch({
            checklist: { exists: true, activeCount: 1, completedCount: 1, percent: 100, isComplete: true },
        });
        const user = userEvent.setup();
        render(<CleaningRecapPage />);

        await user.click(await screen.findByTitle("Ruang Test Cleaning - 2026-09-22: BELUM"));
        const parafButton = await screen.findByRole("button", { name: /Paraf · Diperiksa Oleh/ });
        expect(parafButton).toBeEnabled();
        await user.click(parafButton);

        expect(await screen.findByRole("dialog", { name: "Konfirmasi Paraf Harian" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Simpan Paraf" })).toBeInTheDocument();
    });
});

describe("Halaman libur WIG002 (tambah/hapus + alasan)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    function installHolidaysFetch() {
        const calls: Array<{ url: string; method: string; body: unknown }> = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method ?? "GET";
            calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
            if (url === "/api/cleaning/holidays" && method === "GET") {
                return response({
                    data: [
                        { id: "holiday-1", wibDate: "2026-12-25", description: "Natal", createdAt: "2026-09-01T00:00:00Z" },
                    ],
                });
            }
            if (url === "/api/cleaning/holidays" && method === "POST") {
                return response({ data: { id: "holiday-2", wibDate: "2026-12-26", description: "Cuti bersama" } });
            }
            if (url.startsWith("/api/cleaning/holidays?id=") && method === "DELETE") {
                return response({ data: { success: true } });
            }
            throw new Error(`Unexpected fetch ${method} ${url}`);
        });
        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("confirm", vi.fn(() => true));
        return { calls };
    }

    it("menampilkan daftar libur beserta alasan dan tombol hapus", async () => {
        installHolidaysFetch();
        render(<CleaningHolidaysPage />);

        expect(await screen.findByRole("heading", { name: /Libur Cleaning/ })).toBeInTheDocument();
        expect(await screen.findByText("2026-12-25")).toBeInTheDocument();
        expect(screen.getByText("Natal")).toBeInTheDocument();
        expect(screen.getByTitle("Hapus libur 2026-12-25")).toBeInTheDocument();
    });

    it("membuka modal tambah dan mengunci simpan hingga form valid", async () => {
        installHolidaysFetch();
        const user = userEvent.setup();
        render(<CleaningHolidaysPage />);

        await user.click(await screen.findByRole("button", { name: /Tambah Libur/ }));
        expect(await screen.findByRole("dialog", { name: "Tambah Hari Libur" })).toBeInTheDocument();

        const saveButton = screen.getByRole("button", { name: "Simpan" });
        expect(saveButton).toBeDisabled();

        await user.type(screen.getByLabelText(/Tanggal/), "2026-12-26");
        await user.type(screen.getByLabelText(/Alasan libur/), "Cuti bersama");

        await waitFor(() => expect(saveButton).toBeEnabled());
    });

    it("mengirim tambah libur dengan tanggal dan alasan", async () => {
        const { calls } = installHolidaysFetch();
        const user = userEvent.setup();
        render(<CleaningHolidaysPage />);

        await user.click(await screen.findByRole("button", { name: /Tambah Libur/ }));
        await user.type(await screen.findByLabelText(/Tanggal/), "2026-12-26");
        await user.type(screen.getByLabelText(/Alasan libur/), "Cuti bersama");
        await user.click(screen.getByRole("button", { name: "Simpan" }));

        await waitFor(() => {
            expect(calls).toContainEqual({
                url: "/api/cleaning/holidays",
                method: "POST",
                body: { wibDate: "2026-12-26", description: "Cuti bersama" },
            });
        });
    });
});

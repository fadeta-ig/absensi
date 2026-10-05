// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CleaningRecapPage from "@/app/ga/cleaning/recap/page";
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

function response(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://example.test/api/ga/cleaning",
        json: vi.fn(async () => data),
        clone() { return this; },
    } as unknown as Response;
}

describe("CleaningRecapPage", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("AC-7 opens stored detail with status, actor, and WIB time", async () => {
        // Bulan berjalan dinamis: halaman default ke bulan kini (drift Sep→Okt 2026 pernah merah).
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const dayDone = `${month}-20`;
        const dayFuture = `${month}-22`;
        const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(`${month}-15T00:00:00`));
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes(`recap?month=${month}`)) {
                return response({
                    data: {
                        month,
                        dates: [dayDone, dayFuture],
                        matrix: [{
                            room: { id: CLEANING_IDS.room, name: "Ruang Test Cleaning" },
                            days: [
                                { date: dayDone, status: "SELESAI" },
                                { date: dayFuture, status: "FUTURE" },
                            ],
                        }],
                    },
                });
            }
            if (url.includes(`date=${dayDone}`)) {
                return response({
                    data: {
                        type: "record",
                        checklist: {
                            id: CLEANING_IDS.checklist,
                            wibDate: dayDone,
                            roomNameSnapshot: "Ruang Test Cleaning",
                            derivedStatus: "SELESAI",
                            items: [{
                                id: CLEANING_IDS.checklistItem,
                                itemNameSnapshot: "Lantai",
                                isActive: true,
                                isComplete: true,
                                lastChangedAt: `${dayDone}T03:15:00.000Z`,
                                lastChangedBy: { id: CLEANING_IDS.workerUser, displayName: "Cleaning Test Worker" },
                            }],
                        },
                    },
                });
            }
            throw new Error(`Unexpected fetch ${url}`);
        });
        vi.stubGlobal("fetch", fetchMock);
        const user = userEvent.setup();

        render(<CleaningRecapPage />);
        expect(await screen.findByText(monthLabel)).toBeInTheDocument();
        await user.click(await screen.findByTitle(`Ruang Test Cleaning - ${dayDone}: SELESAI`));

        expect(await screen.findByText("Lantai")).toBeInTheDocument();
        expect(screen.getByText(/Cleaning Test Worker/)).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(
            `/api/ga/cleaning/checklists?roomId=${CLEANING_IDS.room}&date=${dayDone}`,
        );
    });

    it("AC-7 does not request detail for a future matrix cell", async () => {
        const fetchMock = vi.fn(async () => response({
            data: {
                month: "2026-09",
                dates: ["2026-09-22"],
                matrix: [{
                    room: { id: CLEANING_IDS.room, name: "Ruang Test Cleaning" },
                    days: [{ date: "2026-09-22", status: "FUTURE" }],
                }],
            },
        }));
        vi.stubGlobal("fetch", fetchMock);
        const user = userEvent.setup();

        render(<CleaningRecapPage />);
        await user.click(await screen.findByTitle("Ruang Test Cleaning - 2026-09-22: FUTURE"));

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

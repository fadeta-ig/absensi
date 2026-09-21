// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CleaningPage from "@/app/cleaning/page";
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

function response(data: unknown, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 500,
        statusText: ok ? "OK" : "Server Error",
        url: "https://example.test/api/cleaning",
        json: vi.fn(async () => data),
        clone() { return this; },
    } as unknown as Response;
}

const room = {
    id: CLEANING_IDS.room,
    name: "Ruang Test Cleaning",
    template: { id: CLEANING_IDS.template, name: "Template Test Cleaning" },
};

const checklist = {
    id: CLEANING_IDS.checklist,
    roomId: CLEANING_IDS.room,
    wibDate: "2026-09-21",
    roomNameSnapshot: room.name,
    derivedStatus: "BELUM",
    items: [{
        id: CLEANING_IDS.checklistItem,
        itemNameSnapshot: "Lantai",
        sortOrder: 1,
        isActive: true,
        isComplete: false,
        lastChangedAt: null,
        lastChangedBy: null,
    }],
};

async function openChecklist(fetchMock: ReturnType<typeof vi.fn>) {
    fetchMock
        .mockResolvedValueOnce(response({ data: [room] }))
        .mockResolvedValueOnce(response({ data: checklist }));

    render(<CleaningPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Ruang Test Cleaning/i }));
    expect(await screen.findByText("Lantai")).toBeInTheDocument();
}

describe("CleaningPage", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("AC-1 shows assigned rooms and the untouched actor state", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await openChecklist(fetchMock);

        expect(screen.getByText("Template: Template Test Cleaning")).toBeInTheDocument();
        expect(screen.getByText("BELUM")).toBeInTheDocument();
        expect(screen.getByText("Belum diubah")).toBeInTheDocument();
    });

    it("AC-1 gives a clear recoverable ROOM_NOT_READY state", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response({ data: [room] }))
            .mockResolvedValueOnce(response({ error: "ROOM_NOT_READY" }, false));
        vi.stubGlobal("fetch", fetchMock);

        render(<CleaningPage />);
        await userEvent.click(await screen.findByRole("button", { name: /Ruang Test Cleaning/i }));

        expect(await screen.findByText(/belum memiliki template atau item aktif/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Coba lagi/i })).toBeInTheDocument();
    });

    it("AC-2 replaces the optimistic state with the confirmed server actor", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await openChecklist(fetchMock);
        fetchMock.mockResolvedValueOnce(response({
            data: {
                item: {
                    ...checklist.items[0],
                    isComplete: true,
                    lastChangedAt: "2026-09-21T05:00:00.000Z",
                    lastChangedBy: { id: CLEANING_IDS.workerUser, displayName: "Cleaning Test Worker" },
                },
                derivedStatus: "SELESAI",
            },
        }));

        await userEvent.click(screen.getByRole("button", { name: /Lantai/i }));

        expect(await screen.findByText("SELESAI")).toBeInTheDocument();
        expect(screen.getByText(/Cleaning Test Worker/)).toBeInTheDocument();
    });

    it("AC-2 rolls back an optimistic toggle after an HTTP failure", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await openChecklist(fetchMock);
        fetchMock.mockResolvedValueOnce(response({ error: "Gagal menyimpan." }, false));

        await userEvent.click(screen.getByRole("button", { name: /Lantai/i }));
        await waitFor(() => expect(clientMocks.toast).toHaveBeenCalledWith("Gagal menyimpan.", "error"));

        expect(screen.getByText("BELUM")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Lantai/i })).not.toHaveClass("bg-green-50");
    });

    it("AC-2 rolls back an optimistic toggle after a network rejection", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await openChecklist(fetchMock);
        fetchMock.mockRejectedValueOnce(new Error("Network unavailable"));

        await userEvent.click(screen.getByRole("button", { name: /Lantai/i }));
        await waitFor(() => expect(clientMocks.toast).toHaveBeenCalledWith("Network unavailable", "error"));

        expect(screen.getByText("BELUM")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Lantai/i })).not.toHaveClass("bg-green-50");
    });
});

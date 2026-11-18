// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NationalHolidayBadge from "@/components/calendar/NationalHolidayBadge";

vi.mock("@/lib/clientErrors", () => ({
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_r: Response, f: string) => f),
}));

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

function mockFetch(data: unknown) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data }) }))
    );
}

describe("NationalHolidayBadge", () => {
    it("menampilkan tanggal merah + nama libur nasional", async () => {
        mockFetch([{ date: "2026-08-17", name: "Hari Proklamasi Kemerdekaan RI", type: "national" }]);

        render(<NationalHolidayBadge dateKey="2026-08-17" />);

        expect(await screen.findByText("Tanggal Merah: Hari Proklamasi Kemerdekaan RI")).toBeInTheDocument();
    });

    it("render null bila tanggal bukan hari libur", async () => {
        mockFetch([{ date: "2026-08-17", name: "Hari Proklamasi Kemerdekaan RI", type: "national" }]);

        const { container } = render(<NationalHolidayBadge dateKey="2026-08-18" />);

        await waitFor(() => expect(screen.queryByText(/Tanggal Merah/)).not.toBeInTheDocument());
        expect(container).toBeEmptyDOMElement();
    });
});

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CleaningSettingsPage from "@/app/ga/cleaning/settings/page";
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
        url: "https://example.test/api/ga/cleaning",
        json: vi.fn(async () => data),
        clone() { return this; },
    } as unknown as Response;
}

const room = {
    id: CLEANING_IDS.room,
    name: "Ruang Test Cleaning",
    isActive: true,
    template: { id: CLEANING_IDS.template, name: "Template Test Cleaning" },
    assignments: [],
    _count: { checklists: 0 },
};

function installSettingsFetch() {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({
            url,
            method,
            body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
        });
        if (method === "POST" && url === "/api/ga/cleaning/assignments") {
            return response({ data: { id: CLEANING_IDS.assignment } });
        }
        if (url === "/api/ga/cleaning/templates") return response({ data: [] });
        if (url === "/api/ga/cleaning/rooms") return response({ data: [room] });
        if (url.includes("/assignments/available-users")) {
            return response({
                data: [{
                    id: CLEANING_IDS.workerUser,
                    username: "CLEANING_TEST_WORKER",
                    displayName: "Cleaning Test Worker",
                    employeeId: null,
                }],
            });
        }
        throw new Error(`Unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return { calls };
}

describe("CleaningSettingsPage", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("AC-5 and AC-6 exposes template, room, and assignment management", async () => {
        installSettingsFetch();
        render(<CleaningSettingsPage />);

        expect(await screen.findByRole("heading", { name: "Pengaturan Kebersihan" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Template" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ruangan" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Penugasan" })).toBeInTheDocument();
    });

    it("AC-6 sends explicit applyToToday confirmation for a new assignment", async () => {
        const { calls } = installSettingsFetch();
        const user = userEvent.setup();
        render(<CleaningSettingsPage />);

        await user.click(await screen.findByRole("button", { name: "Penugasan" }));
        await user.click(screen.getByRole("button", { name: /Tugaskan/i }));
        const selects = screen.getAllByRole("combobox");
        await user.selectOptions(selects[0], CLEANING_IDS.room);
        // selects[1] is the "Tipe petugas" dropdown (INTERNAL/OUTSOURCE)
        // selects[2] is the "Pengguna" dropdown
        await user.selectOptions(screen.getByRole("combobox", { name: /pengguna/i }), CLEANING_IDS.workerUser);
        await user.click(screen.getByRole("checkbox", { name: /Berlaku mulai hari ini/i }));
        await user.click(screen.getAllByRole("button", { name: "Tugaskan" }).at(-1)!);

        await waitFor(() => {
            expect(calls).toContainEqual({
                url: "/api/ga/cleaning/assignments",
                method: "POST",
                body: {
                    roomId: CLEANING_IDS.room,
                    userId: CLEANING_IDS.workerUser,
                    workerType: "INTERNAL",
                    applyToToday: true,
                },
            });
        });
    });

    it("provides accessible names for both assignment selectors", async () => {
        installSettingsFetch();
        const user = userEvent.setup();
        render(<CleaningSettingsPage />);

        await user.click(await screen.findByRole("button", { name: "Penugasan" }));
        await user.click(screen.getByRole("button", { name: /Tugaskan/i }));

        expect(screen.getByRole("combobox", { name: /ruangan/i })).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: /pengguna/i })).toBeInTheDocument();
    });
});

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
        if (method === "POST" && url === "/api/ga/cleaning/assignments/bulk") {
            return response({
                data: {
                    created: [{
                        roomId: CLEANING_IDS.room,
                        roomName: "Ruang Test Cleaning",
                        userId: CLEANING_IDS.workerUser,
                        displayName: "Cleaning Test Worker",
                        assignmentId: CLEANING_IDS.assignment,
                    }],
                    skipped: [],
                    failed: [],
                },
            });
        }
        if (url === "/api/ga/cleaning/outsource-users") return response({ data: [] });
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

        expect(await screen.findByRole("heading", { name: "Pengaturan Inspeksi" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Template" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ruangan" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Penugasan" })).toBeInTheDocument();
    });

    it("AC-6 sends explicit applyToToday confirmation for a bulk assignment", async () => {
        const { calls } = installSettingsFetch();
        const user = userEvent.setup();
        render(<CleaningSettingsPage />);

        await user.click(await screen.findByRole("button", { name: "Penugasan" }));
        await user.click(screen.getByRole("button", { name: /Tugaskan/i }));
        await user.click(screen.getByRole("checkbox", { name: "Ruang Test Cleaning" }));
        // "Tipe petugas" select (INTERNAL/OUTSOURCE)
        await user.selectOptions(screen.getByRole("combobox", { name: "Tipe petugas" }), "INTERNAL");
        await user.click(screen.getByRole("checkbox", { name: "Cleaning Test Worker" }));
        await user.click(screen.getByRole("checkbox", { name: /Mulai hari ini/i }));
        await user.click(screen.getByRole("button", { name: /Tugaskan 1 penugasan/i }));

        await waitFor(() => {
            expect(calls).toContainEqual({
                url: "/api/ga/cleaning/assignments/bulk",
                method: "POST",
                body: {
                    roomIds: [CLEANING_IDS.room],
                    userIds: [CLEANING_IDS.workerUser],
                    workerType: "INTERNAL",
                    applyToToday: true,
                },
            });
        });
    });

    it("provides accessible multi-select groups for rooms and workers", async () => {
        installSettingsFetch();
        const user = userEvent.setup();
        render(<CleaningSettingsPage />);

        await user.click(await screen.findByRole("button", { name: "Penugasan" }));
        await user.click(screen.getByRole("button", { name: /Tugaskan/i }));

        expect(screen.getByText(/Ruangan \(0 dipilih\)/)).toBeInTheDocument();
        expect(screen.getByText(/Petugas \(0 dipilih\)/)).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: "Ruang Test Cleaning" })).toBeInTheDocument();
    });

    it("requires a masked outsource password with a minimum of eight characters", async () => {
        installSettingsFetch();
        const user = userEvent.setup();
        render(<CleaningSettingsPage />);

        await user.click(await screen.findByRole("button", { name: "Penugasan" }));
        await user.click(screen.getByRole("button", { name: /Petugas Outsource/i }));

        const password = screen.getByLabelText("Password");
        expect(password).toHaveAttribute("type", "password");
        expect(password).toHaveAttribute("minlength", "8");
        expect(password).toHaveAttribute("autocomplete", "new-password");
    });
});

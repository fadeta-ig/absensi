// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import TopViewerCard from "@/app/ga/cleaning/settings/TopViewerCard";

vi.mock("@/components/Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_r: Response, f: string) => f),
}));

function response(data: unknown): Response {
    return { ok: true, status: 200, json: vi.fn(async () => data) } as unknown as Response;
}

function installFetch(current: unknown) {
    const list = Array.isArray(current) ? current : [current];
    return vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes("/api/ga/cleaning/settings/top-viewers") && (!init || !init.method || init.method === "GET")) {
                return response({ success: true, data: list });
            }
            if (url.includes("/api/ga/cleaning/approvals/reviewers")) {
                return response({
                    success: true,
                    data: [{ employeeId: "ID-24050016", name: "General Manager" }],
                });
            }
            if (url.includes("/api/ga/cleaning/settings/top-viewers") && init?.method === "POST") {
                const body = JSON.parse(String(init.body)) as { employeeIds: string[] };
                const ids = body.employeeIds ?? [];
                return response({
                    success: true,
                    data: {
                        key: "cleaning.topViewers",
                        employeeIds: ids,
                        infos: ids.map((id) => ({ employeeId: id, name: "General Manager", isActive: true })),
                    },
                });
            }
            if (url.includes("/api/ga/cleaning/settings/top-viewers") && init?.method === "DELETE") {
                return response({
                    success: true,
                    data: { key: "cleaning.topViewers", employeeIds: [], infos: [] },
                });
            }
            throw new Error(`Unexpected fetch ${url}`);
        })
    );
}

describe("TopViewerCard (WIG002)", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("tampilkan penunjukan + tambah NIP baru (max 5)", async () => {
        installFetch([{ employeeId: "ID-24050016", name: "General Manager", isActive: true }]);
        const user = userEvent.setup();
        render(<TopViewerCard />);

        expect(await screen.findByText("ID-24050016")).toBeInTheDocument();

        await screen.findByRole("option", { name: /General Manager/ });
        await user.selectOptions(screen.getByLabelText("Pilih karyawan"), ["ID-24050016"]);
        await user.click(screen.getByRole("button", { name: /Tambah \(1\/5\)/ }));
        await waitFor(() => expect(screen.getAllByText(/General Manager/).length).toBeGreaterThan(0));
    });

    it("peringatkan bila atasan saat ini nonaktif", async () => {
        installFetch([{ employeeId: "ID-24050016", name: "General Manager", isActive: false }]);
        render(<TopViewerCard />);
        expect(await screen.findByText(/nonaktif/)).toBeInTheDocument();
    });
});

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
    return vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes("/api/ga/cleaning/settings/top-viewer") && (!init || !init.method || init.method === "GET")) {
                return response({ success: true, data: current });
            }
            if (url.includes("/api/ga/cleaning/approvals/reviewers")) {
                return response({
                    success: true,
                    data: [{ employeeId: "ID-24050016", name: "General Manager" }],
                });
            }
            if (url.includes("/api/ga/cleaning/settings/top-viewer") && init?.method === "PUT") {
                const body = JSON.parse(String(init.body));
                return response({
                    success: true,
                    data: {
                        key: "cleaning.topViewer.employeeId",
                        employeeId: body.employeeId || null,
                        info: body.employeeId
                            ? { employeeId: body.employeeId, name: "General Manager", isActive: true }
                            : { employeeId: null, name: null, isActive: null },
                    },
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

    it("tampilkan penunjukan + peringatan nonaktif; simpan NIP baru", async () => {
        installFetch({ employeeId: "ID-24050016", name: "General Manager", isActive: true });
        const user = userEvent.setup();
        render(<TopViewerCard />);

        expect(await screen.findByText("ID-24050016")).toBeInTheDocument();

        await screen.findByRole("option", { name: /General Manager/ });
        await user.selectOptions(screen.getByLabelText("Pilih karyawan"), ["ID-24050016"]);
        await user.click(screen.getByRole("button", { name: "Simpan Atasan Tertinggi" }));
        await waitFor(() => expect(screen.getAllByText(/General Manager/).length).toBeGreaterThan(0));
    });

    it("peringatkan bila atasan saat ini nonaktif", async () => {
        installFetch({ employeeId: "ID-24050016", name: "General Manager", isActive: false });
        render(<TopViewerCard />);
        expect(await screen.findByText(/sudah nonaktif/)).toBeInTheDocument();
    });
});

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DefaultReviewerCard from "@/app/ga/cleaning/settings/DefaultReviewerCard";

vi.mock("@/components/Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_r: Response, f: string) => f),
}));

function response(data: unknown): Response {
    return { ok: true, status: 200, json: vi.fn(async () => data) } as unknown as Response;
}

describe("DefaultReviewerCard (WIG002)", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("tampilkan default + simpan pasangan baru", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                if (url.includes("/api/ga/cleaning/settings/default-reviewers") && (!init || init.method === "GET")) {
                    return response({
                        success: true,
                        data: {
                            defaults: { inspectedByEmployeeId: "ID-1", knownByEmployeeId: "ID-2" },
                            info: {
                                inspectedBy: { employeeId: "ID-1", name: "Agus", isActive: true },
                                knownBy: { employeeId: "ID-2", name: "Dimas", isActive: true },
                            },
                        },
                    });
                }
                if (url.includes("/api/ga/cleaning/approvals/reviewers")) {
                    return response({
                        success: true,
                        data: [
                            { employeeId: "ID-1", name: "Agus" },
                            { employeeId: "ID-2", name: "Dimas" },
                        ],
                    });
                }
                if (url.includes("/api/ga/cleaning/settings/default-reviewers") && init?.method === "PUT") {
                    return response({ success: true, data: {} });
                }
                throw new Error(`Unexpected fetch ${url}`);
            })
        );
        const user = userEvent.setup();
        render(<DefaultReviewerCard />);

        expect(await screen.findByText(/Agus/)).toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText("Diperiksa Oleh"), ["ID-1"]);
        await user.selectOptions(screen.getByLabelText("Mengetahui"), ["ID-2"]);
        await user.click(screen.getByRole("button", { name: "Simpan Pasangan Default" }));
        await waitFor(() => expect(screen.getByText(/tersimpan/i)).toBeInTheDocument());
    });
});

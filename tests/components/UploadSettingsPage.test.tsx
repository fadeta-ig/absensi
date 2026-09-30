// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadSettingsPage from "@/app/dashboard/settings/uploads/page";

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
        url: "https://example.test/api/settings/uploads",
        json: vi.fn(async () => data),
        clone() { return this; },
    } as unknown as Response;
}

const limitsPayload = {
    limits: [
        {
            key: "upload.selfie.maxMb",
            label: "Foto selfie presensi",
            description: "Foto bukti clock in / clock out presensi harian.",
            valueMb: 2,
            source: "default",
        },
        {
            key: "upload.news.maxMb",
            label: "Media WIG News",
            description: "Lampiran gambar / dokumen pada unggahan berita.",
            valueMb: 10,
            source: "default",
        },
    ],
    canManage: true,
};

function installFetch(canManage = true, failGet = false) {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({
            url,
            method,
            body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
        });
        if (url === "/api/settings/uploads" && method === "GET") {
            if (failGet) return response({ error: "rusak" }, false);
            return response({ ...limitsPayload, canManage });
        }
        if (url === "/api/settings/uploads" && method === "PUT") {
            const body = JSON.parse(String(init?.body)) as { key: string; valueMb: number };
            return response({ key: body.key, valueMb: body.valueMb });
        }
        throw new Error(`Unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return { calls };
}

describe("UploadSettingsPage", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("menampilkan daftar batas upload beserta penanda sumber", async () => {
        installFetch();
        render(<UploadSettingsPage />);

        expect(await screen.findByRole("heading", { name: "Batas Ukuran Unggahan" })).toBeInTheDocument();
        expect(screen.getByText("Foto selfie presensi")).toBeInTheDocument();
        expect(screen.getByText("Media WIG News")).toBeInTheDocument();
        expect(screen.getAllByText("Bawaan").length).toBeGreaterThan(0);
    });

    it("mengirim PUT saat WIG001 menyimpan perubahan angka", async () => {
        const { calls } = installFetch(true);
        const user = userEvent.setup();
        render(<UploadSettingsPage />);

        const editButtons = await screen.findAllByRole("button", { name: /Ubah/i });
        await user.click(editButtons[0]);

        const input = await screen.findByLabelText("Batas maksimal (MB)");
        await user.clear(input);
        await user.type(input, "5");
        await user.click(screen.getByRole("button", { name: "Simpan" }));

        await waitFor(() => {
            expect(calls).toContainEqual({
                url: "/api/settings/uploads",
                method: "PUT",
                body: { key: "upload.selfie.maxMb", valueMb: 5 },
            });
        });
        expect(await screen.findByText(/diperbarui menjadi 5 MB/)).toBeInTheDocument();
    });

    it("mengunci tombol Ubah bagi akun selain WIG001", async () => {
        installFetch(false);
        render(<UploadSettingsPage />);

        const editButtons = await screen.findAllByRole("button", { name: /Ubah/i });
        for (const button of editButtons) {
            expect(button).toBeDisabled();
        }
        expect(screen.getByText(/hanya dapat melihat/)).toBeInTheDocument();
    });

    it("menampilkan error dan tombol coba lagi bila GET gagal", async () => {
        installFetch(true, true);
        const user = userEvent.setup();
        render(<UploadSettingsPage />);

        expect(await screen.findByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Coba lagi" }));
        expect(clientMocks.reportClientError).toHaveBeenCalled();
    });
});

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import StressmeterCheckinSheet from "@/components/employee/StressmeterCheckinSheet";

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/Toast", () => ({ useToast: () => toastMock }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_r: Response, f: string) => f),
    getFriendlyClientErrorMessage: vi.fn((err: unknown, f: string) =>
        err instanceof Error && err.message ? err.message : f
    ),
}));

function okResponse(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: vi.fn(async () => ({ success: true, data })),
    } as unknown as Response;
}

describe("StressmeterCheckinSheet", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
        document.body.style.overflow = "";
    });

    it("menjalankan journey lengkap: pilih bintang -> After Pengisian -> kirim curhat anonim", async () => {
        const calls: Array<{ url: string; body: unknown }> = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
                calls.push({ url, body });
                if (url === "/api/employee/stressmeter/checkin") {
                    return okResponse({
                        alreadySubmitted: false,
                        checkin: { id: "c1", shiftDate: "2026-11-23", rating: 4, skipped: false },
                    });
                }
                if (url === "/api/employee/stressmeter/anonymous-share") {
                    return okResponse({
                        id: "a1",
                        submittedWibDate: "2026-11-23",
                        topic: "WORKLOAD",
                    });
                }
                throw new Error(`Unexpected fetch ${url}`);
            })
        );

        const user = userEvent.setup();
        render(
            <StressmeterCheckinSheet
                isOpen
                onClose={vi.fn()}
                shiftDate="2026-11-23"
                timePeriodLabel="pagi ini"
            />
        );

        expect(
            screen.getByRole("heading", { name: "Hai, mau sharing perasaanmu pagi ini?" })
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "1 bintang: Feel So Bad" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "5 bintang: Sangat Termotivasi" })).toBeInTheDocument();
        // Tidak ada daftar 5 baris duplikat sebelum bintang di-hover/dipilih
        expect(screen.queryByText("Feel So Bad")).not.toBeInTheDocument();

        // Hover bintang 2 menampilkan label tepat di bawah bintang
        await user.hover(screen.getByRole("button", { name: "2 bintang: Cukup Frustasi" }));
        expect(screen.getByText("Cukup Frustasi")).toBeInTheDocument();

        // Pilih bintang 4 lalu Kirim
        await user.click(screen.getByRole("button", { name: "4 bintang: Cukup Terdorong" }));
        expect(screen.getByText("Cukup Terdorong")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Kirim" }));

        // Step 2: After Pengisian
        expect(
            await screen.findByText(/Thank you sudah mengisi, semoga harimu lebih baik yaa\./i)
        ).toBeInTheDocument();

        // Buka form curhat anonim di sheet yang sama
        await user.click(screen.getByRole("button", { name: "Share secara anonim di sini" }));
        expect(screen.getByRole("heading", { name: "Ruang Sharing Anonim" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Beban Kerja" }));
        await user.type(
            screen.getByLabelText("Ceritakan hal yang ingin Anda sampaikan"),
            "Perlu pembagian jadwal lembur yang lebih seimbang di tim."
        );
        await user.click(screen.getByRole("button", { name: "Kirim secara Anonim" }));

        expect(
            await screen.findByText("Pesan Anonim Anda Sudah Diterima")
        ).toBeInTheDocument();

        expect(calls).toContainEqual({
            url: "/api/employee/stressmeter/checkin",
            body: { shiftDate: "2026-11-23", skipped: false, rating: 4 },
        });
        expect(calls).toContainEqual({
            url: "/api/employee/stressmeter/anonymous-share",
            body: {
                topic: "WORKLOAD",
                message: "Perlu pembagian jadwal lembur yang lebih seimbang di tim.",
                includeSenderName: false,
            },
        });
    });

    it("mengizinkan karyawan mencentang sertakan nama lengkap (tidak anonim) dengan copy dan payload yang sesuai", async () => {
        const calls: Array<{ url: string; body: unknown }> = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
                calls.push({ url, body });
                return okResponse({
                    id: "a-named",
                    submittedWibDate: "2026-11-24",
                    topic: "FACILITIES",
                    senderName: "Budi Santoso",
                });
            })
        );

        const user = userEvent.setup();
        render(
            <StressmeterCheckinSheet
                isOpen
                onClose={vi.fn()}
                shiftDate="2026-11-24"
                initialStep="anonymous"
            />
        );

        // Default: 100% Anonim
        expect(screen.getByText(/100% Anonim\./i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Kirim secara Anonim" })).toBeInTheDocument();

        // Centang opsi sertakan nama lengkap
        const checkbox = screen.getByRole("checkbox", {
            name: /Sertakan nama lengkap saya \(tidak anonim\)/i,
        });
        expect(checkbox).not.toBeChecked();
        await user.click(checkbox);
        expect(checkbox).toBeChecked();

        // Banner & tombol langsung berubah dinamis agar tidak kontradiktif
        expect(screen.getByText(/Dengan nama lengkap\./i)).toBeInTheDocument();
        const submitBtn = screen.getByRole("button", { name: "Kirim dengan Nama" });
        expect(submitBtn).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Fasilitas & Lingkungan" }));
        await user.type(
            screen.getByLabelText("Ceritakan hal yang ingin Anda sampaikan"),
            "Mohon bantu pengecekan kursi kerja di area operasional."
        );
        expect(submitBtn).toBeEnabled();

        await user.click(submitBtn);

        expect(await screen.findByText("Pesan Anda Sudah Diterima")).toBeInTheDocument();
        expect(
            screen.getByText(/beserta nama lengkap Anda telah masuk ke kotak pesan HR\./i)
        ).toBeInTheDocument();
        expect(calls).toEqual([
            {
                url: "/api/employee/stressmeter/anonymous-share",
                body: {
                    topic: "FACILITIES",
                    message: "Mohon bantu pengecekan kursi kerja di area operasional.",
                    includeSenderName: true,
                },
            },
        ]);
    });

    it("saat klik Lewati (SKIP) tetap masuk ke layar After Pengisian dengan opsi sharing anonim", async () => {
        const fetchMock = vi.fn(async () =>
            okResponse({
                alreadySubmitted: false,
                checkin: { id: "c-skip", shiftDate: "2026-11-23", rating: null, skipped: true },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const user = userEvent.setup();
        render(
            <StressmeterCheckinSheet
                isOpen
                onClose={vi.fn()}
                shiftDate="2026-11-23"
                timePeriodLabel="pagi ini"
            />
        );

        await user.click(screen.getByRole("button", { name: "Lewati" }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(
            await screen.findByRole("button", { name: "Share secara anonim di sini" })
        ).toBeInTheDocument();
    });
});

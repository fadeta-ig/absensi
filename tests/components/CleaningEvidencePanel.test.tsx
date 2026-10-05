// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CleaningEvidencePanel } from "@/components/cleaning/CleaningEvidencePanel";

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

// Stub capture generik: komponen asli (kamera/canvas) tidak diuji di sini,
// panel hanya diverifikasi meneruskan batas + mengunggah draft.
vi.mock("@/app/employee/visits/components/MultiPhotoCapture", () => ({
    MultiPhotoCapture: ({
        photos,
        onPhotosChange,
        maxPhotos,
    }: {
        photos: Array<Record<string, unknown>>;
        onPhotosChange: (photos: Array<Record<string, unknown>>) => void;
        maxPhotos?: number;
    }) => (
        <div data-testid="capture-stub" data-maxphotos={maxPhotos ?? ""}>
            <span data-testid="draft-count">{photos.length}</span>
            <button
                type="button"
                onClick={() =>
                    onPhotosChange([
                        ...photos,
                        {
                            dataUrl: "data:image/jpeg;base64,/9j/",
                            capturedAtDevice: new Date().toISOString(),
                            category: "LAINNYA",
                            caption: "catatan uji",
                            file: new File(["fake-bytes"], "bukti.jpg", { type: "image/jpeg" }),
                            previewUrl: null,
                        },
                    ])
                }
            >
                Tambah foto stub
            </button>
        </div>
    ),
}));

function response(data: unknown, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 500,
        statusText: ok ? "OK" : "Server Error",
        url: "https://example.test/api/cleaning/evidence",
        json: vi.fn(async () => data),
        clone() {
            return this;
        },
    } as unknown as Response;
}

function listPayload(photos: Array<Record<string, unknown>>, maxPhotos = 3) {
    return { success: true, data: photos, maxPhotos, maxMb: 2 };
}

const photo1 = {
    id: "photo-1",
    url: "/api/cleaning/evidence/photo-1",
    mimeType: "image/jpeg",
    size: 1234,
    capturedAt: "2026-09-21T10:00:00.000+07:00",
    note: "wastafel",
};

describe("CleaningEvidencePanel (Tahap 3, mock-murni)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // resetAllMocks menghapus implementasi mock — pasang ulang fallback.
        clientMocks.getResponseErrorMessage.mockImplementation(
            async (_response: Response, fallback: string) => fallback
        );
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("collapsible: tombol hanya bila ada foto; kosong tanpa tombol", async () => {
        const fetchMock = vi.fn(async () => response(listPayload([photo1])));
        vi.stubGlobal("fetch", fetchMock);
        const user = userEvent.setup();

        const { unmount } = render(<CleaningEvidencePanel checklistItemId="item-1" collapsible />);
        expect(await screen.findByRole("button", { name: "Lihat foto (1)" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Lihat foto (1)" }));
        expect(await screen.findByAltText("wastafel")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Sembunyikan foto" }));
        expect(screen.queryByAltText("wastafel")).not.toBeInTheDocument();
        unmount();

        vi.stubGlobal("fetch", vi.fn(async () => response(listPayload([]))));
        cleanup();
        render(<CleaningEvidencePanel checklistItemId="item-2" collapsible />);
        expect(await screen.findByText("Tidak ada foto untuk pekerjaan ini.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Lihat foto/ })).not.toBeInTheDocument();
    });

    it("render: label cleaning + counter + thumbnail dari list", async () => {
        const fetchMock = vi.fn(async () => response(listPayload([photo1])));
        vi.stubGlobal("fetch", fetchMock);

        render(<CleaningEvidencePanel checklistItemId="item-1" />);

        expect(await screen.findByText("Foto bukti cleaning")).toBeInTheDocument();
        expect(screen.getByText("1/3 foto")).toBeInTheDocument();
        const thumbnail = await screen.findByAltText("wastafel");
        expect(thumbnail).toHaveAttribute("src", "/api/cleaning/evidence/photo-1");
        expect(fetchMock).toHaveBeenCalledWith("/api/cleaning/evidence?checklistItemId=item-1");
    });

    it("lock: batas tercapai menyembunyikan capture generik", async () => {
        const full = [photo1, { ...photo1, id: "photo-2" }, { ...photo1, id: "photo-3" }];
        vi.stubGlobal("fetch", vi.fn(async () => response(listPayload(full))));
        const user = userEvent.setup();

        render(<CleaningEvidencePanel checklistItemId="item-1" canUpload />);
        await user.click(await screen.findByText("Foto bukti cleaning"));

        expect(await screen.findByText("Batas 3 foto per item sudah tercapai.")).toBeInTheDocument();
        expect(screen.getByText("3/3 foto")).toBeInTheDocument();
        expect(screen.queryByTestId("capture-stub")).not.toBeInTheDocument();
    });

    it("batas: sisa slot diteruskan ke capture + kirim mengunggah FormData", async () => {
        const fetchMock = vi.fn();
        fetchMock
            .mockResolvedValueOnce(response(listPayload([photo1])))
            .mockResolvedValueOnce(response({ success: true, data: { id: "photo-2" } }))
            .mockResolvedValueOnce(response(listPayload([photo1, { ...photo1, id: "photo-2" }])));
        vi.stubGlobal("fetch", fetchMock);
        const user = userEvent.setup();

        render(<CleaningEvidencePanel checklistItemId="item-1" canUpload />);
        expect(await screen.findByTestId("capture-stub")).toBeInTheDocument();
        // Sisa 2 dari 3 diteruskan sebagai batas capture.
        expect(screen.getByTestId("capture-stub")).toHaveAttribute("data-maxphotos", "2");

        await user.click(screen.getByRole("button", { name: "Tambah foto stub" }));
        expect(screen.getByTestId("draft-count")).toHaveTextContent("1");

        await user.click(screen.getByRole("button", { name: "Kirim 1 foto" }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        const [, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(fetchMock.mock.calls[1][0]).toBe("/api/cleaning/evidence");
        expect(postInit.method).toBe("POST");
        const body = postInit.body as FormData;
        expect(body.get("checklistItemId")).toBe("item-1");
        expect((body.get("photo") as File).name).toBe("bukti.jpg");
        expect(body.get("note")).toBe("catatan uji");

        expect(await screen.findByText("2/3 foto")).toBeInTheDocument();
        expect(clientMocks.toast).toHaveBeenCalledWith("Foto bukti berhasil diunggah.", "success");
    });

    it("menampilkan pesan pulih saat unggah ditolak server (penuh/413)", async () => {
        const fetchMock = vi.fn();
        fetchMock
            .mockResolvedValueOnce(response(listPayload([])))
            .mockResolvedValueOnce(response({ error: "Batas 3 foto per item sudah tercapai." }, false))
            .mockResolvedValueOnce(response(listPayload([])));
        vi.stubGlobal("fetch", fetchMock);
        const user = userEvent.setup();

        render(<CleaningEvidencePanel checklistItemId="item-1" canUpload />);
        await user.click(await screen.findByRole("button", { name: "Tambah foto stub" }));
        await user.click(screen.getByRole("button", { name: "Kirim 1 foto" }));

        expect(await screen.findByText("Gagal mengunggah foto.")).toBeInTheDocument();
        expect(clientMocks.toast).toHaveBeenCalledWith("Gagal mengunggah foto.", "error");
    });
});

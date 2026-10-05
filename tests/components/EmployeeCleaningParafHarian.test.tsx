// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmployeeCleaningApprovalsPage from "@/app/employee/cleaning/approvals/page";

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

const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const APPROVAL_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";

function okResponse(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://example.test/api",
        json: vi.fn(async () => data),
        clone() {
            return this;
        },
    } as unknown as Response;
}

interface ParafOverride {
    percent?: number;
    completedCount?: number;
    activeCount?: number;
    isComplete?: boolean;
    isFree?: boolean;
    isHoliday?: boolean;
    holidayDescription?: string | null;
    parafs?: Array<Record<string, unknown>>;
    missingRoles?: string[];
}

function parafPayload(wibDate: string, override: ParafOverride = {}) {
    const percent = override.percent ?? 100;
    const activeCount = override.activeCount ?? 2;
    const completedCount = override.completedCount ?? (percent === 100 ? 2 : 1);
    const isComplete = override.isComplete ?? percent === 100;
    return {
        roomId: ROOM_ID,
        roomName: "Ruang Direksi",
        wibDate,
        monthWib: wibDate.slice(0, 7),
        isWeekend: false,
        isHoliday: override.isHoliday ?? false,
        isFree: override.isFree ?? false,
        holidayDescription: override.holidayDescription ?? null,
        checklist: { exists: true, activeCount, completedCount, percent, isComplete },
        reviewers: {
            inspectedByEmployeeId: "EMP001",
            inspectedByName: "Atasan Satu",
            knownByEmployeeId: "EMP002",
            knownByName: "Atasan Dua",
        },
        parafs: override.parafs ?? [],
        missingRoles: override.missingRoles ?? ["INSPECTED_BY", "KNOWN_BY"],
    };
}

function checklistPayload(wibDate: string, isComplete = true) {
    return {
        type: "record",
        checklist: {
            id: "checklist-1",
            wibDate,
            roomNameSnapshot: "Ruang Direksi",
            derivedStatus: isComplete ? "SELESAI" : "BELUM",
            items: [
                {
                    id: ITEM_ID,
                    itemNameSnapshot: "Lantai",
                    isActive: true,
                    isComplete,
                    lastChangedAt: `${wibDate}T03:15:00.000Z`,
                    lastChangedBy: { id: "worker-1", displayName: "Petugas Cleaning" },
                },
            ],
        },
    };
}

function evidencePayload() {
    return {
        success: true,
        data: [
            {
                id: "photo-1",
                url: "/api/cleaning/evidence/photo-1",
                mimeType: "image/jpeg",
                size: 1234,
                capturedAt: "2026-09-22T10:00:00.000+07:00",
                note: "wastafel",
            },
        ],
        maxPhotos: 3,
        maxMb: 2,
    };
}

function extractWibDate(url: string): string {
    const m = url.match(/wibDate=([\d-]+)/) ?? url.match(/date=([\d-]+)/);
    return m ? m[1] : "2026-09-22";
}

function installFetch(parafOverride: ParafOverride = {}, checklistComplete = true) {
    const calls: Array<{ url: string; method: string; body: unknown; headers: Record<string, string> }> = [];
    let signed = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        let body: unknown = null;
        if (typeof init?.body === "string") {
            try {
                body = JSON.parse(init.body);
            } catch {
                body = init.body;
            }
        }
        const headers: Record<string, string> = {};
        if (init?.headers && typeof init.headers === "object" && !Array.isArray(init.headers)) {
            for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
                headers[k.toLowerCase()] = String(v);
            }
        }
        calls.push({ url, method, body, headers });

        if (url.startsWith("/api/auth/me")) {
            return okResponse({ employeeId: "EMP001", username: "agus" });
        }
        if (url.startsWith("/api/employee/cleaning/approvals")) {
            return okResponse({
                success: true,
                data: [
                    {
                        approvalId: APPROVAL_ID,
                        roomId: ROOM_ID,
                        roomName: "Ruang Direksi",
                        monthWib: "2026-09",
                        role: "INSPECTED_BY",
                        roleLabel: "Diperiksa Oleh",
                        isSigned: false,
                        signedAt: null,
                        derivedStatus: "WAITING_FOR_SIGNATURES",
                        hasChangedAfterSigning: false,
                        latestChange: null,
                    },
                ],
                pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
            });
        }
        if (url.startsWith("/api/cleaning/paraf") && method === "POST") {
            signed = true;
            return okResponse({
                success: true,
                data: { parafId: "paraf-1", roomId: ROOM_ID, role: "INSPECTED_BY", status: "TEPAT" },
            });
        }
        if (url.includes("/api/cleaning/paraf?roomId=")) {
            const wibDate = extractWibDate(url);
            if (signed) {
                return okResponse({
                    data: parafPayload(wibDate, {
                        ...parafOverride,
                        percent: 100,
                        isComplete: true,
                        parafs: [
                            {
                                id: "paraf-1",
                                role: "INSPECTED_BY",
                                signerEmployeeId: "EMP001",
                                signerName: "Agus Bos",
                                signedAt: `${wibDate}T08:00:00.000+07:00`,
                                status: "TEPAT",
                            },
                        ],
                        missingRoles: ["KNOWN_BY"],
                    }),
                });
            }
            return okResponse({ data: parafPayload(wibDate, parafOverride) });
        }
        if (url.includes("/api/ga/cleaning/checklists")) {
            return okResponse({ data: checklistPayload(extractWibDate(url), checklistComplete) });
        }
        if (url.includes("/api/cleaning/evidence?checklistItemId=")) {
            return okResponse(evidencePayload());
        }
        throw new Error(`Unexpected fetch ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return { calls, fetchMock };
}

async function openDailyTab() {
    const user = userEvent.setup();
    render(<EmployeeCleaningApprovalsPage />);
    await user.click(screen.getByRole("tab", { name: "Paraf Harian" }));
    return user;
}

describe("Paraf harian bos di dashboard employee", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        clientMocks.getResponseErrorMessage.mockImplementation(async (_r: Response, f: string) => f);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("render daftar ruangan-tanggal menunggu paraf saya", async () => {
        installFetch();
        await openDailyTab();

        expect(await screen.findByTestId("paraf-harian-list")).toBeInTheDocument();
        expect(screen.getByText("Ruang Direksi")).toBeInTheDocument();
        expect(screen.getByText(/Checklist 100%/)).toBeInTheDocument();
        expect(screen.getByText(/Diperiksa oleh Atasan Satu, diketahui Atasan Dua/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Lihat Detail & Paraf/ })).toBeInTheDocument();
    });

    it("mengunci tombol paraf bila checklist belum 100%", async () => {
        installFetch({ percent: 50, completedCount: 1, activeCount: 2, isComplete: false }, false);
        const user = await openDailyTab();

        await user.click(await screen.findByRole("button", { name: /Lihat Detail & Paraf/ }));
        const dialog = await screen.findByRole("dialog", { name: "Detail dan paraf harian" });

        expect(await within(dialog).findByText(/Paraf dikunci hingga checklist 100% selesai/)).toBeInTheDocument();
        const saveButton = within(dialog).getByRole("button", { name: "Simpan Paraf" });
        expect(saveButton).toBeDisabled();
        expect(saveButton).toHaveAttribute("title", "Paraf terkunci");
    });

    it("menampilkan bebas paraf untuk hari libur dan menyembunyikan aksi paraf", async () => {
        installFetch({ isFree: true, isHoliday: true, holidayDescription: "Cuti bersama" });
        const user = await openDailyTab();

        expect(await screen.findAllByText(/Bebas paraf/)).not.toHaveLength(0);
        expect(screen.getByText(/Cuti bersama/)).toBeInTheDocument();

        await user.click(await screen.findByRole("button", { name: /Lihat Detail & Paraf/ }));
        const dialog = await screen.findByRole("dialog", { name: "Detail dan paraf harian" });
        expect(await within(dialog).findByText(/Bebas paraf/)).toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: "Simpan Paraf" })).not.toBeInTheDocument();
    });

    it("eksekusi paraf sukses dengan idempotency, lock, dan Toast", async () => {
        const { calls } = installFetch();
        const user = await openDailyTab();

        await user.click(await screen.findByRole("button", { name: /Lihat Detail & Paraf/ }));
        const saveButton = await screen.findByRole("button", { name: "Simpan Paraf" });
        expect(saveButton).toBeEnabled();
        await user.click(saveButton);

        await waitFor(() => {
            expect(clientMocks.toast).toHaveBeenCalledWith("Paraf harian berhasil disimpan.", "success");
        });

        const post = calls.find((c) => c.url === "/api/cleaning/paraf" && c.method === "POST");
        expect(post).toBeDefined();
        const postBody = post!.body as Record<string, string>;
        expect(postBody.roomId).toBe(ROOM_ID);
        expect(postBody.wibDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof postBody.idempotencyKey).toBe("string");
        expect(postBody.idempotencyKey.length).toBeGreaterThan(0);
        expect(post!.headers["x-idempotency-key"]).toBe(postBody.idempotencyKey);
    });

    it("detail tampil checklist item + foto bukti + paraf kedua peran Tepat waktu/Terlambat", async () => {
        installFetch({
            parafs: [
                {
                    id: "paraf-known",
                    role: "KNOWN_BY",
                    signerEmployeeId: "EMP002",
                    signerName: "Dimas Bos",
                    signedAt: "2026-09-22T09:00:00.000+07:00",
                    status: "TERLAMBAT",
                },
            ],
            missingRoles: ["INSPECTED_BY"],
        });
        const user = await openDailyTab();

        await user.click(await screen.findByRole("button", { name: /Lihat Detail & Paraf/ }));
        expect(await screen.findByText("Lantai")).toBeInTheDocument();
        expect(screen.getByText(/Petugas Cleaning/)).toBeInTheDocument();

        await user.click(await screen.findByRole("button", { name: /Lihat foto \(\d+\)/ }));
        const dialog = screen.getByRole("dialog", { name: "Detail dan paraf harian" });
        expect(await within(dialog).findByAltText("wastafel")).toHaveAttribute(
            "src",
            "/api/cleaning/evidence/photo-1"
        );

        expect(within(dialog).getByText(/Dimas Bos/)).toBeInTheDocument();
        expect(within(dialog).getByText("Terlambat")).toBeInTheDocument();
        expect(within(dialog).getByText(/Mengetahui/)).toBeInTheDocument();
    });
});

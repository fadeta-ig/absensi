// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CleaningOverviewPage from "@/app/employee/cleaning/overview/page";

vi.mock("@/components/Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_r: Response, f: string) => f),
}));
vi.mock("@/components/cleaning/CleaningEvidencePanel", () => ({
    CleaningEvidencePanel: ({ checklistItemId }: { checklistItemId: string }) => (
        <div data-testid={`evidence-${checklistItemId}`}>foto-panel</div>
    ),
}));

const OVERVIEW = {
    monthWib: "2026-10",
    rooms: [
        {
            roomId: "room-1",
            roomName: "Ruang Direksi",
            checklist: { total: 5, selesai: 5, belum: 0, percent: 100 },
            paraf: {
                tepat: 8,
                terlambat: 2,
                missing: 0,
                lateBySigner: [{ employeeId: "EMP001", name: "Agus", terlambat: 2, tepat: 3 }],
            },
            reviewers: {
                inspectedByEmployeeId: "EMP001",
                inspectedByName: "Agus",
                knownByEmployeeId: "EMP002",
                knownByName: "Dimas",
            },
            signatures: { inspectedSigned: true, knownSigned: false, derivedStatus: "PARTIALLY_SIGNED" },
        },
    ],
};

const PARAF = {
    roomId: "room-1",
    roomName: "Ruang Direksi",
    wibDate: "2026-10-05",
    monthWib: "2026-10",
    isWeekend: false,
    isWeeklyOff: false,
    weeklyOffDays: [0, 6],
    isHoliday: false,
    isFree: false,
    holidayDescription: null,
    checklist: { exists: true, activeCount: 1, completedCount: 1, percent: 100, isComplete: true },
    reviewers: {
        inspectedByEmployeeId: "EMP001",
        inspectedByName: "Agus",
        knownByEmployeeId: "EMP002",
        knownByName: "Dimas",
    },
    parafs: [
        { id: "p1", role: "KNOWN_BY", signerEmployeeId: "EMP002", signerName: "Dimas", signedAt: "2026-10-05T10:00:00+07:00", status: "TEPAT" },
    ],
    missingRoles: ["INSPECTED_BY"],
};

const CHECKLIST = {
    type: "record",
    checklist: {
        id: "cl-1",
        wibDate: "2026-10-05",
        roomNameSnapshot: "Ruang Direksi",
        derivedStatus: "SELESAI",
        items: [
            {
                id: "item-1",
                itemNameSnapshot: "Lantai",
                isActive: true,
                isComplete: true,
                lastChangedAt: "2026-10-05T03:00:00.000Z",
                lastChangedBy: { id: "w1", displayName: "Heri" },
            },
        ],
    },
};

function response(data: unknown): Response {
    return { ok: true, status: 200, json: vi.fn(async () => data) } as unknown as Response;
}

describe("CleaningOverviewPage (viewer read-only)", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("tampilkan agregat + daftar lambat + drill-down harian tanpa aksi tulis", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes("/api/ga/cleaning/overview?")) return response({ success: true, data: OVERVIEW });
                if (url.includes("/api/cleaning/paraf?")) return response({ success: true, data: PARAF });
                if (url.includes("/api/ga/cleaning/checklists?")) return response({ success: true, data: CHECKLIST });
                throw new Error(`Unexpected fetch ${url}`);
            })
        );
        const user = userEvent.setup();
        render(<CleaningOverviewPage />);

        expect(await screen.findAllByText("Ruang Direksi")).not.toHaveLength(0);
        expect(screen.getByText("Ringkasan bulan 2026-10")).toBeInTheDocument();
        expect(screen.getAllByText(/Harian per ruangan/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/dari .* paraf wajib/)).toBeNull();
        expect(screen.getAllByText(/Terlambat 2x/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Agus/).length).toBeGreaterThan(0);
        // Tanpa tombol paraf/TTD di mana pun.
        expect(screen.queryByRole("button", { name: /paraf|tanda tangan/i })).toBeNull();

        const detailButtons = await screen.findAllByRole("button", { name: "Lihat detail harian" });
        await user.click(detailButtons[0]);
        await waitFor(() => expect(screen.getByText("Lantai")).toBeInTheDocument());
        expect(screen.getByText(/Heri/)).toBeInTheDocument();
        expect(await screen.findByTestId("evidence-item-1")).toBeInTheDocument();
        expect(screen.getByText(/^Menunggu:/)).toBeInTheDocument();
        expect(screen.getByText("Paraf 1/2")).toBeInTheDocument();
        expect(screen.getAllByText(/Dimas ·/).length).toBeGreaterThan(0);
    });
});

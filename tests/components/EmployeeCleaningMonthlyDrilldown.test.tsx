// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmployeeCleaningApprovalsPage from "@/app/employee/cleaning/approvals/page";

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
vi.mock("@/components/ui/SignaturePad", () => ({
    default: () => <div data-testid="signature-pad">pad</div>,
}));

function response(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: vi.fn(async () => data),
    } as unknown as Response;
}

const ROOM_ID = "room-1";

function installFetch() {
    return vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("/api/employee/cleaning/approvals?monthWib=")) {
                return response({
                    data: [
                        {
                            approvalId: "appr-1",
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
                });
            }
            if (url.includes("/api/employee/cleaning/approvals?approvalId=")) {
                return response({
                    data: {
                        id: "appr-1",
                        roomId: ROOM_ID,
                        roomName: "Ruang Direksi",
                        monthWib: "2026-09",
                        dates: ["2026-09-20"],
                        days: [{ date: "2026-09-20", status: "SELESAI", activeCount: 1, completedCount: 1 }],
                        inspectedByEmployeeName: "Agus",
                        knownByEmployeeName: "Dimas",
                        userRoles: [
                            { role: "INSPECTED_BY", roleLabel: "Diperiksa Oleh", isSigned: false, signature: null },
                            { role: "KNOWN_BY", roleLabel: "Mengetahui", isSigned: true, signature: null },
                        ],
                        derivedStatus: "PARTIALLY_SIGNED",
                        latestChange: null,
                    },
                });
            }
            if (url.includes("/api/cleaning/paraf?")) {
                return response({
                    data: {
                        roomId: ROOM_ID,
                        roomName: "Ruang Direksi",
                        wibDate: "2026-09-20",
                        monthWib: "2026-09",
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
                            { id: "p1", role: "KNOWN_BY", signerEmployeeId: "EMP002", signerName: "Dimas", signedAt: "2026-09-20T10:00:00+07:00", status: "TEPAT" },
                        ],
                        missingRoles: ["INSPECTED_BY"],
                    },
                });
            }
            if (url.includes("/api/ga/cleaning/checklists?")) {
                return response({
                    data: {
                        type: "record",
                        checklist: {
                            id: "cl-1",
                            wibDate: "2026-09-20",
                            roomNameSnapshot: "Ruang Direksi",
                            derivedStatus: "SELESAI",
                            items: [
                                {
                                    id: "item-1",
                                    itemNameSnapshot: "Lantai",
                                    isActive: true,
                                    isComplete: true,
                                    lastChangedAt: "2026-09-20T03:00:00.000Z",
                                    lastChangedBy: { id: "w1", displayName: "Heri" },
                                },
                                {
                                    id: "item-2",
                                    itemNameSnapshot: "Kaca",
                                    isActive: true,
                                    isComplete: false,
                                    lastChangedAt: null,
                                    lastChangedBy: null,
                                },
                            ],
                        },
                    },
                });
            }
            throw new Error(`Unexpected fetch ${url}`);
        })
    );
}

describe("Monthly drill-down harian reviewer", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("ketuk tanggal menampilkan item, siapa kerjakan, foto, dan paraf", async () => {
        installFetch();
        const user = userEvent.setup();
        render(<EmployeeCleaningApprovalsPage />);

        await user.click(await screen.findByRole("button", { name: /Tanda Tangani Dokumen/ }));
        const dialog = await screen.findByRole("dialog", { name: "Persetujuan Inspeksi Ruangan" });

        // Kedua peran terlihat (bukan hanya peran sendiri).
        expect(within(dialog).getByText(/Dimas/)).toBeInTheDocument();

        await user.click(await within(dialog).findByTitle("2026-09-20: SELESAI"));
        await waitFor(() => expect(within(dialog).getByText("Lantai")).toBeInTheDocument());

        // Siapa kerjakan + yang belum + foto + paraf peran lain.
        expect(within(dialog).getByText(/Heri/)).toBeInTheDocument();
        expect(within(dialog).getByText("Kaca")).toBeInTheDocument();
        expect(await within(dialog).findByTestId("evidence-item-1")).toBeInTheDocument();
        expect(within(dialog).getByText(/Menunggu paraf dari/)).toBeInTheDocument();
    });
});

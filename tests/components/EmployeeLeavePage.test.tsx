// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import LeavePage from "@/app/employee/leave/page";
import { addCalendarDays, toWIBDateString } from "@/lib/timezone";

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/Toast", () => ({ useToast: () => toastMock }));
vi.mock("@/hooks/useGlobalHolidays", () => ({
    useGlobalHolidays: () => ({
        holidays: [],
        holidaysByDate: new Map(),
        isLoading: false,
        error: "",
    }),
}));
vi.mock("@/hooks/useEmployeeDraft", () => ({
    useEmployeeDraft: () => ({
        restored: false,
        clearDraft: vi.fn(),
        discardDraft: vi.fn(),
    }),
}));

function jsonResponse(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: vi.fn(async () => data),
        clone() {
            return this;
        },
    } as unknown as Response;
}

describe("EmployeeLeavePage", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
        document.body.style.overflow = "";
    });

    it("menampilkan saldo ringkas tanpa duplikasi, filter status riwayat, dan tombol besok (H+1) di mode Izin Sakit", async () => {
        const tomorrow = addCalendarDays(toWIBDateString(), 1);
        const tomorrowDay = String(Number(tomorrow.slice(8, 10)));

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.startsWith("/api/leave?withBalance=1")) {
                    return jsonResponse({
                        leaves: [
                            {
                                id: "lv-1",
                                type: "annual",
                                startDate: "2026-12-01",
                                endDate: "2026-12-01",
                                reason: "Acara keluarga",
                                status: "pending",
                                createdAt: "2026-11-23T08:00:00.000Z",
                            },
                            {
                                id: "lv-2",
                                type: "paternity",
                                startDate: "2026-10-01",
                                endDate: "2026-10-03",
                                reason: "Mendampingi istri melahirkan",
                                status: "approved",
                                createdAt: "2026-09-28T08:00:00.000Z",
                            },
                        ],
                        balance: {
                            totalLeave: 12,
                            usedLeave: 3,
                            pendingAnnualDays: 1,
                            remainingLeave: 9,
                            availableAnnualLeave: 8,
                        },
                    });
                }
                if (url.startsWith("/api/employee/shift-schedule")) {
                    return jsonResponse([
                        { date: tomorrow, isOff: false, shiftId: "shift-1", shiftName: "Reguler" },
                    ]);
                }
                throw new Error(`Unexpected fetch ${url}`);
            })
        );

        const user = userEvent.setup();
        render(<LeavePage />);

        expect(await screen.findByRole("heading", { name: "Cuti & Izin" })).toBeInTheDocument();
        expect(screen.getByText("Sisa Tersedia")).toBeInTheDocument();
        expect(screen.queryByText(/Sisa disetujui:/i)).not.toBeInTheDocument();
        expect(screen.getByText("Cuti Ayah")).toBeInTheDocument();

        // Filter riwayat berdasarkan status Disetujui
        await user.click(screen.getByRole("button", { name: "Disetujui (1)" }));
        expect(screen.getByText("Mendampingi istri melahirkan")).toBeInTheDocument();
        expect(screen.queryByText("Acara keluarga")).not.toBeInTheDocument();

        // Buka ResponsiveSheet Ajukan Cuti -> ganti ke Izin Sakit -> pastikan besok (H+1) tersedia
        await user.click(screen.getByRole("button", { name: /Ajukan Cuti/i }));
        expect(screen.getByRole("dialog", { name: "Ajukan Cuti & Izin" })).toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText("Jenis Cuti / Izin"), "sick");
        const dayButtons = await screen.findAllByRole("button", { pressed: false });
        const hasTomorrow = dayButtons.some((btn) => btn.textContent?.includes(tomorrowDay));
        expect(hasTomorrow).toBe(true);

        // Cek validasi durasi langsung pada Cuti Ayah (maks 3 hari kalender)
        await user.selectOptions(screen.getByLabelText("Jenis Cuti / Izin"), "paternity");
        expect(
            screen.getByText(/Khusus karyawan laki-laki, maksimal 3 hari kalender/i)
        ).toBeInTheDocument();
    });
});

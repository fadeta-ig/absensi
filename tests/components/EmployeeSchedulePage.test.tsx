/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import EmployeeSchedulePage from "@/app/employee/schedule/page";

// Mock matchMedia for jsdom
Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

const mockToast = vi.fn();
vi.mock("@/components/Toast", () => ({
    useToast: () => mockToast,
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("EmployeeSchedulePage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => [
                {
                    date: "2026-09-29",
                    weekday: 2,
                    shiftId: "shift-1",
                    shiftName: "Shift Pagi",
                    startTime: "08:00",
                    endTime: "16:00",
                    isOff: false,
                    isOvernight: false,
                    source: "assignment"
                },
                {
                    date: "2026-09-30",
                    weekday: 3,
                    shiftId: "shift-2",
                    shiftName: "Shift Malam",
                    startTime: "23:00",
                    endTime: "07:00",
                    isOff: false,
                    isOvernight: true,
                    source: "fallback"
                },
                {
                    date: "2026-10-01",
                    weekday: 4,
                    shiftId: null,
                    shiftName: null,
                    startTime: null,
                    endTime: null,
                    isOff: true,
                    isOvernight: false,
                    source: "default"
                }
            ],
        });
    });

    it("renders the loading state initially and then shows schedule", async () => {
        render(<EmployeeSchedulePage />);

        expect(screen.getByText("Memuat jadwal kerja...")).not.toBeNull();

        await waitFor(() => {
            expect(screen.queryByText("Memuat jadwal kerja...")).toBeNull();
        });

        expect(screen.getByText("Shift Pagi")).not.toBeNull();
        expect(screen.getByText("08:00 - 16:00 WIB")).not.toBeNull();
        expect(screen.getByText("Roster")).not.toBeNull(); // source = assignment
        
        expect(screen.getByText("Shift Malam")).not.toBeNull();
        expect(screen.getByText("Malam")).not.toBeNull(); // isOvernight = true
        expect(screen.getByText("Dasar")).not.toBeNull(); // source = fallback
        
        expect(screen.getByText("Libur")).not.toBeNull(); // isOff = true
    });

    it("shows error when API fails", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ error: "Internal Server Error" }),
        });

        render(<EmployeeSchedulePage />);

        await waitFor(() => {
            expect(screen.queryByText("Gagal memuat jadwal shift.")).not.toBeNull();
        });

        expect(mockToast).toHaveBeenCalledWith("Gagal memuat jadwal shift.", "error");
    });
});

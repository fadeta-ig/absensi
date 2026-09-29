// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceLogTab } from "@/app/dashboard/attendance/components/AttendanceLogTab";
import type { AttendanceRecord } from "@/app/dashboard/attendance/types";

vi.mock("@/components/Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/lib/export", () => ({ exportToExcel: vi.fn() }));

const record: AttendanceRecord = {
    id: "att-1",
    employeeId: "ID-001",
    date: "2026-09-28",
    clockIn: "2026-09-27T16:00:00.000Z",
    clockOut: "2026-09-28T00:00:00.000Z",
    status: "present",
    isOffDay: true,
    offDayReason: "Piket operasional malam",
    shiftDate: "2026-09-28",
    shiftName: "Shift Malam",
    shiftStartTime: "23:00",
    shiftEndTime: "07:00",
    isOvernight: true,
};

const props = {
    paginatedRecords: [record],
    filteredRecords: [record],
    filteredLength: 1,
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1,
    setCurrentPage: vi.fn(),
    setItemsPerPage: vi.fn(),
    getEmpInfo: () => ({ name: "Budi", department: "IT", division: "Tech" }),
    formatTime: (value?: string) => value ?? "-",
    statusLabel: (value: string) => value,
    setPhotoPreview: vi.fn(),
};

describe("AttendanceLogTab", () => {
    beforeEach(() => vi.resetAllMocks());
    afterEach(() => cleanup());

    it("labels the shift date, shows WIB clock columns, and keeps the reason visible", () => {
        render(<AttendanceLogTab {...props} />);

        expect(screen.getByText("Tanggal Shift")).toBeInTheDocument();
        expect(screen.getByText("Clock In (WIB)")).toBeInTheDocument();
        expect(screen.getByText("Clock Out (WIB)")).toBeInTheDocument();
        expect(screen.getByText("Piket operasional malam")).toBeInTheDocument();
        expect(screen.getByText("Lintas Hari H+1")).toBeInTheDocument();
        expect(screen.getByText(/Durasi 8 jam/)).toBeInTheDocument();
    });

    it("opens the lazy photo URL when the list only carries a photo flag", async () => {
        const setPhotoPreview = vi.fn();
        const { rerender } = render(<AttendanceLogTab {...props} setPhotoPreview={setPhotoPreview} />);
        rerender(
            <AttendanceLogTab
                {...props}
                setPhotoPreview={setPhotoPreview}
                paginatedRecords={[{ ...record, clockInPhoto: null, hasClockInPhoto: true }]}
            />
        );

        const buttons = screen.getAllByTitle("Lihat foto masuk");
        buttons[0].click();
        expect(setPhotoPreview).toHaveBeenCalledWith(
            expect.objectContaining({ url: `/api/attendance/photos/${record.id}?phase=clockIn` })
        );
    });

    it("shows an authoritative overnight badge for an open normal record clocked in on its shift date", () => {
        render(
            <AttendanceLogTab
                {...props}
                paginatedRecords={[{
                    ...record,
                    id: "att-open",
                    clockOut: undefined,
                    isOffDay: false,
                    offDayReason: null,
                    isOvernight: true,
                }]}
            />
        );

        expect(screen.getByText("Lintas Hari H+1")).toBeInTheDocument();
        expect(screen.getByTitle("Shift Malam: 23:00-07:00")).toBeInTheDocument();
    });
});

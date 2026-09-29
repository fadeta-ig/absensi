// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceCorrectionTab } from "@/app/dashboard/attendance/components/AttendanceCorrectionTab";

vi.mock("@/components/Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/components/ConfirmModal", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/hooks/useTablePagination", () => ({
    useTablePagination: () => ({
        currentPage: 1,
        pageSize: 10,
        setPage: vi.fn(),
        setPageSize: vi.fn(),
    }),
}));

const correction = {
    id: "corr-1",
    employeeId: "ID-001",
    targetDate: "2026-09-27",
    proposedClockIn: "2026-09-27T16:00:00.000Z",
    proposedClockOut: "2026-09-28T00:00:00.000Z",
    reason: "Lupa clock-out",
    attachmentUrl: null,
    status: "PENDING" as const,
    assignedManagerId: null,
    createdAt: "2026-09-28T01:00:00.000Z",
};

const props = {
    corrections: [correction],
    loading: false,
    error: "",
    processingIds: new Set<string>(),
    getEmpInfo: () => ({ name: "Budi", department: "IT", division: "Tech" }),
};

describe("AttendanceCorrectionTab", () => {
    beforeEach(() => vi.resetAllMocks());
    afterEach(() => cleanup());

    it("renders proposed times in WIB and locks the row while its PATCH is in flight", async () => {
        const handleCorrectionAction = vi.fn(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return true;
        });
        const { rerender } = render(
            <AttendanceCorrectionTab {...props} handleCorrectionAction={handleCorrectionAction} />
        );

        expect(screen.getByText(/23[.:]00 WIB/)).toBeInTheDocument();

        const approve = screen.getByTitle("Terima Langsung");
        await userEvent.click(approve);
        await waitFor(() => expect(handleCorrectionAction).toHaveBeenCalledTimes(1));

        rerender(
            <AttendanceCorrectionTab
                {...props}
                processingIds={new Set(["corr-1"])}
                handleCorrectionAction={handleCorrectionAction}
            />
        );
        expect(screen.getByTitle("Terima Langsung")).toBeDisabled();
    });
});

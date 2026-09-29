// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttendanceSummary } from "@/app/dashboard/attendance/components/AttendanceSummary";

describe("AttendanceSummary", () => {
    afterEach(() => cleanup());

    it("renders one period scope covering the same filtered log range", () => {
        render(
            <AttendanceSummary
                present={10}
                late={3}
                total={12}
                scopeLabel="Periode 2026-09-01 s/d 2026-09-30 • mengikuti filter aktif"
            />
        );

        expect(screen.getByText(/Periode 2026-09-01 s\/d 2026-09-30/)).toBeInTheDocument();
        expect(screen.getByText("10")).toBeInTheDocument();
        expect(screen.getByText("Hadir Tepat Waktu")).toBeInTheDocument();
        expect(screen.getByText("Terlambat")).toBeInTheDocument();
        expect(screen.getByText("12")).toBeInTheDocument();
    });

    it("exposes the absent card as a keyboard-accessible button", async () => {
        const onSelect = vi.fn();
        render(
            <AttendanceSummary present={10} late={0} total={12} absent={2} onSelectAbsentTab={onSelect} />
        );

        const button = screen.getByRole("button", { name: /Belum Hadir/i });
        expect(button).toBeInTheDocument();
        await userEvent.click(button);
        expect(onSelect).toHaveBeenCalledOnce();
    });
});

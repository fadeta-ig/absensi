// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Employee360View } from "@/components/Employee360View";
import { employee360Fixture } from "../fixtures/employee360";

describe("Employee360View date/time presentation", () => {
    afterEach(cleanup);

    it("renders serialized timestamps in WIB, preserves legacy clocks, and labels next-day clock-out", () => {
        const { container } = render(<Employee360View {...employee360Fixture} />);
        expect(screen.getAllByText("17:03 WIB").length).toBeGreaterThan(0);
        expect(screen.getAllByText("08:06 WIB").length).toBeGreaterThan(0);
        expect(screen.getAllByText("08:00 WIB").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Belum tercatat").length).toBeGreaterThan(0);
        expect(screen.getAllByText("2 Okt 2026").length).toBeGreaterThan(2);
        expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it("switches all history sections while displaying friendly dates and fixed WIB audit times", async () => {
        const user = userEvent.setup();
        const { container } = render(<Employee360View {...employee360Fixture} compact />);
        await user.click(screen.getByRole("button", { name: "Kunjungan" }));
        expect(screen.getByText("Masuk: 08:00 WIB")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Cuti" }));
        expect(screen.getAllByText("5 Okt 2026").length).toBeGreaterThan(0);
        expect(screen.getAllByText("s/d 6 Okt 2026").length).toBeGreaterThan(0);
        await user.click(screen.getByRole("button", { name: "Aset" }));
        expect(screen.getAllByText("LAPTOP-CONTOH-001").length).toBeGreaterThan(0);
        await user.click(screen.getByRole("button", { name: "Status Kerja" }));
        expect(screen.getByRole("button", { name: "Status Kerja" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText("Dicatat 2 Okt 2026, 01:30 WIB")).toBeInTheDocument();
        expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it("keeps empty histories readable and does not add status access when unavailable", () => {
        render(<Employee360View {...employee360Fixture} recentAttendance={[]} statusHistory={undefined} />);
        expect(screen.getByText("Belum ada data presensi")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Status Kerja" })).not.toBeInTheDocument();
    });
});

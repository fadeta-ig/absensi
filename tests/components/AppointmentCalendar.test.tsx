// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppointmentCalendar from "@/components/appointments/AppointmentCalendar";

vi.mock("@/lib/clientErrors", () => ({
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_r: Response, f: string) => f),
}));

afterEach(() => cleanup());

const ITEMS = new Map([
    [
        "2026-10-20",
        [
            { id: "a1", title: "Rapat Koordinasi", status: "SCHEDULED", lifecycle: "IN_PROGRESS", startAt: "2026-10-20T10:00:00+07:00", endAt: "2026-10-20T11:00:00+07:00", isFullDay: false, room: { name: "Ruang A" } },
            { id: "a2", title: "Briefing", status: "SCHEDULED", lifecycle: "SCHEDULED", startAt: "2026-10-20T13:00:00+07:00", endAt: "2026-10-20T14:00:00+07:00", isFullDay: false, room: null },
        ],
    ],
]);

describe("AppointmentCalendar", () => {
    it("merender grid + item appointment + legend", () => {
        render(<AppointmentCalendar appointmentsByDate={ITEMS} selectedDate="2026-10-20" onSelectDate={() => undefined} />);
        expect(screen.getByText("Kalender Janji Rapat")).toBeInTheDocument();
        expect(screen.getByText("Oktober 2026")).toBeInTheDocument();
        expect(screen.getByTitle("10.00 Rapat Koordinasi")).toBeInTheDocument();
        expect(screen.getByText("Terjadwal")).toBeInTheDocument();
        expect(screen.getByText("Sedang Berlangsung")).toBeInTheDocument();
    });

    it("klik tanggal memanggil onSelectDate", async () => {
        const user = userEvent.setup();
        const onSelectDate = vi.fn();
        render(<AppointmentCalendar appointmentsByDate={ITEMS} selectedDate="2026-10-01" onSelectDate={onSelectDate} />);
        await user.click(screen.getByRole("button", { name: "Pilih tanggal 2026-10-21" }));
        expect(onSelectDate).toHaveBeenCalledWith("2026-10-21");
    });
});

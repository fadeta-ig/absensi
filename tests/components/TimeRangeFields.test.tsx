// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import TimeRangeFields, { formatDurationId, hmToMinutes, minutesToHm } from "@/components/appointments/TimeRangeFields";

afterEach(() => cleanup());

describe("TimeRangeFields helpers", () => {
    it("konversi HH:mm <-> menit dan format durasi Bahasa Indonesia", () => {
        expect(hmToMinutes("09:30")).toBe(570);
        expect(hmToMinutes("24:00")).toBeNull();
        expect(minutesToHm(570)).toBe("09:30");
        expect(minutesToHm(9999)).toBe("23:59");
        expect(formatDurationId(30)).toBe("30 menit");
        expect(formatDurationId(120)).toBe("2 jam");
        expect(formatDurationId(90)).toBe("1 jam 30 menit");
    });
});

describe("TimeRangeFields", () => {
    it("memilih durasi menghitung jam selesai dari jam mulai (WIB)", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<TimeRangeFields idPrefix="t" startTime="10:00" endTime="11:00" onChange={onChange} />);

        expect(screen.getByText("10:00–11:00 WIB · 1 jam")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "2 jam" }));
        expect(onChange).toHaveBeenCalledWith("10:00", "12:00");
    });

    it("menggeser jam mulai mempertahankan durasi yang berlaku", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<TimeRangeFields idPrefix="t" startTime="10:00" endTime="12:00" onChange={onChange} />);

        await user.click(screen.getByLabelText(/Jam Mulai/));
        await user.keyboard("{Control>}a{/Control}13:00");
        expect(onChange).toHaveBeenLastCalledWith("13:00", "15:00");
    });
});

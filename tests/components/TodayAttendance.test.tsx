// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TodayAttendance from "@/components/dashboard/TodayAttendance";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("TodayAttendance", () => {
    afterEach(() => cleanup());

    it("renders clock times explicitly in WIB without a misleading absent list", () => {
        render(
            <TodayAttendance
                todayAttendance={[
                    {
                        employeeId: "ID-001",
                        date: "2026-09-28",
                        status: "present",
                        clockIn: "2026-09-28T00:00:00.000Z",
                        clockOut: "2026-09-28T10:00:00.000Z",
                    },
                ]}
                employees={[]}
                news={[]}
                getEmployeeName={() => "Budi"}
            />
        );

        expect(screen.getByText(/07[.:]00 WIB/)).toBeInTheDocument();
        expect(screen.getByText(/17[.:]00 WIB/)).toBeInTheDocument();
        expect(screen.queryByText(/Belum Hadir Hari Ini/)).not.toBeInTheDocument();
    });
});

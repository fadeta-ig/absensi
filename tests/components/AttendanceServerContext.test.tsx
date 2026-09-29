// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAttendanceServerContext } from "@/hooks/useAttendanceServerContext";

function response(data: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: vi.fn(async () => data),
    } as unknown as Response;
}

const snapshot = {
    serverWibNow: "2026-09-28T10:00:00+07:00",
    serverWibDate: "2026-09-28",
    shiftDate: "2026-09-27",
    activeMode: "CLOCK_OUT",
    isOvernight: true,
    todaySchedule: { startTime: "23:00", endTime: "07:00", isOff: false },
    isOfficeWifi: true,
    clientIp: "192.168.20.10",
    bypassLocation: false,
    networkName: "Wi-Fi Kantor WIG",
    isOffDay: false,
    shiftName: "Shift 3",
};

function ContextProbe() {
    const value = useAttendanceServerContext();
    const [, setTick] = useState(0);
    return (
        <div>
            <span data-testid="clock">{value.displayWibTime}</span>
            <span data-testid="date">{value.context?.shiftDate}</span>
            <span data-testid="state">{value.isFresh ? "fresh" : "stale"}</span>
            <button type="button" onClick={() => setTick((tick) => tick + 1)}>render</button>
        </div>
    );
}

describe("useAttendanceServerContext", () => {
    let monotonicNow = 1_000;

    beforeEach(() => {
        vi.spyOn(performance, "now").mockImplementation(() => monotonicNow);
        vi.stubGlobal("fetch", vi.fn(async () => response(snapshot)));
        window.sessionStorage.clear();
        Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("anchors the display clock to the server snapshot using monotonic elapsed time", async () => {
        render(<ContextProbe />);

        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("fresh"));
        expect(screen.getByTestId("clock")).toHaveTextContent(/10[.:]00[.:]00/);
        expect(screen.getByTestId("date")).toHaveTextContent("2026-09-27");
        expect(fetch).toHaveBeenCalledWith("/api/attendance/network", expect.objectContaining({ cache: "no-store" }));

        monotonicNow += 2_000;
        act(() => screen.getByRole("button", { name: "render" }).click());
        expect(screen.getByTestId("clock")).toHaveTextContent(/10[.:]00[.:]02/);
    });

    it("freezes the last server-derived clock and marks it stale while offline", async () => {
        render(<ContextProbe />);
        await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("fresh"));

        monotonicNow += 2_000;
        act(() => screen.getByRole("button", { name: "render" }).click());
        const lastServerTime = screen.getByTestId("clock").textContent;

        act(() => window.dispatchEvent(new Event("offline")));
        monotonicNow += 60_000;
        act(() => screen.getByRole("button", { name: "render" }).click());

        expect(screen.getByTestId("state")).toHaveTextContent("stale");
        expect(screen.getByTestId("clock")).toHaveTextContent(lastServerTime ?? "");
    });

    it("keeps a stored server snapshot stale when refresh fails", async () => {
        window.sessionStorage.setItem("attendance-server-context", JSON.stringify(snapshot));
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network unavailable"); }));

        render(<ContextProbe />);

        await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        expect(screen.getByTestId("state")).toHaveTextContent("stale");
        expect(screen.getByTestId("clock")).toHaveTextContent(/10[.:]00[.:]00/);
        expect(screen.getByTestId("date")).toHaveTextContent("2026-09-27");
    });
});

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AttendancePage from "@/app/employee/attendance/page";

const mocks = vi.hoisted(() => ({
    toast: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(async () => undefined),
    reportClientError: vi.fn(),
    isOnline: true,
    isFresh: true,
}));

const context = {
    serverWibNow: "2026-09-29T06:30:00+07:00",
    serverWibDate: "2026-09-29",
    shiftDate: "2026-09-28",
    activeMode: "CLOCK_OUT" as const,
    isOvernight: true,
    todaySchedule: { startTime: "23:00", endTime: "07:00", isOff: false },
    isOfficeWifi: false,
    clientIp: "203.0.113.5",
    bypassLocation: true,
    networkName: "Bypass Khusus",
    isOffDay: false,
    shiftName: "Shift 3",
};

vi.mock("@/hooks/useAttendanceServerContext", () => ({
    useAttendanceServerContext: () => ({
        context,
        loading: false,
        error: null,
        isOnline: mocks.isOnline,
        isFresh: mocks.isFresh,
        displayWibTime: "06.30.00",
        displayWibDate: "2026-09-29",
        displayWibHour: 6,
        refresh: mocks.refresh,
    }),
}));
vi.mock("@/components/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/clientLogger", () => ({ createClientLogger: () => ({ warn: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: mocks.reportClientError,
    getResponseErrorMessage: vi.fn(async (response: Response, fallback: string) => {
        const data = await response.json() as { error?: unknown; message?: unknown };
        if (typeof data.error === "string" && data.error.trim()) return data.error;
        if (typeof data.message === "string" && data.message.trim()) return data.message;
        return fallback;
    }),
}));
vi.mock("@/lib/gpsValidator", () => ({
    getValidatedPosition: vi.fn(async () => ({
        position: { coords: { latitude: -6.2, longitude: 106.8, accuracy: 5 } },
        validation: { isValid: true, warnings: [] },
    })),
}));

function response(data: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn(async () => data),
    } as unknown as Response;
}

describe("AttendancePage", () => {
    const track = { stop: vi.fn() };

    beforeEach(() => {
        vi.resetAllMocks();
        mocks.isOnline = true;
        mocks.isFresh = true;
        Object.defineProperty(window.navigator, "mediaDevices", {
            configurable: true,
            value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) },
        });
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
        vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,test-photo");
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("shows the authoritative overnight shift context and sends expected action plus shift date once", async () => {
        const calls: Array<{ method: string; body?: Record<string, unknown> }> = [];
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const method = init?.method ?? "GET";
            calls.push({ method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
            if (method === "POST") return response({ clockIn: "2026-09-28T16:00:00.000Z", clockOut: "2026-09-28T23:30:00.000Z" });
            return response([{ date: "2026-09-28", clockIn: "2026-09-28T16:00:00.000Z", clockOut: null }]);
        });
        vi.stubGlobal("fetch", fetchMock);
        render(<AttendancePage />);

        expect(await screen.findByText("2026-09-28")).toBeInTheDocument();
        expect(screen.getByText("Lintas Hari H+1")).toBeInTheDocument();
        expect(screen.getByText(/23:00-07:00 WIB/)).toBeInTheDocument();

        const shutter = await screen.findByRole("button", { name: "Jepret Foto" });
        expect(shutter).toHaveClass("w-[72px]", "h-[72px]");
        fireEvent.loadedMetadata(document.querySelector("video")!);
        await waitFor(() => expect(shutter).toBeEnabled());
        await userEvent.click(shutter);

        const submit = await screen.findByRole("button", { name: /Kirim Clock Out/i });
        await userEvent.dblClick(submit);

        await waitFor(() => expect(calls.filter((call) => call.method === "POST")).toHaveLength(1));
        expect(calls.find((call) => call.method === "POST")?.body).toEqual(expect.objectContaining({
            action: "CLOCK_OUT",
            shiftDate: "2026-09-28",
        }));
    });

    it("disables submission when the last server context is stale or offline", async () => {
        mocks.isOnline = false;
        mocks.isFresh = false;
        vi.stubGlobal("fetch", vi.fn(async () => response([{ date: "2026-09-28", clockIn: "2026-09-28T16:00:00.000Z" }])));
        render(<AttendancePage />);

        expect(await screen.findByText(/Perangkat offline/i)).toBeInTheDocument();
        const shutter = await screen.findByRole("button", { name: "Jepret Foto" });
        fireEvent.loadedMetadata(document.querySelector("video")!);
        await waitFor(() => expect(shutter).toBeEnabled());
        await userEvent.click(shutter);

        expect(await screen.findByRole("button", { name: /Kirim Clock Out/i })).toBeDisabled();
    });

    it("refreshes the server context and explains a 409 conflict", async () => {
        vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method === "POST") return response({ error: "Konteks shift berubah. Data presensi belum disimpan." }, 409);
            return response([{ date: "2026-09-28", clockIn: "2026-09-28T16:00:00.000Z" }]);
        }));
        render(<AttendancePage />);

        const shutter = await screen.findByRole("button", { name: "Jepret Foto" });
        fireEvent.loadedMetadata(document.querySelector("video")!);
        await waitFor(() => expect(shutter).toBeEnabled());
        await userEvent.click(shutter);
        await userEvent.click(await screen.findByRole("button", { name: /Kirim Clock Out/i }));

        expect(await screen.findByText(/konteks shift berubah/i)).toBeInTheDocument();
        expect(mocks.refresh).toHaveBeenCalledOnce();
    });
});

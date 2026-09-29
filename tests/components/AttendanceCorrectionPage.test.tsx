// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AttendanceCorrectionPage from "@/app/employee/attendance/correction/page";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), refresh: vi.fn(), reportClientError: vi.fn() }));

vi.mock("@/hooks/useAttendanceServerContext", () => ({
    useAttendanceServerContext: () => ({
        context: { serverWibDate: "2026-09-29" },
        isOnline: true,
        isFresh: true,
        refresh: mocks.refresh,
    }),
}));
vi.mock("@/components/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: mocks.reportClientError,
    getResponseErrorMessage: vi.fn(async (_response: Response, fallback: string) => fallback),
}));

function response(data: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn(async () => data),
    } as unknown as Response;
}

describe("AttendanceCorrectionPage", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("uses the server date and sends an explicit WIB H+1 clock-out timestamp once", async () => {
        const postBodies: Record<string, unknown>[] = [];
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/api/attendance/shift-schedule")) {
                return response({
                    date: "2026-09-28",
                    schedule: { shiftName: "Shift 3", startTime: "23:00", endTime: "07:00", isOff: false, isOvernight: true },
                });
            }
            if ((init?.method ?? "GET") === "POST") {
                postBodies.push(JSON.parse(String(init?.body)));
                return response({
                    id: "correction-1",
                    targetDate: "2026-09-28",
                    proposedClockIn: null,
                    proposedClockOut: "2026-09-29T00:00:00.000Z",
                    reason: "Lupa melakukan clock out",
                    attachmentUrl: null,
                    status: "PENDING",
                    createdAt: "2026-09-29T01:00:00.000Z",
                }, 201);
            }
            return response([]);
        }));

        const user = userEvent.setup();
        render(<AttendanceCorrectionPage />);
        await user.click(screen.getByRole("button", { name: /Ajukan Koreksi/i }));

        const targetDate = await screen.findByLabelText("Tanggal yang Dikoreksi");
        await waitFor(() => expect(targetDate).toHaveValue("2026-09-28"));
        await user.type(screen.getByLabelText("Jam Keluar (Diajukan)"), "07:00");
        await user.click(screen.getByRole("checkbox", { name: /H\+1/i }));
        await user.type(screen.getByLabelText("Alasan / Keterangan"), "Lupa melakukan clock out");
        await user.dblClick(screen.getByRole("button", { name: "Kirim Pengajuan Koreksi" }));

        await waitFor(() => expect(postBodies).toHaveLength(1));
        expect(postBodies[0]).toEqual(expect.objectContaining({
            targetDate: "2026-09-28",
            proposedClockOut: "2026-09-29T07:00:00+07:00",
        }));
    });

    it("auto-assigns overnight clock-in to H+1 without a checkbox", async () => {
        const postBodies: Record<string, unknown>[] = [];
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/api/attendance/shift-schedule")) {
                return response({
                    date: "2026-09-28",
                    schedule: { shiftName: "Shift 3", startTime: "23:00", endTime: "07:00", isOff: false, isOvernight: true },
                });
            }
            if ((init?.method ?? "GET") === "POST") {
                postBodies.push(JSON.parse(String(init?.body)));
                return response({
                    id: "correction-2",
                    targetDate: "2026-09-28",
                    proposedClockIn: "2026-09-28T17:30:00.000Z",
                    proposedClockOut: null,
                    reason: "Terlambat absen masuk",
                    attachmentUrl: null,
                    status: "PENDING",
                    createdAt: "2026-09-29T01:00:00.000Z",
                }, 201);
            }
            return response([]);
        }));

        const user = userEvent.setup();
        render(<AttendanceCorrectionPage />);
        await user.click(screen.getByRole("button", { name: /Ajukan Koreksi/i }));

        const targetDate = await screen.findByLabelText("Tanggal yang Dikoreksi");
        await waitFor(() => expect(targetDate).toHaveValue("2026-09-28"));
        await user.type(screen.getByLabelText("Jam Masuk (Diajukan)"), "00:30");
        await user.type(screen.getByLabelText("Alasan / Keterangan"), "Terlambat absen masuk");
        expect(await screen.findByText(/Otomatis H\+1 shift malam/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Kirim Pengajuan Koreksi" }));

        await waitFor(() => expect(postBodies).toHaveLength(1));
        expect(postBodies[0]).toEqual(expect.objectContaining({
            targetDate: "2026-09-28",
            proposedClockIn: "2026-09-29T00:30:00+07:00",
        }));
    });
});

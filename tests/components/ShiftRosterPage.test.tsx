// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShiftRosterPage from "@/app/dashboard/shifts/roster/page";

const clientMocks = vi.hoisted(() => ({
    toast: vi.fn(),
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_response: Response, fallback: string) => fallback),
    confirm: vi.fn((opts: { onConfirm: () => void }) => { opts.onConfirm(); }),
}));

vi.mock("@/components/Toast", () => ({ useToast: () => clientMocks.toast }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: clientMocks.reportClientError,
    getResponseErrorMessage: clientMocks.getResponseErrorMessage,
}));
vi.mock("@/components/ConfirmModal", () => ({
    useConfirm: () => clientMocks.confirm,
}));

const employees = [{
    id: "employee-record-1",
    employeeId: "EMP001",
    name: "Ayu Roster",
    isActive: true,
    shiftId: "shift-day",
}];

const shifts = [
    {
        id: "shift-day",
        name: "Shift Pagi",
        isDefault: true,
        days: [{ dayOfWeek: 1, startTime: "07:00", endTime: "15:00", isOff: false }],
    },
    {
        id: "shift-night",
        name: "Shift Malam",
        isDefault: false,
        days: [{ dayOfWeek: 1, startTime: "23:00", endTime: "07:00", isOff: false }],
    },
];

function response(data: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn(async () => data),
        clone() { return this; },
    } as unknown as Response;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
    return { promise, resolve };
}

function baseFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): ReturnType<typeof vi.fn> {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/employees") return response(employees);
        if (url === "/api/shifts") return response(shifts);
        return handler(url, init);
    });
}

describe("ShiftRosterPage", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("uses explicitly inclusive effective-to wording and chip", async () => {
        vi.stubGlobal("fetch", baseFetch(async () => response({ date: "2026-10-05", today: "2026-09-29", roster: [] })));
        render(<ShiftRosterPage />);

        expect(await screen.findByLabelText("Hari terakhir (ikut termasuk, opsional)")).toBeInTheDocument();
        
        // Ensure inclusive days chip is not present initially
        expect(screen.queryByText(/hari\)/)).not.toBeInTheDocument();
    });

    it("ignores a stale roster response that finishes after the latest date", async () => {
        const first = deferred<Response>();
        const second = deferred<Response>();
        vi.stubGlobal("fetch", baseFetch(async (url) => {
            if (url.endsWith("date=2026-10-05")) return first.promise;
            if (url.endsWith("date=2026-10-12")) return second.promise;
            throw new Error(`Unexpected fetch ${url}`);
        }));
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        const viewDateInput = screen.getByLabelText("Tanggal Lihat Roster");
        fireEvent.change(viewDateInput, { target: { value: "2026-10-05" } });
        fireEvent.change(viewDateInput, { target: { value: "2026-10-12" } });
        
        second.resolve(response({
            date: "2026-10-12",
            today: "2026-09-29",
            roster: [{ employeeId: "EMP001", shiftId: "shift-night", source: "assignment", assignment: null }],
        }));
        
        expect(await screen.findByRole("button", { name: /Ayu Roster.*Shift Malam/i })).toBeInTheDocument();

        first.resolve(response({
            date: "2026-10-05",
            today: "2026-09-29",
            roster: [{ employeeId: "EMP001", shiftId: "shift-day", source: "assignment", assignment: null }],
        }));
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Ayu Roster.*Shift Malam/i })).toBeInTheDocument();
        });
    });

    it("does not reload a submitted date after the selected date changes in flight", async () => {
        const post = deferred<Response>();
        const calls: Array<{ url: string; method: string }> = [];
        vi.stubGlobal("fetch", baseFetch(async (url, init) => {
            const method = init?.method ?? "GET";
            calls.push({ url, method });
            if (method === "POST") return post.promise;
            if (url.endsWith("date=2026-10-05")) {
                return response({
                    date: "2026-10-05",
                    today: "2026-09-29",
                    roster: [{ employeeId: "EMP001", shiftId: "shift-day", source: "assignment", assignment: null }],
                });
            }
            if (url.endsWith("date=2026-10-12")) {
                return response({
                    date: "2026-10-12",
                    today: "2026-09-29",
                    roster: [{ employeeId: "EMP001", shiftId: "shift-night", source: "assignment", assignment: null }],
                });
            }
            throw new Error(`Unexpected fetch ${url}`);
        }));
        
        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        const viewDateInput = screen.getByLabelText("Tanggal Lihat Roster");
        const startDateInput = screen.getByLabelText("Berlaku Mulai Tanggal");
        const endDateInput = screen.getByLabelText("Hari terakhir (ikut termasuk, opsional)");
        const shiftSelect = screen.getByLabelText("Shift Tujuan");
        const searchInput = screen.getByPlaceholderText("Cari NIP atau nama...");
        
        fireEvent.change(viewDateInput, { target: { value: "2026-10-05" } });
        fireEvent.change(startDateInput, { target: { value: "2026-10-05" } });
        
        await waitFor(() => {
            expect(calls.filter((call) => call.url.endsWith("date=2026-10-05"))).toHaveLength(1);
        });
        
        await user.selectOptions(shiftSelect, "shift-night");
        await user.click(screen.getByRole("button", { name: /Ayu Roster.*Shift Pagi/i }));
        await user.click(screen.getByRole("button", { name: /Tetapkan Shift Malam untuk 1 orang/i }));

        expect(viewDateInput).toBeDisabled();
        expect(startDateInput).toBeDisabled();
        expect(endDateInput).toBeDisabled();
        expect(shiftSelect).toBeDisabled();
        expect(searchInput).toBeDisabled();
        expect(screen.getByRole("button", { name: /Ayu Roster.*Shift Pagi/i })).toBeDisabled();

        // Model a concurrent state change that bypasses the disabled browser control.
        viewDateInput.removeAttribute("disabled");
        fireEvent.change(viewDateInput, { target: { value: "2026-10-12" } });
        expect(viewDateInput).toHaveValue("2026-10-12");
        expect(await screen.findByRole("button", { name: /Ayu Roster.*Shift Malam/i })).toBeInTheDocument();

        post.resolve(response({ applied: 1 }));
        await waitFor(() => {
            expect(clientMocks.toast).toHaveBeenCalledWith("Roster tersimpan: 1 karyawan ke Shift Malam.", "success");
        });

        expect(viewDateInput).toHaveValue("2026-10-12");
        expect(screen.getByRole("button", { name: /Ayu Roster.*Shift Malam/i })).toBeInTheDocument();
        expect(calls.filter((call) => call.url.endsWith("date=2026-10-05"))).toHaveLength(1);
        expect(calls.filter((call) => call.url.endsWith("date=2026-10-12"))).toHaveLength(2); // Reloads the new viewDate because the submitted infinite assignment overlaps it
    });

    it("aborts an in-flight roster request when the page unmounts", async () => {
        const pending = deferred<Response>();
        let signal: AbortSignal | null | undefined;
        vi.stubGlobal("fetch", baseFetch(async (_url, init) => {
            signal = init?.signal ?? null;
            return pending.promise;
        }));
        const view = render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        fireEvent.change(screen.getByLabelText("Tanggal Lihat Roster"), { target: { value: "2026-10-05" } });
        await waitFor(() => expect(signal).not.toBeNull());
        view.unmount();

        expect(signal?.aborted).toBe(true);
        pending.resolve(response({ date: "2026-10-05", today: "2026-09-29", roster: [] }));
    });

    it("confirms and cancels the exact future assignment, then reloads the selected date", async () => {
        const calls: Array<{ url: string; method: string; body: unknown }> = [];
        const fetchMock = baseFetch(async (url, init) => {
            const method = init?.method ?? "GET";
            calls.push({
                url,
                method,
                body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
            });
            if (method === "DELETE") return response({ success: true });
            return response({
                date: "2026-10-06",
                today: "2026-09-29",
                roster: [{
                    employeeId: "EMP001",
                    shiftId: "shift-night",
                    source: "assignment",
                    assignment: {
                        id: "asg-future",
                        effectiveFrom: "2026-10-05",
                        effectiveTo: "2026-10-12",
                    },
                }],
            });
        });
        vi.stubGlobal("fetch", fetchMock);
        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        fireEvent.change(screen.getByLabelText("Tanggal Lihat Roster"), { target: { value: "2026-10-06" } });
        
        // Have to select the employee first to see the future assignments
        await user.click(await screen.findByRole("button", { name: /Ayu Roster.*Shift Malam/i }));
        
        await user.click(await screen.findByRole("button", { name: /Batalkan jadwal masa depan Ayu Roster/i }));

        await waitFor(() => {
            expect(calls.filter((call) => call.url === "/api/shifts/assignments" && call.method === "DELETE")).toEqual([{
                url: "/api/shifts/assignments",
                method: "DELETE",
                body: { employeeId: "EMP001", effectiveFrom: "2026-10-05" },
            }]);
        });
        expect(clientMocks.confirm).toHaveBeenCalled();
        await waitFor(() => {
            expect(calls.filter((call) => call.url.endsWith("date=2026-10-06"))).toHaveLength(2);
        });
        expect(clientMocks.toast).toHaveBeenCalledWith("Jadwal masa depan Ayu Roster dibatalkan.", "success");
    });

    it("keeps a cancellation failure visible and does not report success", async () => {
        vi.stubGlobal("fetch", baseFetch(async (_url, init) => {
            if (init?.method === "DELETE") return response({ error: "conflict" }, 409);
            return response({
                date: "2026-10-06",
                today: "2026-09-29",
                roster: [{
                    employeeId: "EMP001",
                    shiftId: "shift-night",
                    source: "assignment",
                    assignment: { id: "asg-future", effectiveFrom: "2026-10-05", effectiveTo: null },
                }],
            });
        }));
        
        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        fireEvent.change(screen.getByLabelText("Tanggal Lihat Roster"), { target: { value: "2026-10-06" } });
        
        // Have to select the employee first to see the future assignments
        await user.click(await screen.findByRole("button", { name: /Ayu Roster.*Shift Malam/i }));
        
        await user.click(await screen.findByRole("button", { name: /Batalkan jadwal masa depan Ayu Roster/i }));

        expect(await screen.findByText("Gagal membatalkan jadwal masa depan.")).toBeInTheDocument();
        expect(clientMocks.reportClientError).toHaveBeenCalled();
        expect(clientMocks.toast).toHaveBeenCalledWith("Gagal membatalkan jadwal masa depan.", "error");
    });
});

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function addDays(dateStr: string, days: number): string {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function buildTimeline(
    from: string,
    overrides?: {
        today?: string;
        cells?: Array<{ date: string; shiftId: string; source: "assignment" | "fallback"; assignmentId: string | null }>;
        assignments?: Array<{ id: string; employeeId: string; shiftId: string; effectiveFrom: string; effectiveTo: string | null }>;
    },
) {
    const cellByDate = new Map((overrides?.cells ?? []).map((cell) => [cell.date, cell]));
    const cells = Array.from({ length: 7 }, (_, idx) => {
        const date = addDays(from, idx);
        return cellByDate.get(date) ?? { date, shiftId: "shift-day", source: "fallback" as const, assignmentId: null };
    });
    return {
        from,
        to: addDays(from, 6),
        today: overrides?.today ?? "2026-09-29",
        days: 7,
        defaultShiftId: "shift-day",
        employees: [{ employeeId: "EMP001", baseShiftId: "shift-day", cells }],
        assignments: overrides?.assignments ?? [],
    };
}

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
        if (url.startsWith("/api/shifts/assignments/timeline")) {
            const fromParam = new URL(url, "http://localhost").searchParams.get("from") ?? "2026-09-29";
            return response(buildTimeline(fromParam));
        }
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

    it("opens the assign modal with explicitly inclusive effective-to wording", async () => {
        vi.stubGlobal("fetch", baseFetch(async (url, init) => {
            if (url === "/api/shifts/assignments" && init?.method === "POST") {
                return response({ applied: 0, dryRun: true, plan: [], conflicts: [] });
            }
            throw new Error(`Unexpected fetch ${url}`);
        }));
        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        await user.click(screen.getByRole("button", { name: /Ayu Roster.*Shift Pagi/i }));
        await user.click(await screen.findByRole("button", { name: "Tetapkan Roster" }));

        const dialog = await screen.findByRole("dialog", { name: "Tetapkan Roster Shift" });
        expect(within(dialog).getByLabelText("Hari terakhir (ikut termasuk, opsional)")).toBeInTheDocument();

        // Ensure inclusive days chip is not present before an end date is chosen
        expect(within(dialog).queryByText(/hari, inklusif/)).not.toBeInTheDocument();
    });

    it("loads today's active timeline on initial mount and displays the active shift", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/employees") return response(employees);
            if (url === "/api/shifts") return response(shifts);
            if (url === "/api/shifts/assignments/timeline?days=7") {
                return response(buildTimeline("2026-10-19", {
                    today: "2026-10-19",
                    cells: [{ date: "2026-10-19", shiftId: "shift-night", source: "assignment", assignmentId: "asg-active" }],
                    assignments: [{
                        id: "asg-active",
                        employeeId: "EMP001",
                        shiftId: "shift-night",
                        effectiveFrom: "2026-10-19",
                        effectiveTo: "2026-10-25",
                    }],
                }));
            }
            throw new Error(`Unexpected fetch ${url}`);
        }));

        render(<ShiftRosterPage />);

        expect(await screen.findByRole("button", { name: /Ayu Roster.*Shift Malam/i })).toBeInTheDocument();
        expect(screen.getByLabelText("Tanggal Lihat Roster")).toHaveValue("2026-10-19");
        expect(screen.getByText("Jadwal Berjalan")).toBeInTheDocument();
    });

    it("filters by shift legend chip and resets back", async () => {
        vi.stubGlobal("fetch", baseFetch(async () => response({})));
        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        await user.click(screen.getByRole("button", { name: /Shift Malam/ }));
        expect(await screen.findByText("Tidak ada karyawan yang cocok dengan filter.")).toBeInTheDocument();
        expect(screen.queryByText("Ayu Roster")).not.toBeInTheDocument();

        const resets = screen.getAllByRole("button", { name: "Reset filter" });
        await user.click(resets[0]);
        expect(await screen.findByText("Ayu Roster")).toBeInTheDocument();
    });

    it("ignores a stale timeline response that finishes after the latest date", async () => {
        const first = deferred<Response>();
        const second = deferred<Response>();
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/employees") return response(employees);
            if (url === "/api/shifts") return response(shifts);
            if (url.includes("from=2026-10-05")) return first.promise;
            if (url.includes("from=2026-10-12")) return second.promise;
            if (url.startsWith("/api/shifts/assignments/timeline")) return response(buildTimeline("2026-09-29"));
            throw new Error(`Unexpected fetch ${url}`);
        }));
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        const viewDateInput = screen.getByLabelText("Tanggal Lihat Roster");
        fireEvent.change(viewDateInput, { target: { value: "2026-10-05" } });
        fireEvent.change(viewDateInput, { target: { value: "2026-10-12" } });

        second.resolve(response(buildTimeline("2026-10-12", {
            cells: [{ date: "2026-10-12", shiftId: "shift-night", source: "assignment", assignmentId: "asg-night" }],
            assignments: [{
                id: "asg-night",
                employeeId: "EMP001",
                shiftId: "shift-night",
                effectiveFrom: "2026-10-12",
                effectiveTo: null,
            }],
        })));

        expect(await screen.findByRole("button", { name: /Ayu Roster.*Shift Malam/i })).toBeInTheDocument();

        first.resolve(response(buildTimeline("2026-10-05")));
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Ayu Roster.*Shift Malam/i })).toBeInTheDocument();
        });
    });

    it("submits an assignment from the modal, then closes it and clears the selection", async () => {
        const calls: Array<{ url: string; method: string; body: unknown }> = [];
        vi.stubGlobal("fetch", baseFetch(async (url, init) => {
            const method = init?.method ?? "GET";
            const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
            calls.push({ url, method, body });
            if (method === "POST") {
                if ((body as { dryRun?: boolean } | null)?.dryRun) {
                    return response({ applied: 0, dryRun: true, plan: [], conflicts: [] });
                }
                return response({
                    success: true,
                    applied: 1,
                    dryRun: false,
                    results: [{ employeeId: "EMP001", shiftId: "shift-night", effectiveFrom: "2026-10-05", effectiveTo: null }],
                    plan: [],
                    conflicts: [],
                }, 201);
            }
            throw new Error(`Unexpected fetch ${url}`);
        }));

        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        fireEvent.change(screen.getByLabelText("Tanggal Lihat Roster"), { target: { value: "2026-10-05" } });
        await user.click(await screen.findByRole("button", { name: /Ayu Roster.*Shift Pagi/i }));
        await user.click(await screen.findByRole("button", { name: "Tetapkan Roster" }));

        const dialog = await screen.findByRole("dialog", { name: "Tetapkan Roster Shift" });
        await user.selectOptions(within(dialog).getByLabelText("Shift Tujuan"), "shift-night");
        await user.click(within(dialog).getByRole("button", { name: /Tetapkan Shift Malam untuk 1 orang/i }));

        await waitFor(() => {
            expect(clientMocks.toast).toHaveBeenCalledWith("Roster tersimpan: 1 karyawan ke Shift Malam.", "success");
        });

        const applyCalls = calls.filter((call) => call.url === "/api/shifts/assignments" && call.method === "POST"
            && !(call.body as { dryRun?: boolean })?.dryRun);
        expect(applyCalls).toHaveLength(1);
        expect(applyCalls[0].body).toEqual({
            assignments: [{
                employeeId: "EMP001",
                shiftId: "shift-night",
                effectiveFrom: "2026-10-05",
                effectiveTo: null,
            }],
            replaceFuture: false,
        });
        expect(clientMocks.confirm).toHaveBeenCalled();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Tetapkan Roster" })).not.toBeInTheDocument();
    });

    it("aborts an in-flight timeline request when the page unmounts", async () => {
        const pending = deferred<Response>();
        let signal: AbortSignal | null | undefined;
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === "/api/employees") return response(employees);
            if (url === "/api/shifts") return response(shifts);
            if (url.includes("from=2026-10-05")) {
                signal = init?.signal ?? null;
                return pending.promise;
            }
            if (url.startsWith("/api/shifts/assignments/timeline")) return response(buildTimeline("2026-09-29"));
            throw new Error(`Unexpected fetch ${url}`);
        }));
        const view = render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        fireEvent.change(screen.getByLabelText("Tanggal Lihat Roster"), { target: { value: "2026-10-05" } });
        await waitFor(() => expect(signal).not.toBeNull());
        view.unmount();

        expect(signal?.aborted).toBe(true);
        pending.resolve(response(buildTimeline("2026-10-05")));
    });

    it("confirms and cancels the exact future assignment from the manage modal, then reloads", async () => {
        const calls: Array<{ url: string; method: string; body: unknown }> = [];
        const timelineWithFuture = buildTimeline("2026-10-06", {
            cells: [{ date: "2026-10-06", shiftId: "shift-night", source: "assignment", assignmentId: "asg-future" }],
            assignments: [{
                id: "asg-future",
                employeeId: "EMP001",
                shiftId: "shift-night",
                effectiveFrom: "2026-10-05",
                effectiveTo: "2026-10-12",
            }],
        });
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === "/api/employees") return response(employees);
            if (url === "/api/shifts") return response(shifts);
            if (url.startsWith("/api/shifts/assignments/timeline")) {
                calls.push({ url, method: "GET", body: null });
                return response(timelineWithFuture);
            }
            if (url === "/api/shifts/assignments" && init?.method === "DELETE") {
                calls.push({
                    url,
                    method: "DELETE",
                    body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
                });
                return response({ success: true });
            }
            if (url === "/api/shifts/assignments" && init?.method === "POST") {
                return response({ applied: 0, dryRun: true, plan: [], conflicts: [] });
            }
            throw new Error(`Unexpected fetch ${url}`);
        }));
        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        // Wait for the timeline (night assignment) before opening the modal.
        await screen.findByRole("button", { name: /Ayu Roster.*Shift Malam/i });

        await user.click(await screen.findByRole("button", { name: /Kelola jadwal Ayu Roster/i }));
        const dialog = await screen.findByRole("dialog", { name: "Kelola Jadwal Roster Ayu Roster" });

        await user.click(within(dialog).getByRole("button", { name: /Batalkan jadwal masa depan Ayu Roster/i }));

        await waitFor(() => {
            expect(calls.filter((call) => call.url === "/api/shifts/assignments" && call.method === "DELETE")).toEqual([{
                url: "/api/shifts/assignments",
                method: "DELETE",
                body: { employeeId: "EMP001", effectiveFrom: "2026-10-05" },
            }]);
        });
        expect(clientMocks.confirm).toHaveBeenCalled();
        expect(clientMocks.toast).toHaveBeenCalledWith("Jadwal masa depan Ayu Roster dibatalkan.", "success");
        await waitFor(() => {
            expect(calls.filter((call) => call.url.startsWith("/api/shifts/assignments/timeline"))).toHaveLength(2);
        });
    });

    it("keeps a cancellation failure visible and does not report success", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === "/api/employees") return response(employees);
            if (url === "/api/shifts") return response(shifts);
            if (url.startsWith("/api/shifts/assignments/timeline")) {
                return response(buildTimeline("2026-10-06", {
                    cells: [{ date: "2026-10-06", shiftId: "shift-night", source: "assignment", assignmentId: "asg-future" }],
                    assignments: [{
                        id: "asg-future",
                        employeeId: "EMP001",
                        shiftId: "shift-night",
                        effectiveFrom: "2026-10-05",
                        effectiveTo: null,
                    }],
                }));
            }
            if (url === "/api/shifts/assignments" && init?.method === "DELETE") {
                return response({ error: "conflict" }, 409);
            }
            if (url === "/api/shifts/assignments" && init?.method === "POST") {
                return response({ applied: 0, dryRun: true, plan: [], conflicts: [] });
            }
            throw new Error(`Unexpected fetch ${url}`);
        }));

        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");
        await screen.findByRole("button", { name: /Ayu Roster.*Shift Malam/i });

        await user.click(await screen.findByRole("button", { name: /Kelola jadwal Ayu Roster/i }));
        const dialog = await screen.findByRole("dialog", { name: "Kelola Jadwal Roster Ayu Roster" });

        await user.click(within(dialog).getByRole("button", { name: /Batalkan jadwal masa depan Ayu Roster/i }));

        expect(await within(dialog).findByText("Gagal membatalkan jadwal masa depan.")).toBeInTheDocument();
        expect(clientMocks.reportClientError).toHaveBeenCalled();
        expect(clientMocks.toast).toHaveBeenCalledWith("Gagal membatalkan jadwal masa depan.", "error");
    });

    it("updates the inclusive end date of an assignment from the manage modal", async () => {
        const calls: Array<{ url: string; method: string; body: unknown }> = [];
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === "/api/employees") return response(employees);
            if (url === "/api/shifts") return response(shifts);
            if (url.startsWith("/api/shifts/assignments/timeline")) {
                return response(buildTimeline("2026-10-06", {
                    cells: [{ date: "2026-10-06", shiftId: "shift-night", source: "assignment", assignmentId: "asg-future" }],
                    assignments: [{
                        id: "asg-future",
                        employeeId: "EMP001",
                        shiftId: "shift-night",
                        effectiveFrom: "2026-10-05",
                        effectiveTo: "2026-10-12",
                    }],
                }));
            }
            if (url === "/api/shifts/assignments" && init?.method === "PATCH") {
                calls.push({
                    url,
                    method: "PATCH",
                    body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
                });
                return response({ success: true });
            }
            if (url === "/api/shifts/assignments" && init?.method === "POST") {
                return response({ applied: 0, dryRun: true, plan: [], conflicts: [] });
            }
            throw new Error(`Unexpected fetch ${url}`);
        }));

        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");
        await screen.findByRole("button", { name: /Ayu Roster.*Shift Malam/i });

        await user.click(await screen.findByRole("button", { name: /Kelola jadwal Ayu Roster/i }));
        const dialog = await screen.findByRole("dialog", { name: "Kelola Jadwal Roster Ayu Roster" });

        await user.click(within(dialog).getByRole("button", { name: /Ubah Akhir/i }));
        const endInput = within(dialog).getByLabelText("Hari terakhir baru (inklusif)");
        expect(endInput).toHaveValue("2026-10-11");
        fireEvent.change(endInput, { target: { value: "2026-10-09" } });
        await user.click(within(dialog).getByRole("button", { name: /Simpan Tanggal Akhir/i }));

        await waitFor(() => {
            expect(calls).toEqual([{
                url: "/api/shifts/assignments",
                method: "PATCH",
                body: { employeeId: "EMP001", effectiveFrom: "2026-10-05", effectiveTo: "2026-10-10" },
            }]);
        });
        expect(clientMocks.toast).toHaveBeenCalledWith(
            expect.stringContaining("Tanggal akhir jadwal Ayu Roster diperbarui"),
            "success",
        );
    });

    it("shows the server dry-run conflicts in the assign modal and offers to enable replaceFuture", async () => {
        const dryRunCalls: Array<unknown> = [];
        vi.stubGlobal("fetch", baseFetch(async (url, init) => {
            if (url === "/api/shifts/assignments" && init?.method === "POST") {
                const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
                dryRunCalls.push(body);
                if (body?.dryRun) {
                    return response({
                        applied: 0,
                        dryRun: true,
                        plan: [{
                            employeeId: "EMP001",
                            shiftId: "shift-night",
                            effectiveFrom: "2026-10-05",
                            effectiveTo: null,
                            actions: [],
                            conflicts: [{
                                employeeId: "EMP001",
                                assignmentId: "asg-future",
                                shiftId: "shift-day",
                                effectiveFrom: "2026-10-06",
                                effectiveTo: null,
                                reason: "FUTURE",
                            }],
                            after: null,
                        }],
                        conflicts: [{
                            employeeId: "EMP001",
                            assignmentId: "asg-future",
                            shiftId: "shift-day",
                            effectiveFrom: "2026-10-06",
                            effectiveTo: null,
                            reason: "FUTURE",
                        }],
                    });
                }
                return response({ success: true, applied: 1 }, 201);
            }
            throw new Error(`Unexpected fetch ${url}`);
        }));

        const user = userEvent.setup();
        render(<ShiftRosterPage />);
        await screen.findByText("Ayu Roster");

        await user.click(screen.getByRole("button", { name: /Ayu Roster.*Shift Pagi/i }));
        await user.click(await screen.findByRole("button", { name: "Tetapkan Roster" }));
        const dialog = await screen.findByRole("dialog", { name: "Tetapkan Roster Shift" });

        fireEvent.change(within(dialog).getByLabelText("Berlaku Mulai Tanggal"), { target: { value: "2026-10-05" } });
        await user.selectOptions(within(dialog).getByLabelText("Shift Tujuan"), "shift-night");

        expect(await within(dialog).findByText("1 bentrok", {}, { timeout: 5000 })).toBeInTheDocument();
        expect(within(dialog).getByText(/jadwal masa depan\/hari ini/)).toBeInTheDocument();

        await user.click(within(dialog).getByRole("button", { name: /Aktifkan Timpa Jadwal Masa Depan/i }));
        await waitFor(() => {
            expect(dryRunCalls.some((body) => (body as { replaceFuture?: boolean })?.replaceFuture === true)).toBe(true);
        }, { timeout: 5000 });
    });
});

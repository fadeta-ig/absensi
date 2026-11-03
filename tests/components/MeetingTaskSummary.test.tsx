// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import MeetingTaskSummary from "@/components/appointments/MeetingTaskSummary";

const tasks = [
    {
        id: "task-mine",
        title: "Task Untuk Saya",
        isCancelled: false,
        assigner: { employeeId: "ID-9", name: "Pemberi" },
        activeDeadline: { date: "2026-11-10", sequence: 1 },
        assignees: [{ employeeId: "ID-25020044", name: "Saya", status: "OPEN", isOverdue: false }],
        allDone: false,
        anyOverdue: false,
    },
    {
        id: "task-other",
        title: "Task Orang Lain",
        isCancelled: false,
        assigner: { employeeId: "ID-9", name: "Pemberi" },
        activeDeadline: { date: "2026-11-10", sequence: 1 },
        assignees: [{ employeeId: "ID-25040046", name: "Orang Lain", status: "OPEN", isOverdue: false }],
        allDone: false,
        anyOverdue: false,
    },
];

describe("MeetingTaskSummary", () => {
    afterEach(() => cleanup());

    it("tombol Kelola di Tugas Saya hanya muncul pada task milik penerima yang login", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({ success: true, data: tasks }),
        })));
        render(<MeetingTaskSummary appointmentId="appt-1" participants={[]} myEmployeeId="ID-25020044" />);
        await waitFor(() => expect(screen.getByText("Task Untuk Saya")).toBeInTheDocument());
        expect(screen.getByText("Task Orang Lain")).toBeInTheDocument();
        const links = screen.getAllByRole("link", { name: /Kelola tugas/i });
        expect(links).toHaveLength(1);
        expect(links[0].getAttribute("href")).toBe("/employee/my-tasks/task-mine");
    });

    it("tanpa identitas login tidak ada tombol kelola", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({ success: true, data: tasks }),
        })));
        render(<MeetingTaskSummary appointmentId="appt-1" participants={[]} myEmployeeId={null} />);
        await waitFor(() => expect(screen.getByText("Task Untuk Saya")).toBeInTheDocument());
        expect(screen.queryByRole("link", { name: /Kelola tugas/i })).toBeNull();
    });
});

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppointmentDayDetailPage from "@/app/employee/appointments/[date]/page";

vi.mock("next/navigation", () => ({
    useParams: () => ({ date: "2026-10-20" }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: vi.fn(),
    getResponseErrorMessage: vi.fn(async (_r: Response, f: string) => f),
}));
vi.mock("@/components/ConfirmModal", () => ({
    useConfirm: () => vi.fn(),
}));

const ITEMS = [
    {
        id: "a1",
        title: "Rapat Koordinasi",
        status: "APPROVED",
        startAt: "2026-10-20T10:00:00+07:00",
        endAt: "2026-10-20T11:00:00+07:00",
        isFullDay: false,
        meetingLink: null,
        requesterEmployeeId: "ID-001",
        room: { id: "r1", name: "Ruang A" },
        participants: [
            { id: "p1", employeeId: "ID-001", guestName: null, isExternal: false, attendance: "BELUM", inviteStatus: "ACCEPTED", employee: { name: "Daffa" } },
            { id: "p2", employeeId: null, guestName: "Tamu Budi", isExternal: true, attendance: "BELUM", inviteStatus: "PENDING", employee: null },
        ],
    },
];

function mockFetchDay() {
    window.fetch = vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("/api/appointments?from=")) {
            return { ok: true, json: async () => ({ data: ITEMS }) } as Response;
        }
        if (u.includes("/api/auth/me")) {
            return { ok: true, json: async () => ({ employeeId: "ID-001" }) } as Response;
        }
        return { ok: false, json: async () => ({}) } as Response;
    }) as typeof fetch;
}

afterEach(() => cleanup());

describe("AppointmentDayDetailPage", () => {
    it("menampilkan daftar rapat hari itu + info ruangan dan peserta", async () => {
        mockFetchDay();
        render(<AppointmentDayDetailPage />);
        await waitFor(() => expect(screen.getByText("Rapat Koordinasi")).toBeInTheDocument());
        expect(screen.getByText("Ruang A")).toBeInTheDocument();
        expect(screen.getByText(/2 peserta/)).toBeInTheDocument();
        expect(screen.getByText(/1 menerima/)).toBeInTheDocument();
    });

    it("empty state + CTA buat", async () => {
        window.fetch = vi.fn(async (url: string | URL | Request) => {
            const u = String(url);
            if (u.includes("/api/appointments?from=")) return { ok: true, json: async () => ({ data: [] }) } as Response;
            return { ok: true, json: async () => ({ employeeId: "ID-001" }) } as Response;
        }) as typeof fetch;
        render(<AppointmentDayDetailPage />);
        await waitFor(() => expect(screen.getByText(/Belum ada janji rapat/)).toBeInTheDocument());
        expect(screen.getByText(/Buat Janji Rapat pada Tanggal Ini/)).toBeInTheDocument();
    });
});

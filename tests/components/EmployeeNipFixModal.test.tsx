// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmployeeNipFixModal from "@/components/EmployeeNipFixModal";

const mocks = vi.hoisted(() => ({
    toast: vi.fn(),
    reportClientError: vi.fn(),
}));

vi.mock("@/components/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("@/lib/clientErrors", () => ({
    reportClientError: mocks.reportClientError,
    getResponseErrorMessage: vi.fn(async () => "Gagal."),
}));

const IMPACT = {
    employee: { id: "uuid-1", employeeId: "ID-001", name: "Uji Coba" },
    newEmployeeId: "ID-002",
    counts: {
        attendance: 5,
        corrections: 1,
        pendingCorrections: 0,
        pendingLeave: 0,
        pendingOvertime: 0,
        documents: 2,
        shiftAssignments: 1,
        subordinates: 0,
        assetsHeld: 0,
    },
    usernameClash: false,
    blockedReasons: [],
};

const PROPS = {
    employee: { id: "uuid-1", employeeId: "ID-001", name: "Uji Coba" },
    onClose: vi.fn(),
    onSuccess: vi.fn(),
};

describe("EmployeeNipFixModal", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("mengunci tombol sampai NIP diketik ulang + preview + centang sadar", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, json: async () => IMPACT }) as Response),
        );
        render(<EmployeeNipFixModal {...PROPS} />);
        const execute = screen.getByRole("button", { name: /Eksekusi Perbaikan/i });

        expect(execute).toBeDisabled();

        await userEvent.type(screen.getByPlaceholderText(/Contoh: ID-26090107/i), "ID-002");
        await waitFor(() => expect(screen.getByText(/Data yang ikut pindah/i)).toBeInTheDocument());
        expect(execute).toBeDisabled();

        await userEvent.type(screen.getByPlaceholderText(/Ketik ulang persis sama/i), "ID-002");
        expect(execute).toBeDisabled();

        await userEvent.click(screen.getByRole("checkbox"));
        await waitFor(() => expect(execute).toBeEnabled());
    });

    it("menampilkan alasan blokir dan tetap mengunci", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => ({ ...IMPACT, blockedReasons: ["1 koreksi presensi masih PENDING."] }),
            }) as Response),
        );
        render(<EmployeeNipFixModal {...PROPS} />);
        await userEvent.type(screen.getByPlaceholderText(/Contoh: ID-26090107/i), "ID-002");
        expect(await screen.findByText(/masih PENDING/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Eksekusi Perbaikan/i })).toBeDisabled();
    });
});

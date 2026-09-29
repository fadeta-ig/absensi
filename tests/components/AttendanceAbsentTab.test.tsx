// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceAbsentTab } from "@/app/dashboard/attendance/components/AttendanceAbsentTab";

vi.mock("@/components/Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/lib/export", () => ({ exportToExcel: vi.fn(), exportToPdfTable: vi.fn() }));

const absentEmployees = [
    {
        employeeId: "ID-001",
        name: "Budi",
        department: "IT",
        division: "Tech",
        position: "Staff",
        phone: "0812345678",
        email: null,
        statusType: "unpresent" as const,
        statusLabel: "Belum Hadir",
        notes: "Shift: 08:00 - 17:00",
    },
    {
        employeeId: "ID-002",
        name: "Siti",
        department: "HR",
        division: "Ops",
        position: "Staff",
        phone: null,
        email: null,
        statusType: "on_leave" as const,
        statusLabel: "Cuti Tahunan",
        notes: "Liburan keluarga",
    },
    {
        employeeId: "ID-003",
        name: "Andi",
        department: "IT",
        division: "Tech",
        position: "Staff",
        phone: "0812345679",
        email: null,
        statusType: "pending_leave" as const,
        statusLabel: "Menunggu Persetujuan",
        notes: "Pengajuan Izin Sakit menunggu persetujuan HR: Demam",
    },
];

describe("AttendanceAbsentTab", () => {
    beforeEach(() => vi.resetAllMocks());
    afterEach(() => cleanup());

    it("keeps leave reasons readable without hover and counts one evaluation date", () => {
        render(
            <AttendanceAbsentTab
                targetDate="2026-09-28"
                onTargetDateChange={vi.fn()}
                maxDate="2026-09-28"
                absentEmployees={absentEmployees}
                departments={[]}
                divisions={[]}
            />
        );

        expect(screen.getByText("Liburan keluarga")).toBeInTheDocument();
        expect(screen.getByText("Belum Hadir")).toBeInTheDocument();
        expect(screen.getByText("Cuti Tahunan")).toBeInTheDocument();
        expect(screen.getAllByText("Menunggu Persetujuan")).toHaveLength(2); // kartu statistik + badge baris
        expect(screen.getByText(/Pengajuan Izin Sakit menunggu persetujuan HR/)).toBeInTheDocument();
        // WhatsApp nag hanya untuk yang benar-benar tanpa kabar (1 baris: Budi)
        expect(screen.getAllByTitle("Kirim pengingat WhatsApp")).toHaveLength(1);
        expect(screen.getByTitle("Ganti tanggal evaluasi")).toHaveAttribute("max", "2026-09-28");
        expect(screen.getByTitle("Kirim pengingat WhatsApp")).toBeInTheDocument();
    });
});

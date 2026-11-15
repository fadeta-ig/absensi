// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Inbox, CheckCircle2 } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import StateCard from "@/components/ui/StateCard";
import StatusBadge from "@/components/ui/StatusBadge";

afterEach(() => cleanup());

describe("employee UI primitives", () => {
    it("PageHeader merender judul, subjudul, ikon, dan action", () => {
        render(
            <PageHeader
                title="Manajemen Cuti"
                subtitle="Ajukan dan pantau pengajuan cuti"
                icon={CheckCircle2}
                action={<button type="button">Ajukan Cuti</button>}
            />
        );

        expect(screen.getByRole("heading", { level: 1, name: "Manajemen Cuti" })).toBeInTheDocument();
        expect(screen.getByText("Ajukan dan pantau pengajuan cuti")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ajukan Cuti" })).toBeInTheDocument();
    });

    it("StatusBadge memakai tone dan ikon opsional", () => {
        const { container } = render(
            <StatusBadge tone="success" icon={CheckCircle2}>
                Disetujui
            </StatusBadge>
        );

        const badge = container.firstElementChild as HTMLElement;
        expect(badge).toHaveTextContent("Disetujui");
        expect(badge.className).toContain("var(--success-bg)");
        expect(badge.querySelector("svg")).not.toBeNull();
    });

    it("StatusBadge progress menampilkan titik berdenyut tanpa ikon", () => {
        const { container } = render(<StatusBadge tone="progress">Menunggu Verifikasi</StatusBadge>);
        const badge = container.firstElementChild as HTMLElement;
        expect(badge.className).toContain("var(--info-bg)");
        expect(badge.querySelector("svg")).toBeNull();
        expect(badge.querySelector(".animate-pulse")).not.toBeNull();
    });

    it("EmptyState menampilkan keadaan dan langkah berikutnya", () => {
        render(
            <EmptyState
                icon={Inbox}
                title="Belum ada pengajuan"
                description="Pengajuan yang Anda kirim akan muncul di sini."
                action={<button type="button">Ajukan</button>}
            />
        );

        expect(screen.getByRole("status")).toHaveTextContent("Belum ada pengajuan");
        expect(screen.getByText("Pengajuan yang Anda kirim akan muncul di sini.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ajukan" })).toBeInTheDocument();
    });

    it("StateCard membedakan loading dan error", () => {
        const { rerender } = render(<StateCard variant="loading" title="Memuat jadwal kerja..." />);
        expect(screen.getByRole("status")).toHaveTextContent("Memuat jadwal kerja...");

        rerender(<StateCard variant="error" title="Gagal memuat jadwal shift." />);
        expect(screen.getByRole("alert")).toHaveTextContent("Gagal memuat jadwal shift.");
    });

    it("ListSkeleton merender jumlah kartu sesuai permintaan", () => {
        const { container } = render(<ListSkeleton count={2} label="Memuat riwayat cuti" />);
        expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Memuat riwayat cuti");
        expect(container.querySelectorAll(".emp-surface")).toHaveLength(2);
    });

    it("SectionCard merender heading dan isi", () => {
        render(
            <SectionCard title="Riwayat Cuti" description="Pengajuan terakhir">
                <p>Isi section</p>
            </SectionCard>
        );

        expect(screen.getByRole("heading", { level: 2, name: "Riwayat Cuti" })).toBeInTheDocument();
        expect(screen.getByText("Isi section")).toBeInTheDocument();
    });
});

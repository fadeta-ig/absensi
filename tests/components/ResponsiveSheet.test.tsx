// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResponsiveSheet from "@/components/ui/ResponsiveSheet";

describe("ResponsiveSheet", () => {
    afterEach(() => {
        cleanup();
        document.body.style.overflow = "";
    });

    it("tidak merender dialog saat isOpen false", () => {
        render(
            <ResponsiveSheet isOpen={false} onClose={vi.fn()} title="Form Survei">
                <p>Isi form</p>
            </ResponsiveSheet>
        );
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(document.body.style.overflow).toBe("");
    });

    it("merender judul, deskripsi, konten, footer, dan mengunci scroll body", () => {
        const { unmount } = render(
            <ResponsiveSheet
                isOpen
                onClose={vi.fn()}
                title="Kuesioner Kepuasan"
                description="Isi seluruh pertanyaan di bawah ini"
                footer={<button type="button">Kirim Jawaban</button>}
            >
                <p>Pertanyaan 1</p>
            </ResponsiveSheet>
        );

        const dialog = screen.getByRole("dialog", { name: "Kuesioner Kepuasan" });
        expect(dialog).toBeInTheDocument();
        expect(screen.getByText("Isi seluruh pertanyaan di bawah ini")).toBeInTheDocument();
        expect(screen.getByText("Pertanyaan 1")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Kirim Jawaban" })).toBeInTheDocument();
        expect(document.body.style.overflow).toBe("hidden");

        unmount();
        expect(document.body.style.overflow).toBe("");
    });

    it("menutup saat tombol Escape ditekan atau tombol tutup diklik", async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(
            <ResponsiveSheet isOpen onClose={onClose} title="Judul Sheet" closeLabel="Tutup sheet">
                <p>Konten</p>
            </ResponsiveSheet>
        );

        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole("button", { name: "Tutup sheet" }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("menghormati closeOnBackdrop=false dan disableClose=true", () => {
        const onClose = vi.fn();
        const { rerender } = render(
            <ResponsiveSheet isOpen onClose={onClose} title="Form Panjang" closeOnBackdrop={false}>
                <p>Konten</p>
            </ResponsiveSheet>
        );

        const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
        fireEvent.mouseDown(backdrop);
        expect(onClose).not.toHaveBeenCalled();

        rerender(
            <ResponsiveSheet isOpen onClose={onClose} title="Form Menyimpan" disableClose>
                <p>Konten</p>
            </ResponsiveSheet>
        );
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Tutup" })).toBeDisabled();
    });
});

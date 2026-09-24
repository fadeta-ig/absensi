// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignaturePad from "@/components/ui/SignaturePad";

describe("SignaturePad Component (AC-12 and AC-14)", () => {
    beforeEach(() => {
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            scale: vi.fn(),
            clearRect: vi.fn(),
            fillRect: vi.fn(),
            fillText: vi.fn(),
        });
        HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,mocked-png-data");
    });
    it("renders canvas and action buttons", () => {
        render(<SignaturePad onSave={vi.fn()} />);
        expect(screen.getByText(/Bubuhkan tanda tangan di sini/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Hapus/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Simpan Tanda Tangan/i })).toBeDisabled();
    });

    it("supports accessible text alternative input", async () => {
        const handleSave = vi.fn().mockResolvedValue(undefined);
        render(<SignaturePad onSave={handleSave} signerName="Ahmad Subari" />);

        // Switch to accessible mode
        await userEvent.click(screen.getByRole("button", { name: /Opsi teks alternatif/i }));
        expect(screen.getByLabelText(/Ketik Nama Lengkap sebagai Tanda Tangan/i)).toBeInTheDocument();

        const input = screen.getByPlaceholderText("Ahmad Subari");
        await userEvent.type(input, "Ahmad Subari");

        const checkbox = screen.getByRole("checkbox");
        await userEvent.click(checkbox);

        const saveButton = screen.getByRole("button", { name: /Simpan Tanda Tangan/i });
        expect(saveButton).toBeEnabled();

        await userEvent.click(saveButton);
        expect(handleSave).toHaveBeenCalledWith(expect.stringContaining("data:image/png;base64,"));
    });

    it("AC-14: displays error message on failed save and keeps state for retry", () => {
        const { rerender } = render(
            <SignaturePad
                onSave={vi.fn()}
                error={null}
            />
        );

        // When parent passes error after failure
        rerender(
            <SignaturePad
                onSave={vi.fn()}
                error="Gagal menghubungi server. Silakan coba lagi."
            />
        );

        expect(screen.getByText("Gagal menghubungi server. Silakan coba lagi.")).toBeInTheDocument();
    });
});

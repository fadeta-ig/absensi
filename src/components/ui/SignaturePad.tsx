"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RotateCcw, Check, AlertCircle } from "lucide-react";

interface SignaturePadProps {
    onSave: (dataUrl: string) => Promise<void>;
    saving?: boolean;
    error?: string | null;
    onClearError?: () => void;
    signerName?: string;
}

export default function SignaturePad({
    onSave,
    saving = false,
    error = null,
    onClearError,
    signerName = "",
}: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [useAccessibleInput, setUseAccessibleInput] = useState(false);
    const [typedName, setTypedName] = useState("");
    const [agreedAccessible, setAgreedAccessible] = useState(false);

    // Initialize and resize canvas
    const setupCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Set logical dimensions
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.scale(dpr, dpr);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = "#1e293b";
            ctx.lineWidth = 2.5;
        }
    }, []);

    useEffect(() => {
        setupCanvas();
        window.addEventListener("resize", setupCanvas);
        return () => window.removeEventListener("resize", setupCanvas);
    }, [setupCanvas]);

    const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.setPointerCapture(e.pointerId);
        const { x, y } = getCanvasCoordinates(e);

        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y);
        }
        setIsDrawing(true);
        setHasDrawn(true);
        if (error && onClearError) onClearError();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;

        const { x, y } = getCanvasCoordinates(e);
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        e.preventDefault();
        const canvas = canvasRef.current;
        if (canvas) {
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch {
                // Ignore pointer release if already lost
            }
        }
        setIsDrawing(false);
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setHasDrawn(false);
        if (error && onClearError) onClearError();
    };

    const handleSave = async () => {
        if (useAccessibleInput) {
            if (!typedName.trim() || !agreedAccessible) return;
            // Generate canvas with text signature
            const canvas = document.createElement("canvas");
            canvas.width = 400;
            canvas.height = 160;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#1e293b";
                ctx.font = "italic 28px Georgia, serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(typedName.trim(), 200, 80);
                const dataUrl = canvas.toDataURL("image/png");
                await onSave(dataUrl);
            }
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas || !hasDrawn) return;

        // Export as PNG data URL
        const dataUrl = canvas.toDataURL("image/png");
        await onSave(dataUrl);
    };

    return (
        <div className="w-full">
            {error && (
                <div className="p-3 mb-3 rounded-lg bg-[var(--destructive-bg)] border border-[var(--destructive-border)] text-[var(--destructive)] text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="flex-1 font-medium">{error}</span>
                </div>
            )}

            {!useAccessibleInput ? (
                <div>
                    <div className="relative border-2 border-dashed border-[var(--border)] rounded-xl bg-white dark:bg-[#0D0D11] overflow-hidden shadow-inner touch-none">
                        <canvas
                            ref={canvasRef}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            className="w-full h-44 cursor-crosshair block"
                            style={{ touchAction: "none" }}
                        />
                        {!hasDrawn && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[var(--text-muted)] opacity-60 text-xs">
                                Bubuhkan tanda tangan di sini (sentuh atau gunakan mouse)
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between mt-3 text-xs">
                        <button
                            type="button"
                            onClick={() => setUseAccessibleInput(true)}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
                        >
                            Opsi teks alternatif
                        </button>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleClear}
                                disabled={!hasDrawn || saving}
                                className="btn btn-secondary btn-sm"
                            >
                                <RotateCcw className="h-3.5 w-3.5" /> Hapus
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!hasDrawn || saving}
                                className="btn btn-primary btn-sm"
                            >
                                <Check className="h-4 w-4" />
                                {saving ? "Menyimpan..." : "Simpan Tanda Tangan"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--card)] space-y-3">
                    <div className="form-group !mb-0">
                        <label htmlFor="accessible-signer-name" className="form-label">
                            Ketik Nama Lengkap sebagai Tanda Tangan
                        </label>
                        <input
                            id="accessible-signer-name"
                            type="text"
                            value={typedName}
                            onChange={(e) => setTypedName(e.target.value)}
                            placeholder={signerName || "Nama Lengkap"}
                            className="form-input"
                        />
                    </div>
                    <label className="flex items-start gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
                        <input
                            type="checkbox"
                            checked={agreedAccessible}
                            onChange={(e) => setAgreedAccessible(e.target.checked)}
                            className="mt-0.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                        />
                        <span>
                            Saya menyatakan bahwa pengetikan nama ini berlaku sah sebagai tanda tangan digital saya.
                        </span>
                    </label>

                    <div className="flex items-center justify-between pt-2 text-xs">
                        <button
                            type="button"
                            onClick={() => setUseAccessibleInput(false)}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
                        >
                            Kembali ke kanvas gambar
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!typedName.trim() || !agreedAccessible || saving}
                            className="btn btn-primary btn-sm"
                        >
                            <Check className="h-4 w-4" />
                            {saving ? "Menyimpan..." : "Simpan Tanda Tangan"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

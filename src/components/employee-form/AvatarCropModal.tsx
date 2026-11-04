"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { X } from "lucide-react";

/** Sisi keluaran persegi (cukup untuk avatar, hemat storage). */
const OUTPUT_SIZE = 512;

function createImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Berkas bukan gambar yang valid."));
        img.src = src;
    });
}

async function getCroppedDataUrl(imageSrc: string, pixels: Area): Promise<string> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Kanva browser tidak tersedia.");
    ctx.drawImage(image, pixels.x, pixels.y, pixels.width, pixels.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    return canvas.toDataURL("image/jpeg", 0.92);
}

interface Props {
    imageSrc: string;
    onCancel: () => void;
    onDone: (croppedDataUrl: string) => void;
}

export function AvatarCropModal({ imageSrc, onCancel, onDone }: Props) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [pixels, setPixels] = useState<Area | null>(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onCropComplete = useCallback((_area: Area, croppedPixels: Area) => {
        setPixels(croppedPixels);
    }, []);

    const handleDone = async () => {
        if (!pixels || processing) return;
        setProcessing(true);
        setError(null);
        try {
            onDone(await getCroppedDataUrl(imageSrc, pixels));
        } catch {
            setError("Gagal memotong gambar. Coba berkas lain.");
            setProcessing(false);
        }
    };

    return (
        <AccessibleModal ariaLabel="Potong foto formal" onClose={onCancel}>
            <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                <div>
                    <h2 className="modal-title">Atur Bingkai Foto</h2>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                        Geser untuk membingkai wajah, gunakan slider untuk zoom.
                    </p>
                </div>
                <button type="button" className="modal-close" onClick={onCancel} aria-label="Tutup modal">
                    <X className="h-5 w-5" />
                </button>
            </div>

            <div className="relative h-[320px] bg-black/80 rounded-lg overflow-hidden">
                <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                />
            </div>

            <div className="mt-3 flex items-center gap-3">
                <label htmlFor="avatar-zoom" className="text-xs font-medium shrink-0">
                    Zoom
                </label>
                <input
                    id="avatar-zoom"
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 min-h-[44px]"
                />
                <span className="text-xs text-[var(--text-muted)] w-10 text-right">{zoom.toFixed(1)}×</span>
            </div>

            {error && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                    {error}
                </p>
            )}

            <div className="flex gap-2 pt-3">
                <button
                    type="button"
                    onClick={() => void handleDone()}
                    disabled={processing || !pixels}
                    className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[48px]"
                >
                    {processing ? "Memproses..." : "Potong & Gunakan"}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground min-h-[48px]"
                >
                    Batal
                </button>
            </div>
        </AccessibleModal>
    );
}

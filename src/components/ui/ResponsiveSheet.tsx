"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export type ResponsiveSheetSize = "sm" | "md" | "lg" | "xl" | "2xl";

export interface ResponsiveSheetProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    /** Judul standar di header sheet. */
    title?: ReactNode;
    /** Deskripsi singkat di bawah judul. */
    description?: ReactNode;
    /** Header kustom penuh (menggantikan title, description, dan tombol tutup bawaan). */
    header?: ReactNode;
    /** Area aksi tetap di bagian bawah (cocok untuk tombol Simpan/Kirim form). */
    footer?: ReactNode;
    /** Lebar maksimum sheet di desktop. Default: "lg". */
    size?: ResponsiveSheetSize;
    /** Label aksesibilitas bila tidak menggunakan prop `title`. */
    ariaLabel?: string;
    /** Label aksesibilitas tombol tutup. Default: "Tutup". */
    closeLabel?: string;
    /** Tampilkan pill drag handle di bagian atas pada layar mobile. Default: true. */
    showDragHandle?: boolean;
    /** Tampilkan tombol X di header bawaan. Default: true. */
    showCloseButton?: boolean;
    /** Tutup saat klik area luar (backdrop). Set false untuk form panjang agar tidak tak sengaja tertutup. Default: true. */
    closeOnBackdrop?: boolean;
    /** Kunci penutupan (tombol X, Escape, backdrop), mis. saat proses simpan berlangsung. Default: false. */
    disableClose?: boolean;
    /** Kelas tambahan untuk kontainer panel sheet. */
    className?: string;
    /** Kelas tambahan untuk area konten yang dapat digulir. */
    bodyClassName?: string;
}

const SIZE_CLASSES: Record<ResponsiveSheetSize, string> = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
};

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Responsive Bottom Sheet Drawer (mobile) yang otomatis menjadi Centered Modal Dialog (desktop).
 * Dilengkapi animasi slide-in-from-bottom, scroll lock latar belakang, Escape key,
 * focus trap, dan dukungan sticky header/footer untuk form maupun kuesioner.
 */
export default function ResponsiveSheet({
    isOpen,
    onClose,
    children,
    title,
    description,
    header,
    footer,
    size = "lg",
    ariaLabel,
    closeLabel = "Tutup",
    showDragHandle = true,
    showCloseButton = true,
    closeOnBackdrop = true,
    disableClose = false,
    className = "",
    bodyClassName = "",
}: ResponsiveSheetProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    // Kunci scroll halaman belakang & kelola fokus saat sheet dibuka/ditutup
    useEffect(() => {
        if (!isOpen) return;

        const previousFocus =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const focusTimer = window.setTimeout(() => {
            if (!dialogRef.current) return;
            if (dialogRef.current.contains(document.activeElement)) return;
            const focusable = dialogRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
            (focusable ?? dialogRef.current)?.focus();
        }, 0);

        return () => {
            window.clearTimeout(focusTimer);
            document.body.style.overflow = originalOverflow;
            previousFocus?.focus();
        };
    }, [isOpen]);

    // Escape untuk menutup + Tab focus trap agar fokus tetap di dalam sheet
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (!disableClose) onCloseRef.current();
                return;
            }

            if (event.key !== "Tab" || !dialogRef.current) return;

            const focusable = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
            );
            if (focusable.length === 0) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, disableClose]);

    if (!isOpen) return null;

    const hasDefaultHeader = !header && (title !== undefined || description !== undefined);
    const hasTitleId = hasDefaultHeader && title !== undefined;
    const hasDescriptionId = hasDefaultHeader && description !== undefined;

    const handleBackdropMouseDown = () => {
        if (!closeOnBackdrop || disableClose) return;
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end lg:justify-center items-center lg:p-4">
            {/* Backdrop */}
            <div
                aria-hidden="true"
                onMouseDown={handleBackdropMouseDown}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            />

            {/* Bottom Sheet (Mobile) / Centered Modal (Desktop) */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={hasTitleId ? titleId : undefined}
                aria-describedby={hasDescriptionId ? descriptionId : undefined}
                aria-label={hasTitleId ? undefined : (ariaLabel ?? "Dialog")}
                tabIndex={-1}
                className={`relative w-full ${SIZE_CLASSES[size]} max-h-[85vh] bg-[var(--card)] border border-[var(--border)] rounded-t-[2rem] lg:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden z-10 animate-in slide-in-from-bottom duration-300 focus:outline-none ${className}`}
            >
                {/* Visual Drag Handle (Mobile) */}
                {showDragHandle && (
                    <div className="pt-3 pb-1 flex justify-center lg:hidden shrink-0">
                        <div className="w-12 h-1.5 rounded-full bg-[var(--border)]" />
                    </div>
                )}

                {/* Header */}
                {header ? (
                    <div className="shrink-0">{header}</div>
                ) : hasDefaultHeader ? (
                    <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
                        <div className="min-w-0">
                            {title !== undefined && (
                                <h2
                                    id={titleId}
                                    className="text-base font-extrabold tracking-tight text-[var(--text-primary)]"
                                >
                                    {title}
                                </h2>
                            )}
                            {description !== undefined && (
                                <p
                                    id={descriptionId}
                                    className="text-[11px] text-[var(--text-muted)] mt-0.5"
                                >
                                    {description}
                                </p>
                            )}
                        </div>
                        {showCloseButton && (
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={disableClose}
                                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full hover:bg-[var(--secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                                aria-label={closeLabel}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                ) : null}

                {/* Scrollable Body */}
                <div
                    className={`flex-1 overflow-y-auto px-6 py-4 custom-scrollbar ${
                        footer ? "" : "pb-[max(1rem,env(safe-area-inset-bottom))]"
                    } ${bodyClassName}`}
                >
                    {children}
                </div>

                {/* Sticky Footer (opsional, ideal untuk tombol aksi form/kuesioner) */}
                {footer && (
                    <div className="px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-[var(--border)] bg-[var(--card)] shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

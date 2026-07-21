"use client";

import { MouseEvent, ReactNode, useEffect, useRef } from "react";

type AccessibleModalProps = {
    children: ReactNode;
    onClose: () => void;
    ariaLabel: string;
    className?: string;
    overlayClassName?: string;
    disableClose?: boolean;
    closeOnBackdrop?: boolean;
};

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function AccessibleModal({
    children,
    onClose,
    ariaLabel,
    className = "",
    overlayClassName = "",
    disableClose = false,
    closeOnBackdrop = true,
}: AccessibleModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusTimer = window.setTimeout(() => {
            const focusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
            (focusable ?? dialogRef.current)?.focus();
        }, 0);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (!disableClose) onClose();
                return;
            }

            if (event.key !== "Tab" || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
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

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener("keydown", handleKeyDown);
            previousFocus?.focus();
        };
    }, [disableClose, onClose]);

    const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
        if (!closeOnBackdrop || disableClose || event.target !== event.currentTarget) return;
        onClose();
    };

    return (
        <div className={`modal-overlay ${overlayClassName}`} onMouseDown={handleOverlayClick}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                tabIndex={-1}
                className={`modal-content ${className}`}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}

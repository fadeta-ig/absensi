"use client";

import { Search, X } from "lucide-react";

interface EquipmentSearchFieldProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

/** Kolom cari pola employee (ikon + tombol hapus, target sentuh 44px). */
export function EquipmentSearchField({ id, label, value, onChange, placeholder }: EquipmentSearchFieldProps) {
    return (
        <div>
            <label htmlFor={id} className="sr-only">
                {label}
            </label>
            <div className="relative">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                    id={id}
                    type="search"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder ?? label}
                    autoComplete="off"
                    className="form-input min-h-[44px] pl-10 pr-10"
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        aria-label="Hapus pencarian"
                        className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground"
                    >
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

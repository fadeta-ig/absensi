"use client";

import React from "react";
import { Save, Trash2 } from "lucide-react";

interface FormDraftBannerProps {
  hasDraft: boolean;
  lastSaved: Date | null;
  onClearDraft: () => void;
  className?: string;
}

export function FormDraftBanner({
  hasDraft,
  lastSaved,
  onClearDraft,
  className = "",
}: FormDraftBannerProps) {
  if (!hasDraft) return null;

  const formattedTime = lastSaved
    ? lastSaved.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  return (
    <div
      className={`flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 px-4 py-2.5 rounded-lg text-sm mb-6 animate-in fade-in duration-300 ${className}`}
      role="status"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
        </span>
        <div className="flex items-center gap-1.5 font-medium">
          <Save className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            Draft isian tersimpan otomatis {formattedTime ? `(${formattedTime})` : ""}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onClearDraft}
        className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 font-medium underline underline-offset-2 transition-colors shrink-0"
        title="Hapus data draft lokal dan reset form"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Hapus Draft & Reset</span>
      </button>
    </div>
  );
}

"use client";

import { Check } from "lucide-react";

export interface StepperStep {
    label: string;
    state: "done" | "active" | "todo" | "failed";
}

/**
 * Stepper horizontal 3 langkah (cuti, surat, dsb).
 * Satu implementasi agar gaya lingkaran/garis/label seragam di portal employee.
 */
export function StepperTimeline({ steps }: { steps: StepperStep[] }) {
    return (
        <div className="flex items-center gap-1 pt-1 border-t border-[var(--border)]">
            {steps.map((step, idx, arr) => (
                <div key={step.label} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-0.5 flex-1">
                        <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                step.state === "done"
                                    ? "bg-green-500 text-white"
                                    : step.state === "failed"
                                      ? "bg-red-500 text-white"
                                      : step.state === "active"
                                        ? "bg-[var(--primary)] text-white"
                                        : "bg-[var(--secondary)] text-[var(--text-muted)]"
                            }`}
                        >
                            {step.state === "done" || step.state === "failed" ? (
                                <Check className="w-2.5 h-2.5" />
                            ) : (
                                <span className="text-[9px] font-bold">{idx + 1}</span>
                            )}
                        </div>
                        <p
                            className={`text-[9px] font-semibold text-center leading-tight ${
                                step.state === "done"
                                    ? "text-green-600"
                                    : step.state === "failed"
                                      ? "text-red-500"
                                      : step.state === "active"
                                        ? "text-[var(--primary)]"
                                        : "text-[var(--text-muted)]"
                            }`}
                        >
                            {step.label}
                        </p>
                    </div>
                    {idx < arr.length - 1 && (
                        <div className={`h-px flex-1 mx-1 mb-3 ${step.state === "done" ? "bg-green-300" : "bg-gray-200"}`} />
                    )}
                </div>
            ))}
        </div>
    );
}

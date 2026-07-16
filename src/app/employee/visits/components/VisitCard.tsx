"use client";

import { Building2, Navigation, Clock, LogIn, LogOut, Trash2 } from "lucide-react";
import { VisitReport } from "@/types";
import { VISIT_STATUS_CONFIG } from "../visitTypes";

interface VisitCardProps {
    visit: VisitReport;
    onSelect: (visit: VisitReport) => void;
    onClockIn: (visit: VisitReport) => void;
    onClockOut: (visit: VisitReport) => void;
    onDelete: (visit: VisitReport) => void;
}

export function VisitCard({ visit, onSelect, onClockIn, onClockOut, onDelete }: VisitCardProps) {
    const cfg = VISIT_STATUS_CONFIG[visit.status];

    return (
        <div
            className="card p-5 hover:border-[var(--primary)] hover:shadow-md transition-all cursor-pointer group flex flex-col h-full bg-[var(--card)]"
            onClick={() => onSelect(visit)}
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--primary)] transition-colors">
                        {visit.clientName}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1 truncate max-w-[150px]">
                            <Navigation className="w-3 h-3 shrink-0" />
                            <span className="truncate">{visit.clientAddress}</span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3 shrink-0" />
                            {visit.date}
                        </span>
                    </div>
                </div>
            </div>

            {/* Clock In/Out Times */}
            {(visit.clockInTime || visit.clockOutTime) && (
                <div className="flex items-center gap-3 mb-3 text-xs">
                    {visit.clockInTime && (
                        <span className="flex items-center gap-1 font-mono text-blue-600 font-semibold">
                            <LogIn className="w-3 h-3" /> {visit.clockInTime}
                        </span>
                    )}
                    {visit.clockOutTime && (
                        <span className="flex items-center gap-1 font-mono text-orange-600 font-semibold">
                            <LogOut className="w-3 h-3" /> {visit.clockOutTime}
                        </span>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="mt-auto pt-3 border-t border-[var(--border)] flex items-center justify-between">
                <span className={`badge ${cfg.class} px-3 py-1 text-[11px] font-bold`}>
                    {cfg.label}
                </span>

                {/* Action Buttons */}
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {visit.status === "draft" && (
                        <>
                            <button
                                onClick={() => onClockIn(visit)}
                                className="btn btn-primary btn-sm !h-7 !px-2.5 !text-[10px]"
                                title="Clock In"
                            >
                                <LogIn className="w-3 h-3" /> Clock In
                            </button>
                            <button
                                onClick={() => onDelete(visit)}
                                className="btn btn-ghost btn-sm !h-7 !px-1.5 text-red-500 hover:!bg-red-50"
                                title="Hapus Draft"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </>
                    )}
                    {visit.status === "clocked_in" && (
                        <button
                            onClick={() => onClockOut(visit)}
                            className="btn btn-primary btn-sm !h-7 !px-2.5 !text-[10px]"
                            title="Clock Out"
                        >
                            <LogOut className="w-3 h-3" /> Clock Out
                        </button>
                    )}
                    {!["draft", "clocked_in"].includes(visit.status) && (
                        <span className="text-xs font-bold text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 translate-x-2 group-hover:translate-x-0">
                            Lihat Detail &rarr;
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

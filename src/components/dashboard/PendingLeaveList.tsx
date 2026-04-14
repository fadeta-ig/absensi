"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, ArrowRight } from "lucide-react";

interface LeaveItem {
    id: string;
    employeeId: string;
    type: string;
    startDate: string;
    endDate: string;
}

interface PendingLeaveListProps {
    leaves: LeaveItem[];
    getEmployeeName: (empId: string) => string;
}

const ITEMS_PER_PAGE = 5;

export default function PendingLeaveList({ leaves, getEmployeeName }: PendingLeaveListProps) {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const totalPages = Math.ceil(leaves.length / ITEMS_PER_PAGE);
    const current = leaves.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h2 className="text-[12px] font-bold text-[#800020] uppercase tracking-wider flex items-center gap-2">
                    <CalendarOff className="w-4 h-4 text-[#ea580c]" /> Pengajuan Cuti Pending
                </h2>
                <button onClick={() => router.push("/dashboard/leave")} className="text-[10px] font-bold text-[#800020] flex items-center gap-1 hover:underline">
                    Kelola <ArrowRight className="w-3 h-3" />
                </button>
            </div>
            <div className="card flex-1 flex flex-col overflow-hidden">
                {leaves.length === 0 ? (
                    <div className="p-8 text-center flex-1 flex flex-col justify-center">
                        <CalendarOff className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                        <p className="text-xs text-[var(--text-muted)]">Tidak ada pengajuan cuti pending</p>
                    </div>
                ) : (
                    <>
                        <div className="divide-y divide-[var(--border)] flex-1">
                            {current.map((l) => (
                                <div key={l.id} className="p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold">
                                            {getEmployeeName(l.employeeId).charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-[var(--text-primary)]">{getEmployeeName(l.employeeId)}</p>
                                            <p className="text-[10px] text-[var(--text-muted)]">{l.type} • {l.startDate} — {l.endDate}</p>
                                        </div>
                                    </div>
                                    <span className="badge badge-warning">Pending</span>
                                </div>
                            ))}
                        </div>
                        {totalPages > 1 && (
                            <div className="p-2 border-t border-[var(--border)] flex justify-between items-center bg-slate-50/50 mt-auto">
                                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-[10px] font-bold px-2.5 py-1.5 text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 transition-colors">Prev</button>
                                <span className="text-[10px] text-gray-500 font-medium">Hal {page} / {totalPages}</span>
                                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="text-[10px] font-bold px-2.5 py-1.5 text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 transition-colors">Next</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

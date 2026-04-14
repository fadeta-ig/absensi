"use client";

import { useState } from "react";
import { Activity, CalendarOff, MapPinned, Clock4 } from "lucide-react";

interface ActivityItem {
    type: string;
    message: string;
    time: string;
}

interface ActivityFeedProps {
    activities: ActivityItem[];
}

const ITEMS_PER_PAGE = 5;

export default function ActivityFeed({ activities }: ActivityFeedProps) {
    const [page, setPage] = useState(1);
    const totalPages = Math.ceil(activities.length / ITEMS_PER_PAGE);
    const current = activities.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-[12px] font-bold text-[#800020] uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#800020]" /> Aktivitas Terbaru
            </h2>
            <div className="card flex-1 flex flex-col overflow-hidden">
                {!activities.length ? (
                    <div className="p-8 text-center flex-1 flex flex-col justify-center">
                        <Activity className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                        <p className="text-xs text-[var(--text-muted)]">Belum ada aktivitas</p>
                    </div>
                ) : (
                    <>
                        <div className="divide-y divide-[var(--border)] flex-1">
                            {current.map((act, i) => (
                                <div key={i} className="p-3 flex items-start gap-3">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${act.type === "leave" ? "bg-orange-100 text-orange-600" : act.type === "visit" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
                                        {act.type === "leave" ? <CalendarOff className="w-3.5 h-3.5" /> : act.type === "visit" ? <MapPinned className="w-3.5 h-3.5" /> : <Clock4 className="w-3.5 h-3.5" />}
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--text-secondary)]">{act.message}</p>
                                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(act.time).toLocaleDateString("id-ID")}</p>
                                    </div>
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

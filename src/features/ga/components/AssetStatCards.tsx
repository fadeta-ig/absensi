import React from "react";

/**
 * StatCard: Premium card for display metrics with accent icons.
 */
export function StatCard({ icon, label, value, bg, color }: { icon: React.ReactNode; label: string; value: number | string; bg: string; color: string }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-all duration-300 group">
            <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105" 
                style={{ backgroundColor: bg, color: color }}
            >
                {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: 2 })}
            </div>
            <div className="min-w-0">
                <div className="text-xs text-slate-500 font-semibold mb-0.5">{label}</div>
                <div className="text-xl font-bold text-slate-900 truncate">{value}</div>
            </div>
        </div>
    );
}

/**
 * CategoryStat: Optimized for the category breakdown section with a slightly different visual weight.
 */
export function CategoryStat({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-row items-center gap-4 hover:shadow-md transition-all duration-300">
            <div className={`p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex-shrink-0`} style={{ color }}>
                {icon}
            </div>
            <div className="flex flex-col min-w-0">
                <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
                <p className="text-2xl font-bold text-slate-800 leading-none">{count}</p>
            </div>
        </div>
    );
}

export function FilterPill({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all duration-200 ${
                active 
                ? "bg-slate-800 text-white shadow-sm" 
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
        >
            {label}
            {count !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${active ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {count}
                </span>
            )}
        </button>
    );
}

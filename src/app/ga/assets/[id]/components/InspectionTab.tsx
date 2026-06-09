import { ClipboardCheck, CheckCircle, AlertCircle } from "lucide-react";
import { AssetCondition } from "@/lib/types/asset";
import { KondisiBadge } from "@/features/ga/components/badges/AssetBadges";

export type InspectionRow = {
    id: string;
    assetId: string;
    kondisiSaat: AssetCondition;
    checklist: Record<string, boolean>;
    notes: string | null;
    performedBy: string;
    inspectedAt: string;
};

export function InspectionTab({ inspections, loaded, onAdd }: { inspections: InspectionRow[]; loaded: boolean; onAdd: () => void }) {
    if (!loaded) return <div className="py-8 text-center text-[var(--text-muted)] text-sm">Memuat inspeksi...</div>;

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button onClick={onAdd} className="bg-[var(--foreground)] text-[var(--background)] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--primary-light)] transition-colors">
                    <ClipboardCheck size={14} /> Catat Inspeksi Baru
                </button>
            </div>
            {inspections.length === 0 ? (
                <div className="py-8 text-center text-[var(--text-muted)] text-sm">Belum ada inspeksi. Scan QR atau Catat Baru untuk mulai.</div>
            ) : (
                <div className="space-y-3">
                    {inspections.map(ins => {
                        const passed = Object.values(ins.checklist).filter(Boolean).length;
                        const total = Object.keys(ins.checklist).length;
                        const allOk = passed === total;
                        return (
                            <div key={ins.id} className="p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)]/50 transition-colors">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${allOk ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400"}`}>
                                            {allOk ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                        </div>
                                        <div>
                                            <span className="text-sm font-semibold text-[var(--text-primary)]">
                                                {new Date(ins.inspectedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                                            </span>
                                            <div className="text-[10px] text-[var(--text-muted)]">{ins.performedBy}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <KondisiBadge kondisi={ins.kondisiSaat} />
                                        <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--secondary)] px-2 py-0.5 rounded-full">
                                            {passed}/{total}
                                        </span>
                                    </div>
                                </div>
                                {/* Checklist Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                    {Object.entries(ins.checklist).map(([key, ok]) => (
                                        <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                                            {ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                                            {key}
                                        </div>
                                    ))}
                                </div>
                                {ins.notes && <p className="text-xs text-[var(--text-secondary)] mt-2 italic border-t border-[var(--border)] pt-2">{ins.notes}</p>}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

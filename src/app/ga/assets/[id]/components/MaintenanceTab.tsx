import { Wrench } from "lucide-react";

export type MaintenanceRow = {
    id: string;
    assetId: string;
    vendorName: string;
    cost: number;
    startDate: string;
    estimatedEndDate: string | null;
    actualEndDate: string | null;
    status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    notes: string | null;
    attachmentUrl: string | null;
    createdAt: string;
};

export function MaintenanceTab({ maintenances, loaded, onAdd }: { maintenances: MaintenanceRow[]; loaded: boolean; onAdd: () => void }) {
    if (!loaded) return <div className="py-8 text-center text-[var(--text-muted)] text-sm">Memuat riwayat servis...</div>;

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button onClick={onAdd} className="bg-[var(--foreground)] text-[var(--background)] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--primary-light)] transition-colors">
                    <Wrench size={14} /> Catat Servis/Maintenance
                </button>
            </div>
            {maintenances.length === 0 ? (
                <div className="py-8 text-center text-[var(--text-muted)] text-sm">Belum ada catatan servis/perawatan.</div>
            ) : (
                <div className="space-y-3">
                    {maintenances.map(maint => {
                        const isDone = maint.status === "COMPLETED";
                        const isCancel = maint.status === "CANCELLED";
                        return (
                            <div key={maint.id} className="p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)]/50 transition-colors flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${isDone ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : isCancel ? "bg-[var(--secondary)] border-[var(--border)] text-[var(--text-muted)]" : "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400"}`}>
                                            <Wrench size={16} />
                                        </div>
                                        <div>
                                            <span className="text-sm font-semibold text-[var(--text-primary)] block">{maint.vendorName}</span>
                                            <span className="text-[10px] text-[var(--text-secondary)]">Mulai: {new Date(maint.startDate).toLocaleDateString("id-ID")}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-flex ${isDone ? "bg-emerald-100 text-emerald-700" : isCancel ? "bg-[var(--secondary)] text-[var(--text-secondary)]" : "bg-amber-100 text-amber-700"}`}>
                                            {maint.status === "IN_PROGRESS" ? "Proses Servis" : maint.status === "COMPLETED" ? "Selesai" : "Dibatalkan"}
                                        </div>
                                        <div className="text-sm font-bold text-[var(--text-primary)] mt-1">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(maint.cost)}</div>
                                    </div>
                                </div>
                                {maint.notes && (
                                    <div className="text-xs text-[var(--text-secondary)] bg-[var(--secondary)] p-2.5 rounded-lg border border-[var(--border)]">
                                        {maint.notes}
                                    </div>
                                )}
                                {maint.attachmentUrl && (
                                    <div className="text-right">
                                        <a href={maint.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold text-indigo-600 hover:underline">
                                            Lihat Bukti/Nota →
                                        </a>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

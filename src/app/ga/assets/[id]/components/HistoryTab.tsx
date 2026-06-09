import { useState } from "react";
import { UserCheck, ArrowRight, Trash2, Wrench, AlertCircle, Clock, Upload, Loader2, FileText } from "lucide-react";
import { AssetHistoryRow } from "@/lib/types/asset";
import { KondisiBadge } from "@/features/ga/components/badges/AssetBadges";

export function HistoryTab({ history, loaded, onRefresh }: { history: AssetHistoryRow[]; loaded: boolean; onRefresh: () => void }) {
    const [uploadingId, setUploadingId] = useState<string | null>(null);

    const handleUploadBast = async (e: React.ChangeEvent<HTMLInputElement>, historyId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingId(historyId);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("historyId", historyId);

        try {
            const res = await fetch("/api/assets/bast", { method: "POST", body: formData });
            if (res.ok) {
                onRefresh();
            } else {
                const data = await res.json();
                alert(data.error || "Gagal upload BAST");
            }
        } catch (err) {
            console.error(err);
            alert("Terjadi kesalahan jaringan.");
        } finally {
            setUploadingId(null);
            e.target.value = ""; // reset input
        }
    };

    const handleDeleteBast = async (bastId: string) => {
        if (!confirm("Hapus dokumen BAST ini?")) return;
        try {
            const res = await fetch(`/api/assets/bast/${bastId}`, { method: "DELETE" });
            if (res.ok) onRefresh();
            else alert("Gagal menghapus BAST");
        } catch (err) {
            console.error(err);
        }
    };

    if (!loaded) return <div className="py-8 text-center text-[var(--text-muted)] text-sm">Memuat riwayat...</div>;
    if (history.length === 0) return <div className="py-8 text-center text-[var(--text-muted)] text-sm">Belum ada riwayat mutasi.</div>;

    const ACTION_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
        assigned: { icon: UserCheck, label: "Diserahkan", color: "text-blue-600 bg-blue-50 border-blue-100" },
        returned: { icon: ArrowRight, label: "Dikembalikan", color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
        retired: { icon: Trash2, label: "Di-retire", color: "text-red-600 bg-red-50 border-red-100" },
        sent_to_maintenance: { icon: Wrench, label: "Maintenance", color: "text-amber-600 bg-amber-50 border-amber-100" },
        kondisi_changed: { icon: AlertCircle, label: "Kondisi Berubah", color: "text-purple-600 bg-purple-50 border-purple-100" },
    };

    return (
        <div className="space-y-3">
            {history.map(h => {
                const cfg = ACTION_CONFIG[h.action] ?? { icon: Clock, label: h.action, color: "text-[var(--text-secondary)] bg-[var(--secondary)] border-[var(--border)]" };
                const Icon = cfg.icon;
                const requiresBast = h.action === "assigned" || h.action === "returned";

                return (
                    <div key={h.id} className="flex flex-col p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)]/50 transition-colors">
                        <div className="flex gap-3 w-full">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${cfg.color}`}>
                                <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-[var(--text-primary)]">{cfg.label}</span>
                                    <KondisiBadge kondisi={h.kondisiSaat} />
                                </div>
                                <div className="text-xs text-[var(--text-secondary)] mt-1">
                                    {h.fromName ?? "GA Pool"} <span className="mx-1">→</span> {h.toName ?? "GA Pool"}
                                </div>
                                {h.notes && <p className="text-xs text-[var(--text-muted)] mt-1 italic">{h.notes}</p>}
                            </div>
                            <div className="text-right shrink-0">
                                <span className="text-[10px] text-[var(--text-muted)] block">{new Date(h.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                                <span className="text-[10px] text-[var(--text-muted)] block">{h.performedBy}</span>
                            </div>
                        </div>

                        {/* BAST Section */}
                        {requiresBast && (
                            <div className="mt-3 pl-12 border-t border-dashed border-[var(--border)] pt-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Dokumen BAST</span>
                                    <label className="cursor-pointer flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                                        {uploadingId === h.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                        {h.bastDocuments && h.bastDocuments.length > 0 ? "Upload Revisi" : "Upload BAST"}
                                        <input type="file" className="hidden" accept=".pdf,image/png,image/jpeg" onChange={(e) => handleUploadBast(e, h.id)} disabled={uploadingId === h.id} />
                                    </label>
                                </div>
                                
                                {h.bastDocuments && h.bastDocuments.length > 0 ? (
                                    <div className="flex flex-col gap-1.5 mt-2">
                                        {h.bastDocuments.map((doc, idx) => (
                                            <div key={doc.id} className="flex items-center justify-between bg-[var(--card)] border border-[var(--border)] p-2 rounded text-xs group">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText size={14} className="text-indigo-500 shrink-0" />
                                                    <a href={`/api/assets/bast/${doc.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--text-primary)] hover:text-indigo-600 hover:underline truncate">
                                                        {doc.fileName}
                                                    </a>
                                                    {idx === 0 && <span className="shrink-0 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">Terbaru</span>}
                                                </div>
                                                <button onClick={() => handleDeleteBast(doc.id)} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 shrink-0 transition-all p-1">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-[var(--text-muted)] italic">Belum ada dokumen BAST yang diunggah.</div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

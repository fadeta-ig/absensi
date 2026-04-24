"use client";

import { useEffect, useState } from "react";
import { Phone, AlertTriangle, Clock, CheckCircle, Calendar, X } from "lucide-react";
import { AssetWithHistory } from "@/lib/types/asset";

export default function NomorPage() {
    const [nomor, setNomor] = useState<AssetWithHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingAsset, setUpdatingAsset] = useState<AssetWithHistory | null>(null);
    const [newDate, setNewDate] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const fetchNomor = async () => {
        setLoading(true);
        try {
            const r = await fetch("/api/assets?category=NUM&limit=5000");
            const data = await r.json();
            const resultData = data.data || data; 
            setNomor(resultData as AssetWithHistory[]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNomor();
    }, []);

    const handleUpdateDate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!updatingAsset || !newDate) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/assets/${updatingAsset.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expiredDate: new Date(newDate).toISOString() })
            });
            if (res.ok) {
                setUpdatingAsset(null);
                setNewDate("");
                fetchNomor();
            } else {
                alert("Gagal memperbarui masa aktif");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const getStatus = (exp: string | null) => {
        if (!exp) return "unknown";
        const d = new Date(exp);
        if (d < now) return "expired";
        if (d < in30) return "soon";
        return "ok";
    };

    const expired = nomor.filter(n => getStatus(n.expiredDate) === "expired");
    const soon = nomor.filter(n => getStatus(n.expiredDate) === "soon");
    const ok = nomor.filter(n => getStatus(n.expiredDate) === "ok" || getStatus(n.expiredDate) === "unknown");

    const openUpdateDialog = (asset: AssetWithHistory) => {
        setUpdatingAsset(asset);
        if (asset.expiredDate) {
            const d = new Date(asset.expiredDate);
            setNewDate(d.toISOString().split("T")[0]);
        } else {
            setNewDate("");
        }
    };

    return (
        <div className="space-y-6 p-6 max-w-5xl mx-auto min-h-screen">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-800">Kartu SIM Indosat</h1>
                <p className="text-sm text-slate-500 mt-1">Monitoring masa aktif nomor Indosat perusahaan</p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard icon={<AlertTriangle className="text-red-600" />} label="Sudah Expired" count={expired.length} bg="bg-red-50 border-red-200" />
                <SummaryCard icon={<Clock className="text-amber-600" />} label="Akan Expired (30hr)" count={soon.length} bg="bg-amber-50 border-amber-200" />
                <SummaryCard icon={<CheckCircle className="text-emerald-600" />} label="Aktif" count={ok.length} bg="bg-emerald-50 border-emerald-200" />
            </div>

            {loading ? (
                <div className="flex items-center justify-center p-12">
                    <div className="spinner" />
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {/* Expired */}
                    {expired.length > 0 && <SectionHeader label="Sudah Expired" color="bg-red-500" />}
                    {expired.map(n => <NomorRow key={n.id} asset={n} urgency="expired" onUpdate={() => openUpdateDialog(n)} />)}

                    {/* Soon */}
                    {soon.length > 0 && <SectionHeader label="Akan Expired dalam 30 Hari" color="bg-amber-500" />}
                    {soon.map(n => <NomorRow key={n.id} asset={n} urgency="soon" onUpdate={() => openUpdateDialog(n)} />)}

                    {/* OK */}
                    {ok.length > 0 && <SectionHeader label="Masih Aktif" color="bg-emerald-500" />}
                    {ok.map(n => <NomorRow key={n.id} asset={n} urgency="ok" onUpdate={() => openUpdateDialog(n)} />)}
                </div>
            )}

            {/* Date Update Modal */}
            {updatingAsset && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <Calendar size={18} className="text-blue-500" /> Perpanjang Masa Aktif
                            </h2>
                            <button onClick={() => setUpdatingAsset(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleUpdateDate} className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nomor</label>
                                <p className="text-sm font-bold text-slate-800">{updatingAsset.nomorIndosat || updatingAsset.name}</p>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Tanggal Expired Baru</label>
                                <input
                                    type="date"
                                    required
                                    value={newDate}
                                    onChange={e => setNewDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
                                />
                            </div>
                            <button type="submit" disabled={isSaving} className="w-full py-2 bg-slate-800 rounded-lg text-sm font-semibold text-white hover:bg-slate-700 transition-colors disabled:opacity-50 mt-2">
                                {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function SectionHeader({ label, color }: { label: string; color: string }) {
    return (
        <div className="flex items-center gap-2 mt-4 mb-2">
            <span className={`w-2.5 h-2.5 rounded-full ${color} shrink-0`} />
            <h2 className="text-sm font-bold text-slate-700">{label}</h2>
        </div>
    );
}

function SummaryCard({ icon, label, count, bg }: { icon: React.ReactNode; label: string; count: number; bg: string }) {
    return (
        <div className={`bg-white border rounded-xl p-4 flex items-center gap-4 shadow-sm ${bg}`}>
            <div className="w-10 h-10 rounded-lg bg-white/60 flex items-center justify-center shrink-0 border border-black/5">{icon}</div>
            <div>
                <p className="text-2xl font-bold text-slate-800 leading-none">{count}</p>
                <p className="text-xs font-medium text-slate-500 mt-1">{label}</p>
            </div>
        </div>
    );
}

function NomorRow({ asset, urgency, onUpdate }: { asset: AssetWithHistory; urgency: string; onUpdate: () => void }) {
    const isExpired = urgency === "expired";
    const isSoon = urgency === "soon";
    
    let borderColor = "border-slate-200";
    let statusBg = "bg-emerald-100 text-emerald-700";
    let statusText = "Aktif";
    let dateColor = "text-slate-800";
    
    if (isExpired) {
        borderColor = "border-red-300";
        statusBg = "bg-red-100 text-red-700";
        statusText = "Expired";
        dateColor = "text-red-600";
    } else if (isSoon) {
        borderColor = "border-amber-300";
        statusBg = "bg-amber-100 text-amber-700";
        statusText = "Segera Expired";
        dateColor = "text-amber-600";
    }

    const expDate = asset.expiredDate ? new Date(asset.expiredDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
    const holderName = asset.assignedEmployee?.name || asset.assignedToName || (asset.holderType === "GA_POOL" ? "GA Pool" : "Perusahaan");

    return (
        <div className={`bg-white border ${borderColor} rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm hover:shadow transition-shadow`}>
            <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0">
                <Phone size={18} className="text-slate-400" />
            </div>
            
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{asset.nomorIndosat ?? asset.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{holderName}</p>
            </div>
            
            <div className="text-left sm:text-right flex-shrink-0">
                <p className="text-xs font-medium text-slate-400">Expired</p>
                <p className={`text-sm font-bold ${dateColor}`}>{expDate}</p>
            </div>
            
            <div className="flex-shrink-0 flex items-center gap-3">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold w-24 justify-center ${statusBg}`}>
                    {statusText}
                </span>
                <button onClick={onUpdate} className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors" title="Perpanjang Masa Aktif">
                    <Calendar size={16} />
                </button>
            </div>
        </div>
    );
}

"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, UserCheck, RefreshCcw, Search, ChevronsUpDown, Check } from "lucide-react";
import { AssetWithHistory } from "@/lib/types/asset";

export default function AssignAssetPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [asset, setAsset] = useState<AssetWithHistory | null>(null);
    const [loadingParams, setLoadingParams] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form State
    const [toHolderType, setToHolderType] = useState("EMPLOYEE");
    const [toName, setToName] = useState("");
    const [toEmployeeId, setToEmployeeId] = useState("");
    const [kondisi, setKondisi] = useState("BAIK");
    const [notes, setNotes] = useState("");

    // Employee List for Search
    const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [assetRes, empRes] = await Promise.all([
                    fetch(`/api/assets/${id}`),
                    fetch("/api/employees?limit=500") // Assuming small enough or we just use simple input for now
                ]);
                
                if (assetRes.ok) {
                    const data = await assetRes.json();
                    setAsset(data);
                    setKondisi(data.kondisi);
                }
                if (empRes.ok) {
                    const data = await empRes.json();
                    // Assuming data.data holds the employees array or data itself
                    const list = Array.isArray(data) ? data : data.data || [];
                    setEmployees(list.map((e: { employeeId: string; name: string }) => ({ id: e.employeeId, name: e.name })));
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingParams(false);
            }
        };
        fetchData();
    }, [id]);

    const handleEmployeeChange = (eId: string) => {
        setToEmployeeId(eId);
        const emp = employees.find(e => e.id === eId);
        if (emp) setToName(emp.name);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        const payload = {
            assetId: id,
            toHolderType, 
            toName,
            toEmployeeId: toHolderType === "EMPLOYEE" ? toEmployeeId : null,
            kondisi,
            notes
        };

        try {
            const res = await fetch(`/api/assets/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Gagal serah terima");
            
            router.push(`/ga/assets/${id}`);
        } catch (err: unknown) {
            if (err instanceof Error) setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loadingParams) return <div className="p-6">Memuat konfigurasi...</div>;
    if (!asset) return <div className="p-6">Aset tidak ditemukan.</div>;

    return (
        <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6 min-h-screen">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-800">Serah Terima Aset</h1>
                    <p className="text-sm text-slate-500 mt-1">{asset.assetCode} - {asset.name}</p>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b bg-slate-50/50">
                    <h2 className="text-md font-semibold text-slate-800 flex items-center gap-2">
                        <RefreshCcw size={18} className="text-blue-500" /> Mutasi Internal
                    </h2>
                </div>
                <div className="p-6 flex flex-col gap-6">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tujuan Penyerahan</label>
                        <select value={toHolderType} onChange={e => { setToHolderType(e.target.value); setToName(""); setToEmployeeId(""); }} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none">
                            <option value="EMPLOYEE">Karyawan Aktif</option>
                            <option value="TEAM">Divisi / Tim / Divisi Virtual</option>
                            <option value="GA_POOL">Kembalikan ke GA Pool (Rak)</option>
                            <option value="FORMER_EMPLOYEE">Mantan Karyawan</option>
                        </select>
                    </div>

                    {toHolderType === "EMPLOYEE" && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Pilih Karyawan</label>
                            <EmployeeCombobox employees={employees} value={toEmployeeId} onChange={handleEmployeeChange} />
                        </div>
                    )}

                    {(toHolderType === "TEAM" || toHolderType === "FORMER_EMPLOYEE") && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Entitas/Pihak</label>
                            <input type="text" required value={toName} onChange={e => setToName(e.target.value)} placeholder="Contoh: Tim Creative, Budi (Resign)" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Kondisi Saat Ini</label>
                        <select value={kondisi} onChange={e => setKondisi(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none">
                            <option value="BAIK">Baik</option>
                            <option value="KURANG_BAIK">Kurang Baik</option>
                            <option value="RUSAK">Rusak</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Catatan Penyerahan (Opsional)</label>
                        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Kondisi lecet sedikit di ujung layar..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                    </div>
                </div>

                <div className="p-6 border-t bg-slate-100/50 flex justify-end gap-3">
                    <button type="button" onClick={() => router.back()} className="px-5 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">Batalkan</button>
                    <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                        <UserCheck size={16} /> {saving ? "Memproses..." : "Konfirmasi Mutasi"}
                    </button>
                </div>
            </form>
        </div>
    );
}

function EmployeeCombobox({
    employees,
    value,
    onChange,
}: {
    employees: { id: string; name: string }[];
    value: string;
    onChange: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
    const selected = employees.find(e => e.id === value);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 flex justify-between items-center text-slate-700"
            >
                {selected ? selected.name : "-- Pilih Karyawan --"}
                <ChevronsUpDown size={14} className="text-slate-400" />
            </button>
            {open && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                        <Search size={14} className="text-slate-400" />
                        <input
                            type="text"
                            placeholder="Cari nama karyawan..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full text-sm bg-transparent focus:outline-none"
                            autoFocus
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto w-full flex flex-col">
                        {filtered.length === 0 ? (
                            <div className="p-3 text-xs text-center text-slate-500">Karyawan tidak ditemukan.</div>
                        ) : (
                            filtered.map(emp => (
                                <button
                                    key={emp.id}
                                    type="button"
                                    onClick={() => { onChange(emp.id); setOpen(false); setSearch(""); }}
                                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0"
                                >
                                    {emp.name}
                                    {value === emp.id && <Check size={14} className="text-blue-600" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

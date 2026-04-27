"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, CheckSquare, Square, Search, Filter } from "lucide-react";
import QRCode from "react-qr-code";
import { AssetWithHistory } from "@/lib/types/asset";

export default function PrintLabelsPage() {
    const router = useRouter();
    const [assets, setAssets] = useState<AssetWithHistory[]>([]);
    const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("ALL");

    useEffect(() => {
        fetch("/api/assets/categories")
            .then(res => res.json())
            .then(data => setCategories(data))
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ limit: "5000" });
                if (search) params.set("search", search);
                if (categoryFilter !== "ALL") params.set("category", categoryFilter);

                const res = await fetch(`/api/assets?${params.toString()}`);
                if (res.ok) {
                    const parsed = await res.json();
                    setAssets(parsed.data || parsed);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(() => {
            fetchAll();
        }, 500);

        return () => clearTimeout(timer);
    }, [search, categoryFilter]);

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === assets.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(assets.map(a => a.id)));
    };

    const handlePrint = () => window.print();

    const selectedAssets = assets.filter(a => selectedIds.has(a.id));

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="spinner" />
        </div>
    );

    return (
        <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6 min-h-screen">
            {/* ─── Screen UI — Hidden on Print ─── */}
            <div className="print:hidden flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.back()}
                            className="p-2 border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Cetak Label QR</h1>
                            <p className="text-sm text-slate-500 mt-1">Pilih aset untuk mencetak stiker QR ke kertas A4.</p>
                        </div>
                    </div>
                    <button
                        disabled={selectedIds.size === 0}
                        onClick={handlePrint}
                        className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        <Printer size={16} />
                        Cetak {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                    </button>
                </div>

                {/* Asset Selector */}
                <div className="bg-white border rounded-xl overflow-hidden shadow-sm flex flex-col max-h-[500px]">
                    <div className="px-4 py-3 border-b flex flex-col sm:flex-row gap-3 items-center bg-slate-50/60 justify-between">
                        <div className="flex gap-2 items-center w-full sm:w-auto">
                            <button
                                onClick={toggleAll}
                                disabled={loading}
                                className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors disabled:opacity-50"
                            >
                                {selectedIds.size === assets.length && assets.length > 0
                                    ? <CheckSquare size={16} className="text-indigo-600" />
                                    : <Square size={16} />
                                }
                                Pilih Semua ({assets.length})
                            </button>
                            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full whitespace-nowrap">
                                {selectedIds.size} Terpilih
                            </span>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <div className="relative flex-1 sm:w-48">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input 
                                    type="text" 
                                    placeholder="Cari aset..." 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800"
                                />
                            </div>
                            <div className="relative w-full sm:w-40">
                                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <select 
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none"
                                >
                                    <option value="ALL">Semua Kategori</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 bg-slate-50/40 opacity-100 transition-opacity" style={{opacity: loading ? 0.5 : 1}}>
                        {assets.map(asset => {
                            const isSelected = selectedIds.has(asset.id);
                            return (
                                <div
                                    key={asset.id}
                                    onClick={() => toggleSelection(asset.id)}
                                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                                        isSelected
                                            ? "bg-indigo-50 border-indigo-300 shadow-sm ring-1 ring-indigo-500/20"
                                            : "bg-white border-slate-200 hover:bg-slate-50"
                                    }`}
                                >
                                    <div className={isSelected ? "text-indigo-600" : "text-slate-300"}>
                                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-xs font-bold text-slate-800 truncate">{asset.assetCode}</span>
                                        <span className="text-[10px] text-slate-500 truncate">{asset.name}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Preview Section */}
                {selectedIds.size > 0 && (
                    <div>
                        <p className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wider text-xs">Preview Label</p>
                        <div className="flex flex-wrap gap-4">
                            {selectedAssets.slice(0, 4).map(asset => (
                                <QrLabel key={`preview-${asset.id}`} asset={asset} />
                            ))}
                            {selectedAssets.length > 4 && (
                                <div className="w-[148px] h-[205px] border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-sm font-semibold">
                                    +{selectedAssets.length - 4} lainnya
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Print Area — Only visible on print ─── */}
            {selectedIds.size > 0 && (
                <div>
                    <style dangerouslySetInnerHTML={{ __html: `
                        @media print {
                            body * { visibility: hidden; }
                            .print-area, .print-area * { visibility: visible; }
                            .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 8mm; box-sizing: border-box; }
                            @page { margin: 8mm; size: A4; }
                        }
                    `}} />
                    <div className="print-area hidden print:block">
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6mm" }}>
                            {selectedAssets.map(asset => (
                                <QrLabel key={`print-${asset.id}`} asset={asset} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Modern QR Label Card — logo only, no "PT WIG Asset" text */
function QrLabel({ asset }: { asset: AssetWithHistory }) {
    const categoryColor: Record<string, string> = {
        HANDPHONE: "#6366f1",
        LAPTOP: "#0ea5e9",
        NOMOR_HP: "#10b981",
    };
    const accentColor = categoryColor[asset.category?.name ?? ""] ?? "#64748b";

    return (
        <div
            style={{
                width: "4.8cm",
                height: "6.6cm",
                background: "#ffffff",
                border: `2px solid ${accentColor}`,
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 6px 8px",
                overflow: "hidden",
                breakInside: "avoid",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                fontFamily: "system-ui, sans-serif",
            }}
        >
            {/* Top bar: logo */}
            <div style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 2px",
                marginBottom: "2px",
            }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/assets/Logo WIG.png"
                    alt="WIG Logo"
                    style={{ height: "22px", width: "auto", objectFit: "contain" }}
                />
                <span style={{
                    fontSize: "7px",
                    fontWeight: 700,
                    color: accentColor,
                    background: `${accentColor}18`,
                    padding: "2px 6px",
                    borderRadius: "999px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                }}>
                    {asset.category?.name?.replace("_", " ") ?? "ASET"}
                </span>
            </div>

            {/* QR Code */}
            <div style={{
                background: "#f8fafc",
                borderRadius: "8px",
                padding: "6px",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}>
                <QRCode
                    value={typeof window !== "undefined" ? `${window.location.origin}/scan/${asset.id}` : ""}
                    size={98}
                    level="M"
                    fgColor="#000000"
                    bgColor="#f8fafc"
                    style={{ width: "2.8cm", height: "2.8cm", display: "block" }}
                />
            </div>

            {/* Asset Info */}
            <div style={{
                width: "100%",
                textAlign: "center",
                paddingTop: "4px",
            }}>
                {/* Accent line */}
                <div style={{
                    width: "32px",
                    height: "2px",
                    background: accentColor,
                    borderRadius: "999px",
                    margin: "0 auto 4px",
                }} />

                <div style={{
                    fontFamily: "monospace",
                    fontSize: "10px",
                    fontWeight: 800,
                    color: "#1e293b",
                    letterSpacing: "0.08em",
                }}>
                    {asset.assetCode}
                </div>
                <div style={{
                    fontSize: "8px",
                    color: "#64748b",
                    marginTop: "2px",
                    lineHeight: 1.3,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                }}>
                    {asset.name}
                </div>
            </div>
        </div>
    );
}

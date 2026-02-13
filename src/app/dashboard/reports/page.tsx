"use client";

import { useState } from "react";
import {
    FileDown, FileSpreadsheet, Calendar,
    ClipboardList, MapPinned, Clock4,
    Loader2, AlertCircle, Download, Eye
} from "lucide-react";

interface PreviewData {
    sheetName: string;
    period: string;
    totalRecords: number;
    data: Record<string, string | number | null>[];
}

const REPORT_TYPES = [
    { value: "attendance", label: "Laporan Absensi", icon: ClipboardList, description: "Data kehadiran karyawan per periode" },
    { value: "visits", label: "Laporan Kunjungan", icon: MapPinned, description: "Data kunjungan bisnis per periode" },
    { value: "overtime", label: "Laporan Lembur", icon: Clock4, description: "Data pengajuan lembur per periode" },
];

export default function ReportsPage() {
    const [type, setType] = useState("attendance");
    const [period, setPeriod] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    });
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [error, setError] = useState("");

    const handlePreview = async () => {
        setLoading(true);
        setError("");
        setPreview(null);
        try {
            const res = await fetch(`/api/export?type=${type}&period=${period}&format=json`);
            const data = await res.json();
            if (res.ok) {
                setPreview(data);
            } else {
                setError(data.error || "Gagal memuat data");
            }
        } catch {
            setError("Terjadi kesalahan koneksi");
        }
        setLoading(false);
    };

    const handleDownload = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/export?type=${type}&period=${period}&format=excel`);
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Gagal mengunduh");
                setLoading(false);
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `laporan_${type}_${period}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            setError("Gagal mengunduh file");
        }
        setLoading(false);
    };

    const selectedType = REPORT_TYPES.find((t) => t.value === type);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <FileDown className="w-5 h-5 text-[var(--primary)]" />
                    Export Laporan
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Download data HRIS dalam format Excel</p>
            </div>

            {/* Report Type Selection */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Pilih Jenis Laporan</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {REPORT_TYPES.map((rt) => {
                        const Icon = rt.icon;
                        const isActive = type === rt.value;
                        return (
                            <button
                                key={rt.value}
                                onClick={() => { setType(rt.value); setPreview(null); setError(""); }}
                                className={`card p-4 text-left transition-all ${isActive ? "ring-2 ring-[var(--primary)] bg-[var(--primary)]/5" : "hover:shadow-md"}`}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? "bg-[var(--primary)] text-white" : "bg-[var(--primary)]/10 text-[var(--primary)]"}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{rt.label}</h3>
                                </div>
                                <p className="text-xs text-[var(--text-muted)]">{rt.description}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Period & Actions */}
            <div className="card p-5 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Periode</span>
                        </label>
                        <input
                            type="month"
                            className="form-input"
                            value={period}
                            onChange={(e) => { setPeriod(e.target.value); setPreview(null); setError(""); }}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handlePreview} className="btn btn-secondary" disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                            Preview
                        </button>
                        <button onClick={handleDownload} className="btn btn-primary" disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            <FileSpreadsheet className="w-4 h-4" /> Download Excel
                        </button>
                    </div>
                </div>

                {/* Info */}
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <FileDown className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-medium text-blue-700">
                            {selectedType?.label} — {new Date(period + "-01").toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                        </p>
                        <p className="text-[11px] text-blue-600 mt-0.5">File akan otomatis terdownload dalam format .xlsx</p>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {/* Data Preview */}
            {preview && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                            Preview Data ({preview.totalRecords} baris)
                        </h2>
                    </div>
                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        {preview.data.length > 0 && Object.keys(preview.data[0]).map((key) => (
                                            <th key={key}>{key}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.data.slice(0, 20).map((row, i) => (
                                        <tr key={i}>
                                            {Object.values(row).map((val, j) => (
                                                <td key={j} className="text-xs">{String(val ?? "-")}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {preview.totalRecords > 20 && (
                            <div className="p-3 text-center border-t border-[var(--border)]">
                                <p className="text-xs text-[var(--text-muted)]">Menampilkan 20 dari {preview.totalRecords} baris. Download untuk data lengkap.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

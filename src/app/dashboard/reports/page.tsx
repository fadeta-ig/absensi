"use client";

import { useState, useEffect } from "react";
import {
    FileDown, FileSpreadsheet, Calendar,
    ClipboardList, MapPinned, Clock4,
    Loader2, AlertCircle, Download, Eye, FileText, CheckSquare
} from "lucide-react";
import { exportToExcel, exportToPdfMatrix } from "@/lib/export";

interface PreviewData {
    sheetName: string;
    period: string;
    totalRecords: number;
    data: Record<string, string | number | null>[];
    headers: string[];
}

const REPORT_TYPES = [
    { value: "attendance", label: "Laporan Absensi", icon: ClipboardList, description: "Data kehadiran karyawan per periode" },
    { value: "visits", label: "Laporan Kunjungan", icon: MapPinned, description: "Data kunjungan bisnis per periode" },
    { value: "overtime", label: "Laporan Lembur", icon: Clock4, description: "Data pengajuan lembur per periode" },
];

export default function ReportsPage() {
    const [type, setType] = useState("attendance");
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
    });
    const [divisionId, setDivisionId] = useState("");
    const [departmentId, setDepartmentId] = useState("");
    const [employeeId, setEmployeeId] = useState("");

    const [divisions, setDivisions] = useState<{ id: string, name: string }[]>([]);
    const [departments, setDepartments] = useState<{ id: string, name: string, divisionId: string }[]>([]);
    // NOTE: employees array from api/employees maps departmentRel to department and divisionRel to division. However, divisionId and departmentId are standard keys.
    const [employees, setEmployees] = useState<{ employeeId: string, name: string, departmentId: string, divisionId: string }[]>([]);

    useEffect(() => {
        Promise.all([
            fetch("/api/master/divisions").then(r => r.json()),
            fetch("/api/master/departments").then(r => r.json()),
            fetch("/api/employees").then(r => r.json())
        ]).then(([divs, depts, emps]) => {
            if (Array.isArray(divs)) setDivisions(divs);
            if (Array.isArray(depts)) setDepartments(depts);
            if (Array.isArray(emps)) setEmployees(emps);
        }).catch(() => {});
    }, []);

    const filteredDepartments = divisionId ? departments.filter(d => d.divisionId === divisionId) : departments;
    const filteredEmployees = employees.filter(e => {
         if (departmentId && e.departmentId !== departmentId) return false;
         if (divisionId && e.divisionId !== divisionId) return false;
         return true;
    });

    useEffect(() => { setDepartmentId(""); setEmployeeId(""); }, [divisionId]);
    useEffect(() => { setEmployeeId(""); }, [departmentId]);

    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [error, setError] = useState("");
    const [isGrouped, setIsGrouped] = useState(false);
    const [isMatrix, setIsMatrix] = useState(true);

    const buildQuery = (format: string) => {
        const query: Record<string, string> = {
            type, startDate, endDate, format,
            grouped: String(isGrouped && !isMatrix), mode: isMatrix ? "matrix" : ""
        };
        if (divisionId) query.divisionId = divisionId;
        if (departmentId) query.departmentId = departmentId;
        if (employeeId) query.employeeId = employeeId;
        return new URLSearchParams(query);
    };

    const isMatrixValid = () => {
        if (!isMatrix) return true;
        const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24);
        if (days >= 31) {
            setError("Rentang tanggal untuk Mode Matriks maksimal 31 hari.");
            return false;
        }
        return true;
    };

    const handlePreview = async () => {
        setLoading(true);
        setError("");
        setPreview(null);
        try {
            if (!isMatrixValid()) {
                setLoading(false);
                return;
            }
            const query = buildQuery("json");
            const res = await fetch(`/api/export?${query.toString()}`);
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

    const handleDownload = async (format: "excel" | "pdf") => {
        setLoading(true);
        setError("");
        try {
            if (!isMatrixValid()) {
                setLoading(false);
                return;
            }
            const query = buildQuery(format === "excel" ? "excel" : "json");

            if (format === "excel") {
                const res = await fetch(`/api/export?${query.toString()}`);
                if (!res.ok) throw new Error("Gagal mengunduh");
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `laporan_${type}_${startDate}_${endDate}_${isMatrix ? "matrix" : isGrouped ? "grouped" : "flat"}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                // PDF Export
                const res = await fetch(`/api/export?${query.toString()}`);
                const result = await res.json();
                if (!res.ok) throw new Error(result.error || "Gagal mengambil data untuk PDF");

                if (isMatrix) {
                    const headers = result.headers || Object.keys(result.data[0]);
                    const body = result.data.map((r: any) => headers.map((h: string) => r[h]));
                    exportToPdfMatrix(
                        body,
                        headers,
                        `REKAP ABSENSI KARYAWAN`,
                        `Rekap_Absensi_${startDate}_${endDate}`,
                        `Periode: ${new Date(startDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} s/d ${new Date(endDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} | H=Hadir, T=Terlambat, A=Alpa, C=Cuti`
                    );
                } else {
                    // Fallback for simple PDF if needed, but primarily for Matrix
                    setError("PDF saat ini hanya didukung untuk Mode Matriks.");
                }
            }
        } catch (err: any) {
            setError(err.message || "Gagal mendownload file");
        }
        setLoading(false);
    };

    const selectedType = REPORT_TYPES.find((t) => t.value === type);

    const toggleMatrix = () => {
        setIsMatrix(!isMatrix);
        if (!isMatrix) setIsGrouped(false);
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <FileDown className="w-5 h-5 text-[var(--primary)]" />
                        Export Laporan
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Download data HRIS dalam format Excel & PDF</p>
                </div>
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

            {/* Filters & Actions */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] space-y-5">
                {/* Parameter Organisasi */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Divisi (Opsional)</label>
                        <select className="form-select h-10 w-full text-sm rounded-lg border-gray-200 bg-gray-50 focus:bg-white transition-colors" value={divisionId} onChange={(e) => { setDivisionId(e.target.value); setPreview(null); }}>
                            <option value="">-- Semua Divisi --</option>
                            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Departemen (Opsional)</label>
                        <select className="form-select h-10 w-full text-sm rounded-lg border-gray-200 bg-gray-50 focus:bg-white transition-colors disabled:opacity-50" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPreview(null); }} disabled={!!divisionId && filteredDepartments.length === 0}>
                            <option value="">-- Semua Departemen --</option>
                            {filteredDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Karyawan (Opsional)</label>
                        <select className="form-select h-10 w-full text-sm rounded-lg border-gray-200 bg-gray-50 focus:bg-white transition-colors" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPreview(null); }}>
                            <option value="">-- Semua Karyawan --</option>
                            {filteredEmployees.map(e => <option key={e.employeeId} value={e.employeeId}>{e.name}</option>)}
                        </select>
                    </div>
                </div>

                <hr className="border-gray-100" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    {/* Left: Periode */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> Rentang Tanggal
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                className="form-input h-11 w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-xl focus:border-[#800020] focus:ring-[#800020]/20"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setPreview(null); setError(""); }}
                            />
                            <span className="text-gray-400 text-xs font-medium">s/d</span>
                            <input
                                type="date"
                                className="form-input h-11 w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-xl focus:border-[#800020] focus:ring-[#800020]/20"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setPreview(null); setError(""); }}
                            />
                        </div>
                    </div>

                    {/* Middle: Mode */}
                    {type === "attendance" ? (
                        <div className="flex flex-col gap-1.5 pt-0.5">
                            <label className="text-[11px] font-bold text-slate-600 uppercase cursor-pointer flex items-center gap-2 select-none" onClick={toggleMatrix}>
                                <div className={`w-10 h-6 rounded-full transition-colors relative ${isMatrix ? "bg-[#800020]" : "bg-gray-300"}`}>
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isMatrix ? "translate-x-4 shadow-[0_1px_3px_rgba(0,0,0,0.2)]" : "shadow-[0_1px_3px_rgba(0,0,0,0.1)]"}`} />
                                </div>
                                Mode Matriks (Horizontal)
                            </label>
                            <p className="text-[10px] text-slate-400 italic leading-tight pl-12 -mt-0.5">Baris: Karyawan, Kolom: Tanggal. Cocok untuk rekap bulanan.</p>

                            {!isMatrix && (
                                <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-gray-100">
                                    <label className="text-[11px] font-bold text-slate-600 uppercase cursor-pointer flex items-center gap-2 select-none" onClick={() => setIsGrouped(!isGrouped)}>
                                        <div className={`w-10 h-6 rounded-full transition-colors relative ${isGrouped ? "bg-[#800020]" : "bg-gray-300"}`}>
                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isGrouped ? "translate-x-4 shadow-[0_1px_3px_rgba(0,0,0,0.2)]" : "shadow-[0_1px_3px_rgba(0,0,0,0.1)]"}`} />
                                        </div>
                                        Rekap Per Karyawan
                                    </label>
                                    <p className="text-[10px] text-slate-400 italic leading-tight pl-12 -mt-0.5">Tampilan vertikal dikelompokkan per nama.</p>
                                </div>
                            )}
                        </div>
                    ) : <div />}

                    {/* Right: Actions */}
                    <div className="flex flex-col gap-2 md:justify-self-end w-full md:w-[280px]">
                        <button onClick={handlePreview} className="flex items-center justify-center gap-2 w-full h-[42px] bg-[#FAF9F9] hover:bg-gray-100 border border-gray-200 text-gray-700 text-xs font-semibold rounded-[10px] transition-colors" disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                            Preview
                        </button>
                        <div className="flex items-center gap-2 w-full">
                            <button onClick={() => handleDownload("excel")} className="flex-1 flex items-center justify-center gap-2 h-[42px] bg-[#800020] hover:bg-[#600018] text-white text-[13px] font-semibold rounded-[10px] shadow-[0_2px_8px_rgba(128,0,32,0.25)] transition-colors" disabled={loading}>
                                <FileSpreadsheet className="w-4 h-4" /> Excel
                            </button>
                            {isMatrix && type === "attendance" ? (
                                <button onClick={() => handleDownload("pdf")} className="flex-1 flex items-center justify-center gap-2 h-[42px] bg-[#FFF5F5] hover:bg-[#FFEBEB] border border-[#FFE0E0] text-[#800020] text-[13px] font-semibold rounded-[10px] transition-colors" disabled={loading}>
                                    <FileText className="w-4 h-4" /> PDF
                                </button>
                            ) : (
                                <div className="flex-1" />
                            )}
                        </div>
                    </div>
                </div>

                {/* Legend for Matrix */}
                {isMatrix && type === "attendance" && (
                    <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-[#FAFAFA] rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] font-bold text-[#800020] uppercase tracking-tight">Format Detail:</span>
                            <div className="flex flex-col border border-gray-200 rounded p-1 bg-white scale-[0.85] origin-left shadow-sm">
                                <span className="text-[9px] font-bold text-[#2563EB] leading-none">JAM MASUK</span>
                                <span className="text-[9px] font-bold text-[#EA580C] leading-none border-t border-gray-100 mt-0.5 pt-0.5">JAM PULANG</span>
                            </div>
                        </div>
                        <div className="hidden md:block w-px h-5 bg-gray-200 mx-1" />
                        <div className="flex flex-wrap gap-5">
                            <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 flex items-center justify-center bg-[#EFF6FF] text-[#2563EB] text-[10px] font-bold rounded-md">H</span>
                                <span className="text-[11px] text-gray-500">Hadir</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 flex items-center justify-center bg-[#FFF7ED] text-[#EA580C] text-[10px] font-bold rounded-md">T</span>
                                <span className="text-[11px] text-gray-500">Terlambat</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 flex items-center justify-center bg-[#FEF2F2] text-[#DC2626] text-[10px] font-bold rounded-md">A</span>
                                <span className="text-[11px] text-gray-500">Alpa</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <FileDown className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-bold text-blue-700">
                        {selectedType?.label} — {new Date(startDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} s/d {new Date(endDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                        {isGrouped && type === "attendance" && <span className="ml-2 px-1.5 py-0.5 bg-blue-600 text-white text-[9px] rounded-sm uppercase">Mode Grouped</span>}
                    </p>
                    <p className="text-[10px] text-blue-600 mt-0.5 font-medium">Format: .xlsx (Excel). Pastikan periode sudah sesuai sebelum mendownload.</p>
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
                    <div className="card overflow-hidden border border-gray-100 shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[max-content]">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        {preview.headers.map((h) => (
                                            <th key={h} className={`p-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-tight border-r border-gray-100 last:border-0 ${!isNaN(Number(h)) ? "text-center w-12" : ""}`}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-50 text-[11px]">
                                    {preview.data.slice(0, 10).map((row, i) => (
                                        <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                                            {preview.headers.map((h) => {
                                                const val = row[h];
                                                const isDateCol = !isNaN(Number(h));

                                                if (isDateCol && typeof val === "string" && val.includes("\n")) {
                                                    const [clockIn, clockOut] = val.split("\n");
                                                    return (
                                                        <td key={h} className="p-1 border-r border-gray-100 text-center last:border-0">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className={`px-1 py-0.5 rounded-sm font-bold text-[9px] ${clockIn === "-" ? "bg-gray-50 text-gray-400" : "bg-blue-50 text-blue-700"}`}>{clockIn}</span>
                                                                <span className={`px-1 py-0.5 rounded-sm font-bold text-[9px] ${clockOut === "-" ? "bg-gray-50 text-gray-400" : "bg-orange-50 text-orange-700"}`}>{clockOut}</span>
                                                            </div>
                                                        </td>
                                                    );
                                                }

                                                return (
                                                    <td key={h} className={`p-2.5 border-r border-gray-100 last:border-0 ${h === "Nama" || h === "Nama Karyawan" ? "font-bold text-gray-900" : "text-gray-600"} ${isDateCol || h === "Hadir" || h === "Lambat" || h === "Alpa" ? "text-center" : ""}`}>
                                                        {val || "-"}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {preview.totalRecords > 10 && (
                            <div className="p-2.5 text-center border-t border-gray-100 bg-gray-50/50">
                                <p className="text-[10px] text-gray-500 italic">Menampilkan 10 dari {preview.totalRecords} baris. Download Excel/PDF untuk data lengkap.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

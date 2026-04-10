"use client";

import { useState, useRef, useCallback } from "react";
import {
    X, Upload, Download, FileSpreadsheet, CheckCircle2,
    AlertCircle, Loader2, ArrowRight, ArrowLeft, Users,
} from "lucide-react";

interface RowError {
    row: number;
    field: string;
    message: string;
}

interface ValidationReport {
    validRows: Record<string, unknown>[];
    errors: RowError[];
    totalRows: number;
}

interface ImportResult {
    created: number;
    failed: number;
    errors: RowError[];
}

type Step = "upload" | "validation" | "confirm" | "result";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: () => void;
}

export default function BulkImportModal({ isOpen, onClose, onImportComplete }: Props) {
    const [step, setStep] = useState<Step>("upload");
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<ValidationReport | null>(null);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const reset = useCallback(() => {
        setStep("upload");
        setFile(null);
        setReport(null);
        setResult(null);
        setLoading(false);
    }, []);

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(e.type === "dragenter" || e.type === "dragover");
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile?.name.endsWith(".xlsx")) {
            setFile(droppedFile);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected?.name.endsWith(".xlsx")) {
            setFile(selected);
        }
    };

    const handleValidate = async () => {
        if (!file) return;
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("mode", "validate");

            const res = await fetch("/api/employees/import", { method: "POST", body: formData });
            const data: ValidationReport = await res.json();
            setReport(data);
            setStep("validation");
        } catch {
            setReport({ validRows: [], errors: [{ row: 0, field: "-", message: "Gagal memvalidasi file." }], totalRows: 0 });
            setStep("validation");
        }
        setLoading(false);
    };

    const handleExecute = async () => {
        if (!file) return;
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("mode", "execute");

            const res = await fetch("/api/employees/import", { method: "POST", body: formData });
            const data: ImportResult = await res.json();
            setResult(data);
            setStep("result");
            onImportComplete();
        } catch {
            setResult({ created: 0, failed: report?.totalRows ?? 0, errors: [{ row: 0, field: "-", message: "Terjadi kesalahan server." }] });
            setStep("result");
        }
        setLoading(false);
    };

    const handleDownloadTemplate = async () => {
        try {
            const res = await fetch("/api/employees/import/template");
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "Template_Import_Karyawan.xlsx";
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            /* silent fail */
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
            <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden border border-[var(--border)]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-[var(--text-primary)]">Import Massal Karyawan</h2>
                            <p className="text-xs text-[var(--text-muted)]">
                                {step === "upload" && "Upload file Excel"}
                                {step === "validation" && "Hasil validasi data"}
                                {step === "confirm" && "Konfirmasi import"}
                                {step === "result" && "Hasil import"}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="btn btn-ghost !p-2 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="px-6 py-3 border-b border-[var(--border)] bg-[var(--secondary)]/30">
                    <div className="flex items-center gap-2 text-xs">
                        {(["upload", "validation", "confirm", "result"] as Step[]).map((s, i) => {
                            const labels = ["Upload", "Validasi", "Konfirmasi", "Hasil"];
                            const isActive = s === step;
                            const isDone = ["upload", "validation", "confirm", "result"].indexOf(step) > i;
                            return (
                                <div key={s} className="flex items-center gap-2">
                                    {i > 0 && <div className={`w-6 h-px ${isDone ? "bg-green-500" : "bg-[var(--border)]"}`} />}
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition-all
                                        ${isActive ? "bg-[var(--primary)] text-white" : isDone ? "bg-green-100 text-green-700" : "text-[var(--text-muted)]"}
                                    `}>
                                        {isDone && <CheckCircle2 className="w-3 h-3" />}
                                        <span>{labels[i]}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Step: Upload */}
                    {step === "upload" && (
                        <div className="space-y-5">
                            <button
                                onClick={handleDownloadTemplate}
                                className="w-full flex items-center gap-3 p-4 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 transition-colors text-left"
                            >
                                <Download className="w-5 h-5 text-blue-600 shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-blue-700">Download Template Excel</p>
                                    <p className="text-xs text-blue-500">Template berisi header, contoh data, dropdown, dan daftar referensi</p>
                                </div>
                            </button>

                            <div
                                className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all
                                    ${dragActive ? "border-[var(--primary)] bg-[var(--primary)]/5 scale-[1.01]" : "border-[var(--border)] hover:border-[var(--primary)]/50"}
                                    ${file ? "border-green-400 bg-green-50/30" : ""}
                                `}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                {file ? (
                                    <div className="space-y-2">
                                        <FileSpreadsheet className="w-12 h-12 text-green-500 mx-auto" />
                                        <p className="font-semibold text-[var(--text-primary)]">{file.name}</p>
                                        <p className="text-xs text-[var(--text-muted)]">{(file.size / 1024).toFixed(1)} KB</p>
                                        <button
                                            onClick={() => setFile(null)}
                                            className="text-xs text-red-500 hover:underline"
                                        >
                                            Hapus file
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <Upload className="w-12 h-12 text-[var(--text-muted)] mx-auto" />
                                        <div>
                                            <p className="text-sm font-medium text-[var(--text-primary)]">
                                                Drag & drop file Excel di sini
                                            </p>
                                            <p className="text-xs text-[var(--text-muted)]">atau</p>
                                        </div>
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="btn btn-secondary btn-sm"
                                        >
                                            Pilih File
                                        </button>
                                        <p className="text-[10px] text-[var(--text-muted)]">Hanya file .xlsx yang diterima</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step: Validation */}
                    {step === "validation" && report && (
                        <div className="space-y-4">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 rounded-xl bg-[var(--secondary)] text-center">
                                    <p className="text-2xl font-bold text-[var(--text-primary)]">{report.totalRows}</p>
                                    <p className="text-xs text-[var(--text-muted)]">Total Baris</p>
                                </div>
                                <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-center">
                                    <p className="text-2xl font-bold text-green-600">{report.validRows.length}</p>
                                    <p className="text-xs text-green-600">Valid</p>
                                </div>
                                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-center">
                                    <p className="text-2xl font-bold text-red-600">{report.errors.length}</p>
                                    <p className="text-xs text-red-600">Error</p>
                                </div>
                            </div>

                            {/* Error List */}
                            {report.errors.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
                                        <AlertCircle className="w-4 h-4" /> Detail Error
                                    </h3>
                                    <div className="max-h-60 overflow-y-auto space-y-1.5">
                                        {report.errors.map((err, i) => (
                                            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100 text-xs">
                                                <span className="font-mono font-bold text-red-700 shrink-0 min-w-[55px]">
                                                    Baris {err.row}
                                                </span>
                                                <span className="font-medium text-red-600 shrink-0 min-w-[85px]">{err.field}</span>
                                                <span className="text-red-500">{err.message}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Valid Preview */}
                            {report.validRows.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-green-600 flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4" /> Data Valid ({report.validRows.length} baris)
                                    </h3>
                                    <div className="max-h-40 overflow-y-auto">
                                        <table className="data-table text-xs">
                                            <thead>
                                                <tr>
                                                    <th>ID</th>
                                                    <th>Nama</th>
                                                    <th>Email</th>
                                                    <th>Dept</th>
                                                    <th>Posisi</th>
                                                    <th>Role</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {report.validRows.slice(0, 20).map((row, i) => (
                                                    <tr key={i}>
                                                        <td className="font-mono">{String(row.employeeId ?? "")}</td>
                                                        <td>{String(row.name ?? "")}</td>
                                                        <td>{String(row.email ?? "")}</td>
                                                        <td>{String(row.department ?? "")}</td>
                                                        <td>{String(row.position ?? "")}</td>
                                                        <td>{String(row.role ?? "")}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {report.validRows.length > 20 && (
                                            <p className="text-xs text-[var(--text-muted)] text-center mt-2">
                                                ...dan {report.validRows.length - 20} baris lainnya
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step: Confirm */}
                    {step === "confirm" && report && (
                        <div className="text-center space-y-6 py-6">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 mx-auto flex items-center justify-center">
                                <Users className="w-10 h-10 text-white" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-[var(--text-primary)]">
                                    Import {report.validRows.length} Karyawan?
                                </h3>
                                <p className="text-sm text-[var(--text-muted)] mt-2">
                                    {report.errors.length > 0
                                        ? `${report.errors.length} baris error akan dilewati.`
                                        : "Semua data valid dan siap diimport."
                                    }
                                </p>
                                <p className="text-xs text-[var(--text-muted)] mt-3">
                                    Password default akan diberikan. Gunakan fitur &quot;Kirim Password&quot; setelah import.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Step: Result */}
                    {step === "result" && result && (
                        <div className="text-center space-y-6 py-6">
                            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center
                                ${result.created > 0 ? "bg-gradient-to-br from-green-400 to-emerald-600" : "bg-gradient-to-br from-red-400 to-rose-600"}
                            `}>
                                {result.created > 0 ? (
                                    <CheckCircle2 className="w-10 h-10 text-white" />
                                ) : (
                                    <AlertCircle className="w-10 h-10 text-white" />
                                )}
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-[var(--text-primary)]">
                                    {result.created > 0 ? "Import Berhasil!" : "Import Gagal"}
                                </h3>
                                <p className="text-sm text-[var(--text-muted)] mt-2">
                                    {result.created} karyawan berhasil ditambahkan
                                    {result.failed > 0 ? `, ${result.failed} gagal` : ""}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between bg-[var(--secondary)]/20">
                    <div>
                        {step === "validation" && (
                            <button onClick={() => { reset(); }} className="btn btn-ghost btn-sm gap-1.5">
                                <ArrowLeft className="w-3.5 h-3.5" /> Upload Ulang
                            </button>
                        )}
                        {step === "confirm" && (
                            <button onClick={() => setStep("validation")} className="btn btn-ghost btn-sm gap-1.5">
                                <ArrowLeft className="w-3.5 h-3.5" /> Kembali
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {step !== "result" && (
                            <button onClick={handleClose} className="btn btn-ghost btn-sm">
                                Batal
                            </button>
                        )}

                        {step === "upload" && (
                            <button
                                onClick={handleValidate}
                                disabled={!file || loading}
                                className="btn btn-primary btn-sm gap-1.5"
                            >
                                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                                Validasi Data
                            </button>
                        )}

                        {step === "validation" && report && report.validRows.length > 0 && (
                            <button
                                onClick={() => setStep("confirm")}
                                className="btn btn-primary btn-sm gap-1.5"
                            >
                                <ArrowRight className="w-3.5 h-3.5" /> Lanjut Import
                            </button>
                        )}

                        {step === "confirm" && (
                            <button
                                onClick={handleExecute}
                                disabled={loading}
                                className="btn btn-primary btn-sm gap-1.5"
                            >
                                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                                Import {report?.validRows.length} Karyawan
                            </button>
                        )}

                        {step === "result" && (
                            <button onClick={handleClose} className="btn btn-primary btn-sm">
                                Selesai
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

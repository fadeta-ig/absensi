"use client";

import { useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, Users, X } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

type Step = "upload" | "validation" | "confirm" | "result";
type ImportMode = "create" | "update" | "upsert";
type ImportAction = "CREATE" | "UPDATE" | "UNCHANGED" | "CONFLICT" | "REJECTED";

interface RowError { row: number; field: string; message: string }
interface RowPlan { row: number; action: ImportAction; employeeId: string; name: string; department: string; position: string; changedFields: string[]; issues: RowError[] }
interface MissingReference { type: "division" | "department" | "position"; name: string; parentName?: string | null; affectedRows: number[]; canCreate: boolean }
interface ValidationReport {
    totalRows: number;
    executableRows: number;
    counts: Record<ImportAction, number>;
    rows: RowPlan[];
    errors: RowError[];
    failedRows: number;
    issueCount: number;
    missingReferences: MissingReference[];
}
interface ImportResult { created: number; updated: number; unchanged: number; failedRows: number; issueCount: number; jobId: string }

const ACTION_STYLE: Record<ImportAction, string> = {
    CREATE: "bg-green-100 text-green-700",
    UPDATE: "bg-blue-100 text-blue-700",
    UNCHANGED: "bg-slate-100 text-slate-600",
    CONFLICT: "bg-amber-100 text-amber-700",
    REJECTED: "bg-red-100 text-red-700",
};

export default function BulkImportModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess?: () => void }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<Step>("upload");
    const [file, setFile] = useState<File | null>(null);
    const [importMode, setImportMode] = useState<ImportMode>("create");
    const [allowCreateMaster, setAllowCreateMaster] = useState(false);
    const [report, setReport] = useState<ValidationReport | null>(null);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [dragActive, setDragActive] = useState(false);

    const reset = () => {
        setStep("upload"); setFile(null); setReport(null); setResult(null); setError(""); setAllowCreateMaster(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };
    const handleClose = () => { const succeeded = Boolean(result && (result.created > 0 || result.updated > 0)); reset(); onClose(); if (succeeded) onSuccess?.(); };
    const selectFile = (candidate?: File) => {
        setError("");
        if (!candidate) return;
        if (!candidate.name.toLowerCase().endsWith(".xlsx")) return setError("Hanya file .xlsx yang diterima.");
        if (candidate.size > 10 * 1024 * 1024) return setError("Ukuran file maksimal 10MB.");
        setFile(candidate);
    };

    const requestImport = async (operation: "validate" | "execute") => {
        if (!file) return;
        setLoading(true); setError("");
        try {
            const formData = new FormData();
            formData.set("file", file);
            formData.set("operation", operation);
            formData.set("importMode", importMode);
            formData.set("allowCreateMaster", String(allowCreateMaster));
            const response = await fetch("/api/employees/import", { method: "POST", body: formData });
            if (!response.ok) throw new Error(await getResponseErrorMessage(response, "Proses impor gagal."));
            const data = await response.json();
            if (operation === "validate") { setReport(data); setStep("validation"); }
            else { setResult(data); setStep("result"); }
        } catch (requestError) {
            reportClientError("BulkImportModal", "Proses import karyawan gagal", requestError, { operation, importMode, allowCreateMaster });
            setError(requestError instanceof Error ? requestError.message : "Proses impor gagal.");
        } finally { setLoading(false); }
    };

    const downloadTemplate = async () => {
        setError("");
        try {
            const response = await fetch("/api/employees/import/template");
            if (!response.ok) throw new Error(await getResponseErrorMessage(response, "Template tidak dapat diunduh."));
            const url = URL.createObjectURL(await response.blob());
            const anchor = document.createElement("a"); anchor.href = url; anchor.download = "Template_Import_Karyawan_V2.xlsx"; anchor.click(); URL.revokeObjectURL(url);
        } catch (downloadError) {
            reportClientError("BulkImportModal", "Template import karyawan gagal diunduh", downloadError);
            setError(downloadError instanceof Error ? downloadError.message : "Template tidak dapat diunduh.");
        }
    };

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
                <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600"><FileSpreadsheet className="h-5 w-5 text-white" /></div><div><h2 className="text-lg font-bold">Import Massal Karyawan V2</h2><p className="text-xs text-[var(--text-muted)]">Dry-run, konflik, dan audit sebelum data disimpan</p></div></div><button type="button" className="btn btn-ghost !p-2" onClick={handleClose}><X className="h-5 w-5" /></button></header>
                <div className="border-b border-[var(--border)] bg-[var(--secondary)]/30 px-6 py-3"><div className="flex flex-wrap gap-2 text-xs">{(["upload", "validation", "confirm", "result"] as Step[]).map((item, index) => <span key={item} className={`rounded-full px-3 py-1 font-semibold ${step === item ? "bg-[var(--primary)] text-white" : "bg-[var(--card)] text-[var(--text-muted)]"}`}>{index + 1}. {({ upload: "Upload", validation: "Dry-run", confirm: "Konfirmasi", result: "Hasil" })[item]}</span>)}</div></div>
                <main className="flex-1 overflow-y-auto p-6">
                    {error && <div className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

                    {step === "upload" && <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{([
                            ["create", "Create only", "Hanya membuat NIP baru"], ["update", "Update only", "Hanya memperbarui NIP terdaftar"], ["upsert", "Upsert", "Membuat baru dan memperbarui yang ada"],
                        ] as const).map(([value, label, description]) => <button type="button" key={value} onClick={() => setImportMode(value)} className={`rounded-xl border p-4 text-left ${importMode === value ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}><p className="text-sm font-bold">{label}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p></button>)}</div>
                        <button type="button" onClick={downloadTemplate} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-4 text-left"><Download className="h-5 w-5 text-blue-600" /><div><p className="text-sm font-semibold text-blue-700">Download Template Excel V2</p><p className="text-xs text-blue-500">NIP dan nomor identitas sudah diformat sebagai Text; tersedia sheet panduan.</p></div></button>
                        <div className={`rounded-2xl border-2 border-dashed p-10 text-center ${dragActive ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); selectFile(event.dataTransfer.files[0]); }}>
                            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => selectFile(event.target.files?.[0])} />
                            {file ? <><FileSpreadsheet className="mx-auto h-12 w-12 text-green-500" /><p className="mt-3 font-semibold">{file.name}</p><p className="text-xs text-[var(--text-muted)]">{(file.size / 1024).toFixed(1)} KB</p><button type="button" className="mt-2 text-xs text-red-500" onClick={() => setFile(null)}>Hapus file</button></> : <><Upload className="mx-auto h-12 w-12 text-[var(--text-muted)]" /><p className="mt-3 text-sm">Tarik file Excel ke sini atau</p><button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => fileInputRef.current?.click()}>Pilih File</button><p className="mt-2 text-[10px] text-[var(--text-muted)]">Maksimal 1.000 baris dan 10MB</p></>}
                        </div>
                    </div>}

                    {step === "validation" && report && <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{(["CREATE", "UPDATE", "UNCHANGED", "CONFLICT", "REJECTED"] as ImportAction[]).map((action) => <div key={action} className="rounded-xl border border-[var(--border)] p-3 text-center"><p className="text-2xl font-bold">{report.counts[action]}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${ACTION_STYLE[action]}`}>{action}</span></div>)}</div>
                        {report.missingReferences.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-bold text-amber-800">Master data belum tersedia</p><div className="mt-2 flex flex-wrap gap-2">{report.missingReferences.map((item) => <span key={`${item.type}-${item.name}`} className="rounded bg-white px-2 py-1 text-xs text-amber-700">{item.type}: {item.name}{item.parentName ? ` (${item.parentName})` : ""}</span>)}</div><label className="mt-3 flex items-start gap-2 text-xs text-amber-800"><input type="checkbox" checked={allowCreateMaster} onChange={(event) => setAllowCreateMaster(event.target.checked)} />Izinkan sistem membuat Divisi, Departemen, dan Jabatan yang belum ada. Setelah mengubah pilihan, jalankan validasi ulang.</label><button type="button" className="btn btn-secondary btn-sm mt-3" disabled={loading} onClick={() => requestImport("validate")}>{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Validasi Ulang</button></div>}
                        {report.errors.length > 0 && <div><h3 className="mb-2 text-sm font-semibold text-red-600">{report.failedRows} baris bermasalah · {report.issueCount} isu</h3><div className="max-h-52 space-y-1 overflow-y-auto">{report.errors.slice(0, 200).map((item, index) => <div key={`${item.row}-${item.field}-${index}`} className="grid grid-cols-[70px_130px_1fr] gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700"><b>Baris {item.row}</b><span>{item.field}</span><span>{item.message}</span></div>)}</div></div>}
                        <div><h3 className="mb-2 text-sm font-semibold">Preview rencana ({report.totalRows} baris)</h3><div className="max-h-72 overflow-auto rounded-xl border border-[var(--border)]"><table className="data-table text-xs"><thead><tr><th>Baris</th><th>Aksi</th><th>NIP</th><th>Nama</th><th>Departemen</th><th>Jabatan</th><th>Perubahan</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.row}><td>{row.row}</td><td><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ACTION_STYLE[row.action]}`}>{row.action}</span></td><td className="font-mono">{row.employeeId}</td><td>{row.name}</td><td>{row.department}</td><td>{row.position}</td><td className="max-w-48 truncate">{row.changedFields.join(", ") || "-"}</td></tr>)}</tbody></table></div></div>
                    </div>}

                    {step === "confirm" && report && <div className="py-10 text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-600"><Users className="h-10 w-10 text-white" /></div><h3 className="mt-5 text-xl font-bold">Eksekusi {report.executableRows} perubahan?</h3><p className="mx-auto mt-2 max-w-xl text-sm text-[var(--text-muted)]">{report.counts.CREATE} karyawan dibuat, {report.counts.UPDATE} diperbarui, dan {report.counts.UNCHANGED} tidak berubah. Baris konflik/ditolak tidak akan disimpan. Proses ini dicatat dalam audit job.</p>{allowCreateMaster && <p className="mt-3 text-xs font-semibold text-amber-700">Master data yang belum tersedia akan dibuat dalam transaksi yang sama.</p>}</div>}

                    {step === "result" && result && <div className="py-8 text-center"><CheckCircle2 className="mx-auto h-20 w-20 text-green-500" /><h3 className="mt-4 text-xl font-bold">Import selesai</h3><div className="mx-auto mt-5 grid max-w-lg grid-cols-3 gap-3"><ResultCard label="Dibuat" value={result.created} /><ResultCard label="Diperbarui" value={result.updated} /><ResultCard label="Tidak berubah" value={result.unchanged} /></div><p className="mt-4 text-xs text-[var(--text-muted)]">Job ID: <span className="font-mono">{result.jobId}</span>{result.failedRows > 0 ? ` · ${result.failedRows} baris dilewati` : ""}</p></div>}
                </main>

                <footer className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--secondary)]/20 px-6 py-4"><div>{step === "validation" && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}><ArrowLeft className="h-3.5 w-3.5" /> Upload Ulang</button>}{step === "confirm" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep("validation")}><ArrowLeft className="h-3.5 w-3.5" /> Kembali</button>}</div><div className="flex gap-2">{step !== "result" && <button type="button" className="btn btn-ghost btn-sm" onClick={handleClose}>Batal</button>}{step === "upload" && <button type="button" className="btn btn-primary btn-sm" disabled={!file || loading} onClick={() => requestImport("validate")}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />} Dry-run</button>}{step === "validation" && report && report.executableRows > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep("confirm")}><ArrowRight className="h-3.5 w-3.5" /> Lanjut</button>}{step === "confirm" && <button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={() => requestImport("execute")}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />} Eksekusi</button>}{step === "result" && <button type="button" className="btn btn-primary btn-sm" onClick={handleClose}>Selesai</button>}</div></footer>
            </div>
        </div>
    );
}

function ResultCard({ label, value }: { label: string; value: number }) {
    return <div className="rounded-xl border border-[var(--border)] p-3"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-[var(--text-muted)]">{label}</p></div>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, ShieldAlert, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/Toast";

interface EmployeeDocument {
    id: string;
    type: string;
    title: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    expiresAt?: string | null;
    notes?: string | null;
    createdAt: string;
    downloadUrl: string;
}

const DOCUMENT_TYPES = [
    ["KTP", "KTP"], ["KARTU_KELUARGA", "Kartu Keluarga"], ["BPJS_KES", "BPJS Kesehatan/JKN"],
    ["BPJS_TK", "BPJS Ketenagakerjaan/KPJ"], ["NPWP", "NPWP"], ["IJAZAH", "Ijazah"],
    ["KONTRAK", "Kontrak"], ["OTHER", "Lainnya"],
] as const;

export function EmployeeDocumentManager({ employeeDatabaseId, employeeIsActive }: { employeeDatabaseId: string; employeeIsActive: boolean }) {
    const toast = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [type, setType] = useState("KTP");
    const [title, setTitle] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [notes, setNotes] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/employees/${employeeDatabaseId}/documents`, { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Gagal memuat dokumen.");
            setDocuments(Array.isArray(data.documents) ? data.documents : []);
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal memuat dokumen.", "error");
        } finally {
            setLoading(false);
        }
    }, [employeeDatabaseId, toast]);

    useEffect(() => { void load(); }, [load]);

    const uploadDocument = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file || !title.trim()) {
            toast("Pilih file dan isi judul dokumen.", "warning");
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.set("file", file);
            formData.set("type", type);
            formData.set("title", title.trim());
            if (expiresAt) formData.set("expiresAt", expiresAt);
            if (notes.trim()) formData.set("notes", notes.trim());
            const response = await fetch(`/api/employees/${employeeDatabaseId}/documents`, { method: "POST", body: formData });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Gagal mengunggah dokumen.");
            toast("Dokumen berhasil diunggah.", "success");
            setTitle(""); setExpiresAt(""); setNotes("");
            if (fileRef.current) fileRef.current.value = "";
            await load();
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal mengunggah dokumen.", "error");
        } finally {
            setUploading(false);
        }
    };

    const deleteDocument = async (document: EmployeeDocument) => {
        if (!window.confirm(`Hapus dokumen "${document.title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
        setDeletingId(document.id);
        try {
            const response = await fetch(`/api/employees/${employeeDatabaseId}/documents/${document.id}`, { method: "DELETE" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Gagal menghapus dokumen.");
            setDocuments((current) => current.filter((item) => item.id !== document.id));
            toast("Dokumen berhasil dihapus.", "success");
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal menghapus dokumen.", "error");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
                <div><h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"><FileText className="h-4 w-4 text-[var(--primary)]" /> Dokumen Karyawan</h2><p className="mt-1 text-xs text-[var(--text-muted)]">File disimpan privat dan hanya dapat diunduh oleh HR.</p></div>
                <span className="badge badge-info">{documents.length} dokumen</span>
            </div>

            {!employeeIsActive ? (
                <div className="flex items-start gap-3 bg-amber-50 p-5 text-sm text-amber-800"><ShieldAlert className="h-5 w-5 shrink-0" /><div><p className="font-semibold">Upload belum tersedia</p><p className="text-xs">Aktifkan karyawan terlebih dahulu. Dokumen yang sudah ada tetap dapat dilihat oleh HR.</p></div></div>
            ) : (
                <div className="grid grid-cols-1 gap-4 border-b border-[var(--border)] bg-[var(--secondary)]/20 p-5 lg:grid-cols-4">
                    <div><label className="form-label">Jenis</label><select className="form-select" value={type} onChange={(event) => setType(event.target.value)}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                    <div><label className="form-label">Judul</label><input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: KTP terbaru" maxLength={191} /></div>
                    <div><label className="form-label">Kedaluwarsa</label><input type="date" className="form-input" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
                    <div><label className="form-label">File (maks. 10MB)</label><input ref={fileRef} type="file" className="form-input text-xs" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" /></div>
                    <div className="lg:col-span-3"><label className="form-label">Catatan</label><input className="form-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opsional" /></div>
                    <div className="flex items-end"><button type="button" className="btn btn-primary w-full" disabled={uploading} onClick={uploadDocument}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Unggah</button></div>
                </div>
            )}

            <div className="divide-y divide-[var(--border)]">
                {loading ? <div className="p-10 text-center text-sm text-[var(--text-muted)]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Memuat dokumen...</div>
                    : documents.length === 0 ? <div className="p-10 text-center text-sm text-[var(--text-muted)]">Belum ada dokumen.</div>
                    : documents.map((document) => (
                        <div key={document.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0"><div className="flex items-center gap-2"><span className="badge badge-info">{DOCUMENT_TYPES.find(([value]) => value === document.type)?.[1] ?? document.type}</span><p className="truncate font-semibold text-[var(--text-primary)]">{document.title}</p></div><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{document.originalName} · {(document.fileSize / 1024).toFixed(1)} KB · {new Date(document.createdAt).toLocaleDateString("id-ID")}{document.expiresAt ? ` · berlaku sampai ${new Date(document.expiresAt).toLocaleDateString("id-ID")}` : ""}</p></div>
                            <div className="flex shrink-0 gap-2"><a className="btn btn-secondary btn-sm" href={document.downloadUrl}><Download className="h-3.5 w-3.5" /> Unduh</a><button type="button" className="btn btn-ghost btn-sm text-red-600" disabled={deletingId === document.id} onClick={() => deleteDocument(document)}>{deletingId === document.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Hapus</button></div>
                        </div>
                    ))}
            </div>
        </section>
    );
}

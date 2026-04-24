"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, UploadCloud, FileSpreadsheet, CheckCircle, AlertCircle, Trash2, Send } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { generateBulkImportTemplate } from "@/lib/utils/excelTemplateGenerator";

type ParsedRow = {
    [key: string]: string;
};

type BulkPayload = {
    categoryPrefix: string;
    name: string;
    kondisi: string;
    manufacturer: string;
    modelName: string;
    serialNumber: string;
    keterangan: string;
};

const REQUIRED_HEADERS = ["Prefix Kategori", "Nama Aset", "Kondisi"];

export default function BulkImportPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<BulkPayload[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    
    const [isParsing, setIsParsing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successCount, setSuccessCount] = useState<number | null>(null);

    // Kategori lookup cache client-side untuk validasi prefix
    const [validPrefixes, setValidPrefixes] = useState<Set<string>>(new Set());
    const [categoryList, setCategoryList] = useState<{ prefix: string; name: string }[]>([]);

    useEffect(() => {
        fetch("/api/assets/categories")
            .then(r => r.ok ? r.json() : [])
            .then((data: { prefix: string; name: string }[]) => {
                setCategoryList(data);
                const prefixes = new Set(data.map(c => c.prefix.toUpperCase()));
                setValidPrefixes(prefixes);
            })
            .catch(() => {});
    }, []);

    const downloadTemplate = async () => {
        await generateBulkImportTemplate(categoryList);
    };

    // Parse either CSV or XLSX files
    const processFile = (f: File) => {
        const isXlsx = f.name.endsWith(".xlsx") || f.name.endsWith(".xls");
        if (isXlsx) {
            processXLSX(f);
        } else {
            processCSV(f);
        }
    };

    const processXLSX = (file: File) => {
        setIsParsing(true);
        setErrors([]);
        setParsedData([]);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target!.result as ArrayBuffer);
                const wb = XLSX.read(data, { type: "array" });
                const wsName = wb.SheetNames[0];
                const ws = wb.Sheets[wsName];
                const rawRows = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: "" });
                validateAndSetRows(rawRows, file);
            } catch {
                setErrors(["Gagal membaca file Excel. Pastikan format valid."]);
                setIsParsing(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const processCSV = (file: File) => {
        setIsParsing(true);
        setErrors([]);
        setParsedData([]);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                validateAndSetRows(results.data as ParsedRow[], file);
            },
            error: (error) => {
                setErrors([`Gagal membaca file: ${error.message}`]);
                setIsParsing(false);
            }
        });
    };

    const validateAndSetRows = (rows: ParsedRow[], f: File) => {
        let currentErrors: string[] = [];

        const payloads: BulkPayload[] = [];

        // Detect column names — support both styled xlsx ("Prefix Kategori *") and plain csv header
        const firstRow = rows[0] || {};
        const prefixKey = Object.keys(firstRow).find(k => k.toLowerCase().includes("prefix")) || "Prefix Kategori";
        const nameKey = Object.keys(firstRow).find(k => k.toLowerCase().includes("nama")) || "Nama Aset";
        const kondisiKey = Object.keys(firstRow).find(k => k.toLowerCase().includes("kondisi")) || "Kondisi";
        const mfgKey = Object.keys(firstRow).find(k => k.toLowerCase().includes("manufak") || k.toLowerCase().includes("brand")) || "Manufaktur";
        const modelKey = Object.keys(firstRow).find(k => k.toLowerCase().includes("model")) || "Model";
        const snKey = Object.keys(firstRow).find(k => k.toLowerCase().includes("serial")) || "Serial Number";
        const noteKey = Object.keys(firstRow).find(k => k.toLowerCase().includes("keterangan") || k.toLowerCase().includes("catatan")) || "Keterangan";

        rows.forEach((row, index) => {
            const rowNum = index + 2;
            const prefix = (String(row[prefixKey] || "")).trim().toUpperCase();
            const name = (String(row[nameKey] || "")).trim();
            const kondisiRaw = (String(row[kondisiKey] || "")).trim().toUpperCase();

            // Skip fully-empty rows
            if (!prefix && !name) return;

            if (!prefix) currentErrors.push(`Baris ${rowNum}: Prefix Kategori kosong`);
            else if (validPrefixes.size === 0) {
                currentErrors.push(`Sistem gagal memuat daftar kategori. Harap segarkan halaman.`);
            } else if (!validPrefixes.has(prefix)) {
                currentErrors.push(`Baris ${rowNum}: Prefix "${prefix}" tidak dikenali. Cek Sheet Panduan untuk daftar prefix valid.`);
            }

            if (!name) currentErrors.push(`Baris ${rowNum}: Nama Aset kosong`);

            let kondisi = "BAIK";
            if (kondisiRaw.includes("KURANG")) kondisi = "KURANG_BAIK";
            if (kondisiRaw.includes("RUSAK")) kondisi = "RUSAK";

            payloads.push({
                categoryPrefix: prefix,
                name,
                kondisi,
                manufacturer: (String(row[mfgKey] || "")).trim(),
                modelName: (String(row[modelKey] || "")).trim(),
                serialNumber: (String(row[snKey] || "")).trim(),
                keterangan: (String(row[noteKey] || "")).trim(),
            });
        });

        if (payloads.length === 0 && currentErrors.length === 0) {
            currentErrors.push("File tidak mengandung data aset yang valid.");
        }

        if (payloads.length > 300) {
            currentErrors.push("Melebihi batas 300 baris per import.");
        }

        setErrors(currentErrors);
        if (currentErrors.length === 0) setParsedData(payloads);
        setFile(f);
        setIsParsing(false);
    };

    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        const isValid = f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx") || f.name.endsWith(".xls"));
        if (isValid) {
            processFile(f);
        } else {
            setErrors(["Hanya menerima file berformat CSV (.csv) atau Excel (.xlsx)."]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) processFile(f);
    };

    const clearAll = () => {
        setFile(null);
        setParsedData([]);
        setErrors([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = async () => {
        if (parsedData.length === 0) return;
        setIsSubmitting(true);
        setErrors([]);

        try {
            const res = await fetch("/api/assets/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsedData)
            });

            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Gagal melakukan import server.");
            
            setSuccessCount(data.count);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err: unknown) {
            setErrors([err instanceof Error ? err.message : "Terjadi kesalahan yang tidak diketahui."]);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (successCount !== null) {
        return (
            <div className="p-6 max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[70vh] animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 border-4 border-emerald-50">
                    <CheckCircle className="text-emerald-600" size={40} />
                </div>
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight text-center">Registrasi Massal Berhasil!</h1>
                <p className="text-slate-500 mt-2 text-center text-lg">{successCount} aset telah diamankan langsung ke dalam GA Pool.</p>
                <div className="mt-8 flex gap-4">
                    <button onClick={() => router.push("/ga/assets")} className="px-6 py-3 bg-slate-800 text-white font-semibold rounded-xl shadow-md hover:bg-slate-700 transition">Lihat Tabel Aset</button>
                    <button onClick={() => {setSuccessCount(null); clearAll();}} className="px-6 py-3 bg-white text-slate-700 font-semibold border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition">Import Lagi</button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-2 border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Import Aset Massal</h1>
                        <p className="text-sm text-slate-500 mt-1">Registrasikan puluhan aset ke GA Pool secara otomatis via CSV.</p>
                    </div>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors">
                    <FileSpreadsheet size={16} /> Unduh Template (.xlsx)
                </button>
            </div>

            {/* Error Alerts */}
            {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-red-700 font-bold mb-3"><AlertCircle size={18} /> Ditemukan Kesalahan Validasi</div>
                    <ul className="list-disc pl-5 text-sm text-red-600 space-y-1">
                        {errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                    <button onClick={clearAll} className="mt-4 px-4 py-1.5 bg-red-100 text-red-700 rounded-md text-xs font-semibold hover:bg-red-200">Ulangi Import</button>
                </div>
            )}

            {/* Upload Zone */}
            {!file && errors.length === 0 && (
                <div 
                    onDragOver={e => e.preventDefault()} 
                    onDrop={handleFileDrop}
                    className="border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 flex flex-col items-center justify-center p-12 hover:bg-slate-100 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <UploadCloud size={48} className="text-indigo-400 mb-4" />
                    <h3 className="text-lg font-bold text-slate-700">Tarik &amp; Lepas File di Sini</h3>
                    <p className="text-sm text-slate-500 mt-2 mb-1">Menerima format <span className="font-semibold text-slate-700">.xlsx</span> (direkomendasikan) atau <span className="font-semibold text-slate-700">.csv</span></p>
                    <p className="text-xs text-slate-400 mb-6">Maksimal 300 baris aset dalam 1 kali import.</p>
                    <div className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg shadow-sm">Pilih File dari Komputer</div>
                    <input type="file" accept=".csv,.xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                </div>
            )}

            {/* State: Parsing */}
            {isParsing && (
                <div className="flex flex-col items-center py-12">
                    <div className="spinner mb-4" />
                    <p className="text-slate-500 font-medium">Membaca dan memvalidasi struktur file...</p>
                </div>
            )}

            {/* Preview Tabel */}
            {!isParsing && parsedData.length > 0 && (
                <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-[15px] font-semibold text-slate-800">Review Data Aset ({parsedData.length} Baris Valid)</h2>
                            <button onClick={clearAll} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Batalkan & Ganti File">
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <div className="overflow-x-auto max-h-[500px]">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50 border-b text-slate-500 text-xs uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-5 py-3 font-semibold">Tanda #</th>
                                        <th className="px-5 py-3 font-semibold">Kategori</th>
                                        <th className="px-5 py-3 font-semibold">Nama Aset</th>
                                        <th className="px-5 py-3 font-semibold">S/N</th>
                                        <th className="px-5 py-3 font-semibold">Kondisi</th>
                                        <th className="px-5 py-3 font-semibold">Status Masa Depan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {parsedData.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-5 py-3 text-slate-400 text-xs font-mono">{idx + 1}</td>
                                            <td className="px-5 py-3"><span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">{row.categoryPrefix}</span></td>
                                            <td className="px-5 py-3 font-medium text-slate-800">{row.name}</td>
                                            <td className="px-5 py-3 text-xs font-mono text-slate-500">{row.serialNumber || "-"}</td>
                                            <td className="px-5 py-3"><span className="text-[10px] font-black tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">{row.kondisi}</span></td>
                                            <td className="px-5 py-3 text-xs text-slate-600 font-semibold italic">→ GA Pool (AVAILABLE)</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-5 border-t bg-slate-50 flex items-center justify-between">
                            <div className="text-sm text-slate-600">File: <span className="font-semibold">{file?.name}</span></div>
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="px-6 py-2.5 bg-slate-800 text-white font-semibold rounded-lg shadow-sm hover:bg-slate-700 transition flex items-center gap-2 disabled:opacity-50"
                            >
                                <Send size={16} />
                                {isSubmitting ? "Menginjeksi Database..." : "Jalankan Registrasi Massal"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

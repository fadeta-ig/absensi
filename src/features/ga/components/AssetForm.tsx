"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { AssetCategory } from "@/lib/types/asset";

export type AssetFormData = {
    name: string;
    categoryId: string;
    kondisi: string;
    status?: string; // Edit only
    holderType: string;
    assignedToId: string;
    assignedToName: string;
    serialNumber: string;
    imei: string;
    manufacturer: string;
    modelName: string;
    purchaseDate: string;
    purchasePrice: string;
    warrantyExpiry: string;
    keterangan: string;
};

type AssetFormProps = {
    mode: "create" | "edit";
    initialData?: Partial<AssetFormData>;
    onSubmit: (data: AssetFormData) => Promise<void>;
    saving: boolean;
};

export default function AssetForm({ mode, initialData, onSubmit, saving }: AssetFormProps) {
    const router = useRouter();
    const [categories, setCategories] = useState<AssetCategory[]>([]);
    const [employees, setEmployees] = useState<{ employeeId: string; name: string }[]>([]);
    const [loadingParams, setLoadingParams] = useState(true);

    const [formData, setFormData] = useState<AssetFormData>({
        name: initialData?.name || "",
        categoryId: initialData?.categoryId || "",
        kondisi: initialData?.kondisi || "BAIK",
        status: initialData?.status || "AVAILABLE",
        holderType: initialData?.holderType || "GA_POOL",
        assignedToId: initialData?.assignedToId || "",
        assignedToName: initialData?.assignedToName || "",
        serialNumber: initialData?.serialNumber || "",
        imei: initialData?.imei || "",
        manufacturer: initialData?.manufacturer || "",
        modelName: initialData?.modelName || "",
        purchaseDate: initialData?.purchaseDate || "",
        purchasePrice: initialData?.purchasePrice || "",
        warrantyExpiry: initialData?.warrantyExpiry || "",
        keterangan: initialData?.keterangan || "",
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [catRes, empRes] = await Promise.all([
                    fetch("/api/assets/categories"),
                    fetch("/api/employees?limit=1000")
                ]);

                if (catRes.ok) {
                    const data = await catRes.json();
                    setCategories(data);
                    if (data.length > 0 && mode === "create" && !initialData?.categoryId) {
                        setFormData(prev => ({ ...prev, categoryId: data[0].id }));
                    }
                }

                if (empRes.ok) {
                    const empData = await empRes.json();
                    const list = Array.isArray(empData) ? empData : empData.data || [];
                    setEmployees(list);
                }
            } catch (err) {
                console.error("Gagal load data form", err);
            } finally {
                setLoadingParams(false);
            }
        };
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleHolderTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        const updates: Partial<AssetFormData> = { 
            holderType: value, 
            assignedToId: "", 
            assignedToName: "" 
        };
        
        if (mode === "edit") {
            if (value === "GA_POOL") updates.status = "AVAILABLE";
            else if (value === "COMPANY_OWNED") updates.status = "COMPANY_OWNED";
            else updates.status = "IN_USE";
        }

        setFormData(prev => ({ ...prev, ...updates }));
    };

    const handleEmployeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const empId = e.target.value;
        const emp = employees.find(em => em.employeeId === empId);
        setFormData(prev => ({ 
            ...prev, 
            assignedToId: empId,
            assignedToName: emp ? emp.name : ""
        }));
    };


    if (loadingParams) return <div className="p-6 text-sm text-slate-500">Memuat konfigurasi form...</div>;

    return (
        <form onSubmit={e => { e.preventDefault(); onSubmit(formData); }} className="bg-white border rounded-xl shadow-sm overflow-hidden animate-in fade-in">
            <div className="p-6 border-b bg-slate-50/50">
                <h2 className="text-md font-semibold text-slate-800">Identifikasi Utama</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Aset</label>
                    <input type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="Contoh: MacBook Pro M2, iPhone 13..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Kategori</label>
                    <select name="categoryId" required value={formData.categoryId} onChange={handleChange} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none">
                        <option value="" disabled>Pilih Kategori</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Kondisi {mode === "edit" ? "& Status" : "Awal"}</label>
                    <div className="flex gap-2">
                        <select name="kondisi" value={formData.kondisi} onChange={handleChange} className={`${mode === "edit" ? "w-1/2" : "w-full"} px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none`}>
                            <option value="BAIK">Baik</option>
                            <option value="KURANG_BAIK">Kurang Baik</option>
                            <option value="RUSAK">Rusak</option>
                        </select>
                        {mode === "edit" && (
                            <select name="status" value={formData.status} onChange={handleChange} className="w-1/2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none">
                                <option value="AVAILABLE">Tersedia</option>
                                <option value="IN_USE">Digunakan</option>
                                <option value="MAINTENANCE">Maintenance</option>
                                <option value="RETIRED">Retired</option>
                            </select>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-6 border-y bg-slate-50/50">
                <h2 className="text-md font-semibold text-slate-800">Spesifikasi Perangkat</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Manufaktur (Brand)</label>
                    <input type="text" name="manufacturer" value={formData.manufacturer} onChange={handleChange} placeholder="Contoh: Apple, Lenovo" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Model Spesifik</label>
                    <input type="text" name="modelName" value={formData.modelName} onChange={handleChange} placeholder="Contoh: ThinkPad E14 Gen 4" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Serial Number (S/N)</label>
                    <input type="text" name="serialNumber" value={formData.serialNumber} onChange={handleChange} className="w-full font-mono uppercase px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">IMEI (Opsional)</label>
                    <input type="text" name="imei" value={formData.imei} onChange={e => setFormData(p => ({...p, imei: e.target.value.replace(/[^0-9]/g, '')}))} maxLength={15} placeholder="15 Digit Angka" className="w-full font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
            </div>



            <div className="p-6 border-y bg-slate-50/50">
                <h2 className="text-md font-semibold text-slate-800">Status & Penyerahan</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tujuan Penyerahan</label>
                    <select value={formData.holderType} onChange={handleHolderTypeChange} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none">
                        <option value="GA_POOL">Registrasi ke GA Pool (Tersedia)</option>
                        <option value="EMPLOYEE">Karyawan Aktif (Terintegrasi HR)</option>
                        <option value="TEAM">Tim / Divisi / Project</option>
                        <option value="FORMER_EMPLOYEE">Mantan Karyawan</option>
                        {mode === "edit" && <option value="COMPANY_OWNED">Asset Perusahaan (Private)</option>}
                    </select>
                </div>

                {formData.holderType === "EMPLOYEE" && (
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Pilih Karyawan</label>
                        <select required name="assignedToId" value={formData.assignedToId} onChange={handleEmployeeChange} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none">
                            <option value="" disabled>-- Pilih Karyawan --</option>
                            {employees.map(emp => (
                                <option key={emp.employeeId} value={emp.employeeId}>{emp.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {(formData.holderType === "TEAM" || formData.holderType === "FORMER_EMPLOYEE") && (
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Pemegang</label>
                        <input type="text" name="assignedToName" required value={formData.assignedToName} onChange={handleChange} placeholder="Contoh: Tim Creative, Budi (Resign)" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                    </div>
                )}
            </div>

            <div className="p-6 border-y bg-slate-50/50">
                <h2 className="text-md font-semibold text-slate-800">Informasi Finansial & Garansi</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tanggal Pembelian</label>
                    <input type="date" name="purchaseDate" value={formData.purchaseDate} onChange={handleChange} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Harga Beli (Rp)</label>
                    <input type="number" step="0.01" name="purchasePrice" value={formData.purchasePrice} onChange={handleChange} placeholder="0" className="w-full font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Batas Garansi (Opsional)</label>
                    <input type="date" name="warrantyExpiry" value={formData.warrantyExpiry} onChange={handleChange} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Catatan Ekstra</label>
                    <textarea name="keterangan" rows={3} value={formData.keterangan} onChange={handleChange} placeholder="Informasi tambahan..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
            </div>

            <div className="p-6 border-t bg-slate-100/50 flex justify-end gap-3">
                <button type="button" onClick={() => router.back()} className="px-5 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">Batalkan</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 bg-slate-800 rounded-lg text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2">
                    <Save size={16} /> {saving ? "Menyimpan..." : mode === "create" ? "Simpan Aset" : "Simpan Perubahan"}
                </button>
            </div>
        </form>
    );
}

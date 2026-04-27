"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

// Tipe data yang akan ditangkap oleh SimCardForm
export type SimCardFormData = {
    name: string; // Misal: Telkomsel Pascabayar
    nomorIndosat: string;
    expiredDate: string;
    holderType: string;
    assignedToId: string;
    assignedToName: string;
    keterangan: string;
    // Disembunyikan di UI tapi dikirim ke API
    status: string; // IN_USE / AVAILABLE / RETIRED
    kondisi: string; // Selalu BAIK
    categoryId: string; 
};

type SimCardFormProps = {
    mode: "create" | "edit";
    initialData?: Partial<SimCardFormData>;
    onSubmit: (data: SimCardFormData) => Promise<void>;
    saving: boolean;
};

export default function SimCardForm({ mode, initialData, onSubmit, saving }: SimCardFormProps) {
    const router = useRouter();
    const [employees, setEmployees] = useState<{ employeeId: string; name: string }[]>([]);
    const [loadingParams, setLoadingParams] = useState(true);
    const [simCategoryId, setSimCategoryId] = useState("");
    
    // Status visual form ("Aktif" atau "Tidak Aktif")
    const [isActiveStatus, setIsActiveStatus] = useState<boolean>(initialData?.status !== "RETIRED");

    const [formData, setFormData] = useState<Omit<SimCardFormData, "status" | "kondisi" | "categoryId">>({
        name: initialData?.name || "",
        nomorIndosat: initialData?.nomorIndosat || "",
        expiredDate: initialData?.expiredDate ? initialData.expiredDate.split('T')[0] : "",
        holderType: initialData?.holderType || "GA_POOL",
        assignedToId: initialData?.assignedToId || "",
        assignedToName: initialData?.assignedToName || "",
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
                    const numCat = data.find((c: any) => c.prefix === "NUM");
                    if (numCat) setSimCategoryId(numCat.id);
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
        setFormData(prev => ({ 
            ...prev, 
            holderType: value, 
            assignedToId: "", 
            assignedToName: "" 
        }));
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Pemetaan status:
        // Jika isActiveStatus = false -> RETIRED
        // Jika isActiveStatus = true & holderType = GA_POOL -> AVAILABLE
        // Jika isActiveStatus = true & holderType != GA_POOL -> IN_USE
        let finalStatus = "AVAILABLE";
        if (!isActiveStatus) {
            finalStatus = "RETIRED";
        } else {
            if (formData.holderType === "COMPANY_OWNED") finalStatus = "COMPANY_OWNED";
            else if (formData.holderType !== "GA_POOL") finalStatus = "IN_USE";
        }

        const payload: SimCardFormData = {
            ...formData,
            status: finalStatus,
            kondisi: "BAIK",
            categoryId: simCategoryId,
        };

        onSubmit(payload);
    };

    if (loadingParams) return <div className="p-6 text-sm text-slate-500">Memuat konfigurasi form...</div>;
    if (!simCategoryId && mode === "create") return <div className="p-6 text-sm text-red-500 font-bold">Kategori 'NUM' tidak ditemukan di database.</div>;

    return (
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl shadow-sm overflow-hidden animate-in fade-in">
            <div className="p-6 border-b bg-slate-50/50">
                <h2 className="text-md font-semibold text-slate-800">Detail Kartu SIM</h2>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Kartu / Provider</label>
                    <input type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="Contoh: Kartu Halo, Indosat Ooredoo" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nomor Telepon</label>
                    <input type="text" name="nomorIndosat" required value={formData.nomorIndosat} onChange={handleChange} placeholder="Misal: 081234567890" className="w-full font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Masa Aktif Terakhir / Valid Until</label>
                    <input type="date" name="expiredDate" value={formData.expiredDate} onChange={handleChange} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Status Kartu SIM</label>
                    <select 
                        value={isActiveStatus ? "AKTIF" : "TIDAK_AKTIF"} 
                        onChange={e => setIsActiveStatus(e.target.value === "AKTIF")} 
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none font-semibold"
                        style={{ color: isActiveStatus ? "#047857" : "#b91c1c" }} 
                    >
                        <option value="AKTIF" className="text-emerald-700">🟢 Aktif (Bisa Digunakan)</option>
                        <option value="TIDAK_AKTIF" className="text-red-700">🔴 Tidak Aktif (Mati / Hangus)</option>
                    </select>
                </div>
            </div>

            {isActiveStatus && (
                <>
                    <div className="p-6 border-y bg-slate-50/50">
                        <h2 className="text-md font-semibold text-slate-800">Alokasi & Pemegang</h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tujuan Penyerahan</label>
                            <select value={formData.holderType} onChange={handleHolderTypeChange} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none">
                                <option value="GA_POOL">Tersedia di GA (Belum Diassign)</option>
                                <option value="EMPLOYEE">Karyawan Aktif (Terintegrasi HR)</option>
                                <option value="TEAM">Tim / Divisi / Project</option>
                                <option value="FORMER_EMPLOYEE">Mantan Karyawan</option>
                                {mode === "edit" && <option value="COMPANY_OWNED">Milik Perusahaan (Private)</option>}
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
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nama Pemegang / Tim</label>
                                <input type="text" name="assignedToName" required value={formData.assignedToName} onChange={handleChange} placeholder="Contoh: Tim Creative, Budi (Resign)" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                            </div>
                        )}
                    </div>
                </>
            )}

            <div className="p-6 border-y bg-slate-50/50">
                <h2 className="text-md font-semibold text-slate-800">Catatan Administratif</h2>
            </div>
            <div className="p-6">
                <textarea name="keterangan" rows={3} value={formData.keterangan} onChange={handleChange} placeholder="Informasi tambahan mengenai paket data, dll..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
            </div>

            <div className="p-6 border-t bg-slate-100/50 flex justify-end gap-3 rounded-b-xl">
                <button type="button" onClick={() => router.back()} className="px-5 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">Batalkan</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 bg-slate-800 rounded-lg text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2">
                    <Save size={16} /> {saving ? "Menyimpan..." : mode === "create" ? "Simpan Kartu" : "Simpan Perubahan"}
                </button>
            </div>
        </form>
    );
}

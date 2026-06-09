"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

export type SimCardFormData = {
    provider: string; // Misal: Telkomsel Pascabayar
    phoneNumber: string;
    expiredDate: string;
    assignedToId: string;
    notes: string;
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
    const [formData, setFormData] = useState<SimCardFormData>({
        provider: initialData?.provider || "",
        phoneNumber: initialData?.phoneNumber || "",
        expiredDate: initialData?.expiredDate ? initialData.expiredDate.split('T')[0] : "",
        assignedToId: initialData?.assignedToId || "",
        notes: initialData?.notes || "",
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [empRes] = await Promise.all([
                    fetch("/api/employees?limit=1000")
                ]);

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

    const handleEmployeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const empId = e.target.value;
        setFormData(prev => ({ 
            ...prev, 
            assignedToId: empId,
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    if (loadingParams) return <div className="p-6 text-sm text-[var(--text-secondary)]">Memuat konfigurasi form...</div>;

    return (
        <form onSubmit={handleSubmit} className="bg-[var(--card)] border rounded-xl shadow-sm overflow-hidden animate-in fade-in">
            <div className="p-6 border-b bg-[var(--secondary)]/50">
                <h2 className="text-md font-semibold text-[var(--text-primary)]">Detail Kartu SIM</h2>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Nama Provider</label>
                    <input type="text" name="provider" required value={formData.provider} onChange={handleChange} placeholder="Contoh: Indosat Ooredoo" className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Nomor Telepon</label>
                    <input type="text" name="phoneNumber" required value={formData.phoneNumber} onChange={handleChange} placeholder="Misal: 081234567890" className="w-full font-mono px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" />
                </div>
                
                <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Masa Aktif Terakhir / Valid Until</label>
                    <input type="date" name="expiredDate" value={formData.expiredDate} onChange={handleChange} className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" />
                </div>
            </div>

            <div className="p-6 border-y bg-[var(--secondary)]/50">
                <h2 className="text-md font-semibold text-[var(--text-primary)]">Alokasi & Pemegang</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Pilih Karyawan</label>
                    <select name="assignedToId" value={formData.assignedToId} onChange={handleEmployeeChange} className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] appearance-none">
                        <option value="">-- Tidak Ada / Tersedia --</option>
                        {employees.map(emp => (
                            <option key={emp.employeeId} value={emp.employeeId}>{emp.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="p-6 border-y bg-[var(--secondary)]/50">
                <h2 className="text-md font-semibold text-[var(--text-primary)]">Catatan Administratif</h2>
            </div>
            <div className="p-6">
                <textarea name="notes" rows={3} value={formData.notes} onChange={handleChange} placeholder="Informasi tambahan mengenai paket data, dll..." className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]" />
            </div>

            <div className="p-6 border-t bg-[var(--secondary)]/50 flex justify-end gap-3 rounded-b-xl">
                <button type="button" onClick={() => router.back()} className="px-5 py-2.5 border border-[var(--border)] bg-[var(--card)] rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--secondary)]">Batalkan</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-semibold text-white hover:bg-[var(--primary-light)] disabled:opacity-50 flex items-center gap-2">
                    <Save size={16} /> {saving ? "Menyimpan..." : mode === "create" ? "Simpan Kartu" : "Simpan Perubahan"}
                </button>
            </div>
        </form>
    );
}

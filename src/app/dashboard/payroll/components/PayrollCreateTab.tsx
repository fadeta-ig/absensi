import { AlertCircle, CheckCircle2, Loader2, Send, Plus, Trash2 } from "lucide-react";
import { Employee, AllowanceItem } from "../types";

export interface PayrollCreateTabProps {
    success: string;
    error: string;
    setTab: (tab: "recap" | "history") => void;
    handleSubmit: (e: React.FormEvent) => void;
    form: { employeeId: string; period: string; basicSalary: number; overtime: number; notes: string };
    setForm: React.Dispatch<React.SetStateAction<{ employeeId: string; period: string; basicSalary: number; overtime: number; notes: string }>>;
    employees: Employee[];
    allowances: AllowanceItem[];
    setAllowances: React.Dispatch<React.SetStateAction<AllowanceItem[]>>;
    deductions: AllowanceItem[];
    setDeductions: React.Dispatch<React.SetStateAction<AllowanceItem[]>>;
    totalAllowances: number;
    totalDeductions: number;
    netSalary: number;
    loading: boolean;
    fmt: (n: number) => string;
}

export function PayrollCreateTab({
    success, error, setTab, handleSubmit,
    form, setForm, employees,
    allowances, setAllowances,
    deductions, setDeductions,
    totalAllowances, totalDeductions, netSalary,
    loading, fmt
}: PayrollCreateTabProps) {
    return (
        <>
            {success && (
                <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        {success}
                    </div>
                    <button onClick={() => setTab("history")} className="text-xs font-bold underline">Lihat Riwayat</button>
                </div>
            )}

            {error && (
                <div className="p-3 bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 text-[var(--destructive)] rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="card p-6">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4 uppercase tracking-wider">Informasi Dasar</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="form-group !mb-0">
                            <label className="form-label">Karyawan</label>
                            <select className="form-select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
                                <option value="">Pilih Karyawan</option>
                                {employees.map((e) => <option key={e.id} value={e.employeeId}>{e.name} ({e.employeeId})</option>)}
                            </select>
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label">Periode</label>
                            <input type="month" className="form-input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} required />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div className="form-group !mb-0">
                            <label className="form-label">Gaji Pokok</label>
                            <input type="number" className="form-input" value={form.basicSalary || ""} onChange={(e) => setForm({ ...form, basicSalary: Number(e.target.value) })} required placeholder="0" />
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label">Lembur</label>
                            <input type="number" className="form-input" value={form.overtime || ""} onChange={(e) => setForm({ ...form, overtime: Number(e.target.value) })} placeholder="0" />
                        </div>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Tunjangan</h2>
                        <button type="button" onClick={() => setAllowances([...allowances, { name: "", amount: 0 }])} className="btn btn-ghost btn-sm text-[var(--primary)]">
                            <Plus className="w-3.5 h-3.5" /> Tambah
                        </button>
                    </div>
                    {allowances.map((a, i) => (
                        <div key={i} className="flex items-center gap-3 mb-3">
                            <input className="form-input flex-1" placeholder="Nama tunjangan" value={a.name} onChange={(e) => { const n = [...allowances]; n[i].name = e.target.value; setAllowances(n); }} />
                            <input type="number" className="form-input w-40" placeholder="Jumlah" value={a.amount || ""} onChange={(e) => { const n = [...allowances]; n[i].amount = Number(e.target.value); setAllowances(n); }} />
                            <button type="button" onClick={() => setAllowances(allowances.filter((_, idx) => idx !== i))} className="btn btn-ghost btn-sm !p-1.5 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    ))}
                    <div className="flex justify-end pt-2 border-t border-[var(--border)]">
                        <span className="text-sm font-bold text-green-600">Total: {fmt(totalAllowances)}</span>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Potongan</h2>
                        <button type="button" onClick={() => setDeductions([...deductions, { name: "", amount: 0 }])} className="btn btn-ghost btn-sm text-[var(--primary)]">
                            <Plus className="w-3.5 h-3.5" /> Tambah
                        </button>
                    </div>
                    {deductions.map((d, i) => (
                        <div key={i} className="flex items-center gap-3 mb-3">
                            <input className="form-input flex-1" placeholder="Nama potongan" value={d.name} onChange={(e) => { const n = [...deductions]; n[i].name = e.target.value; setDeductions(n); }} />
                            <input type="number" className="form-input w-40" placeholder="Jumlah" value={d.amount || ""} onChange={(e) => { const n = [...deductions]; n[i].amount = Number(e.target.value); setDeductions(n); }} />
                            <button type="button" onClick={() => setDeductions(deductions.filter((_, idx) => idx !== i))} className="btn btn-ghost btn-sm !p-1.5 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    ))}
                    <div className="flex justify-end pt-2 border-t border-[var(--border)]">
                        <span className="text-sm font-bold text-red-600">Total: -{fmt(totalDeductions)}</span>
                    </div>
                </div>

                <div className="card p-6">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4 uppercase tracking-wider">Ringkasan</h2>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-[var(--text-secondary)]">Gaji Pokok</span><span className="font-medium">{fmt(form.basicSalary)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-[var(--text-secondary)]">Total Tunjangan</span><span className="font-medium text-green-600">+{fmt(totalAllowances)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-[var(--text-secondary)]">Lembur</span><span className="font-medium text-green-600">+{fmt(form.overtime)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-[var(--text-secondary)]">Total Potongan</span><span className="font-medium text-red-600">-{fmt(totalDeductions)}</span></div>
                        <div className="flex justify-between pt-3 mt-2 border-t-2 border-[var(--primary)]">
                            <span className="text-sm font-bold text-[var(--text-primary)]">Gaji Bersih (Take Home Pay)</span>
                            <span className="text-lg font-extrabold text-[var(--primary)]">{fmt(netSalary)}</span>
                        </div>
                    </div>
                </div>

                <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Terbitkan Slip Gaji
                </button>
            </form>
        </>
    );
}

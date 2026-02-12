"use client";

import { useEffect, useState } from "react";
import { Wallet, Send, Loader2, Plus, Trash2 } from "lucide-react";

interface Employee { id: string; employeeId: string; name: string; }
interface AllowanceItem { name: string; amount: number; }

export default function PayrollPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [form, setForm] = useState({
        employeeId: "",
        period: "",
        basicSalary: 0,
        overtime: 0,
        notes: "",
    });
    const [allowances, setAllowances] = useState<AllowanceItem[]>([
        { name: "Tunjangan Makan", amount: 0 },
    ]);
    const [deductions, setDeductions] = useState<AllowanceItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState("");

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
    }, []);

    const totalAllowances = allowances.reduce((s, a) => s + a.amount, 0);
    const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
    const netSalary = form.basicSalary + totalAllowances + form.overtime - totalDeductions;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccess("");
        const filteredAllowances = allowances.filter((a) => a.name && a.amount > 0);
        const filteredDeductions = deductions.filter((d) => d.name && d.amount > 0);
        const res = await fetch("/api/payslips", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...form,
                allowances: filteredAllowances,
                deductions: filteredDeductions,
                netSalary,
                issuedDate: new Date().toISOString().split("T")[0],
            }),
        });
        if (res.ok) {
            setSuccess("Slip gaji berhasil dibuat!");
            setForm({ employeeId: "", period: "", basicSalary: 0, overtime: 0, notes: "" });
            setAllowances([{ name: "Tunjangan Makan", amount: 0 }]);
            setDeductions([]);
        }
        setLoading(false);
    };

    const addAllowance = () => setAllowances([...allowances, { name: "", amount: 0 }]);
    const removeAllowance = (i: number) => setAllowances(allowances.filter((_, idx) => idx !== i));
    const updateAllowance = (i: number, key: keyof AllowanceItem, val: string | number) => {
        const next = [...allowances];
        next[i] = { ...next[i], [key]: val };
        setAllowances(next);
    };

    const addDeduction = () => setDeductions([...deductions, { name: "", amount: 0 }]);
    const removeDeduction = (i: number) => setDeductions(deductions.filter((_, idx) => idx !== i));
    const updateDeduction = (i: number, key: keyof AllowanceItem, val: string | number) => {
        const next = [...deductions];
        next[i] = { ...next[i], [key]: val };
        setDeductions(next);
    };

    const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-[var(--primary)]" />
                    Payroll
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Buat slip gaji dengan komponen gaji lengkap</p>
            </div>

            {success && (
                <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
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

                {/* Allowances */}
                <div className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Tunjangan</h2>
                        <button type="button" onClick={addAllowance} className="btn btn-ghost btn-sm text-[var(--primary)]">
                            <Plus className="w-3.5 h-3.5" /> Tambah
                        </button>
                    </div>
                    {allowances.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] text-center py-3">Belum ada tunjangan</p>
                    ) : (
                        <div className="space-y-3">
                            {allowances.map((a, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <input className="form-input flex-1" placeholder="Nama tunjangan" value={a.name} onChange={(e) => updateAllowance(i, "name", e.target.value)} />
                                    <input type="number" className="form-input w-40" placeholder="Jumlah" value={a.amount || ""} onChange={(e) => updateAllowance(i, "amount", Number(e.target.value))} />
                                    <button type="button" onClick={() => removeAllowance(i)} className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50 shrink-0">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            <div className="flex justify-end pt-2 border-t border-[var(--border)]">
                                <span className="text-sm font-bold text-green-600">Total: {fmt(totalAllowances)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Deductions */}
                <div className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Potongan</h2>
                        <button type="button" onClick={addDeduction} className="btn btn-ghost btn-sm text-[var(--primary)]">
                            <Plus className="w-3.5 h-3.5" /> Tambah
                        </button>
                    </div>
                    {deductions.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] text-center py-3">Belum ada potongan</p>
                    ) : (
                        <div className="space-y-3">
                            {deductions.map((d, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <input className="form-input flex-1" placeholder="Nama potongan" value={d.name} onChange={(e) => updateDeduction(i, "name", e.target.value)} />
                                    <input type="number" className="form-input w-40" placeholder="Jumlah" value={d.amount || ""} onChange={(e) => updateDeduction(i, "amount", Number(e.target.value))} />
                                    <button type="button" onClick={() => removeDeduction(i)} className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50 shrink-0">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            <div className="flex justify-end pt-2 border-t border-[var(--border)]">
                                <span className="text-sm font-bold text-red-600">Total: -{fmt(totalDeductions)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Summary */}
                <div className="card p-6">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] mb-4 uppercase tracking-wider">Ringkasan</h2>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-[var(--text-secondary)]">Gaji Pokok</span><span className="font-medium">{fmt(form.basicSalary)}</span></div>
                        {allowances.filter(a => a.amount > 0).map((a, i) => (
                            <div key={`a-${i}`} className="flex justify-between text-sm"><span className="text-[var(--text-secondary)]">{a.name || "Tunjangan"}</span><span className="font-medium text-green-600">+{fmt(a.amount)}</span></div>
                        ))}
                        {form.overtime > 0 && <div className="flex justify-between text-sm"><span className="text-[var(--text-secondary)]">Lembur</span><span className="font-medium text-green-600">+{fmt(form.overtime)}</span></div>}
                        {deductions.filter(d => d.amount > 0).map((d, i) => (
                            <div key={`d-${i}`} className="flex justify-between text-sm"><span className="text-[var(--text-secondary)]">{d.name || "Potongan"}</span><span className="font-medium text-red-600">-{fmt(d.amount)}</span></div>
                        ))}
                        <div className="flex justify-between pt-3 mt-2 border-t-2 border-[var(--primary)]">
                            <span className="text-sm font-bold text-[var(--text-primary)]">Gaji Bersih (Take Home Pay)</span>
                            <span className="text-lg font-extrabold text-[var(--primary)]">{fmt(netSalary)}</span>
                        </div>
                    </div>
                </div>

                {/* Notes */}
                <div className="card p-6">
                    <div className="form-group !mb-0">
                        <label className="form-label">Catatan (opsional)</label>
                        <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan tambahan..." />
                    </div>
                </div>

                <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Buat Slip Gaji
                </button>
            </form>
        </div>
    );
}

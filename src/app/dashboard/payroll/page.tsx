"use client";

import { useEffect, useState } from "react";
import { Wallet, Send, Loader2 } from "lucide-react";

interface Employee { id: string; employeeId: string; name: string; }

export default function PayrollPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [form, setForm] = useState({ employeeId: "", period: "", basicSalary: 0, allowances: 0, deductions: 0, overtime: 0, notes: "" });
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState("");

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccess("");
        const netSalary = form.basicSalary + form.allowances + form.overtime - form.deductions;
        const res = await fetch("/api/payslips", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...form, netSalary, issuedDate: new Date().toISOString().split("T")[0] }),
        });
        if (res.ok) {
            setSuccess("Slip gaji berhasil dibuat!");
            setForm({ employeeId: "", period: "", basicSalary: 0, allowances: 0, deductions: 0, overtime: 0, notes: "" });
        }
        setLoading(false);
    };

    const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);
    const net = form.basicSalary + form.allowances + form.overtime - form.deductions;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-[var(--primary)]" />
                    Payroll
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Buat slip gaji karyawan</p>
            </div>

            {success && (
                <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>
            )}

            <form onSubmit={handleSubmit} className="card p-6 space-y-5">
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="form-group !mb-0">
                        <label className="form-label">Gaji Pokok</label>
                        <input type="number" className="form-input" value={form.basicSalary || ""} onChange={(e) => setForm({ ...form, basicSalary: Number(e.target.value) })} required />
                    </div>
                    <div className="form-group !mb-0">
                        <label className="form-label">Tunjangan</label>
                        <input type="number" className="form-input" value={form.allowances || ""} onChange={(e) => setForm({ ...form, allowances: Number(e.target.value) })} />
                    </div>
                    <div className="form-group !mb-0">
                        <label className="form-label">Lembur</label>
                        <input type="number" className="form-input" value={form.overtime || ""} onChange={(e) => setForm({ ...form, overtime: Number(e.target.value) })} />
                    </div>
                    <div className="form-group !mb-0">
                        <label className="form-label">Potongan</label>
                        <input type="number" className="form-input" value={form.deductions || ""} onChange={(e) => setForm({ ...form, deductions: Number(e.target.value) })} />
                    </div>
                </div>

                <div className="p-4 bg-[var(--primary)]/5 rounded-lg flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--text-primary)]">Gaji Bersih:</span>
                    <span className="text-lg font-extrabold text-[var(--primary)]">{fmt(net)}</span>
                </div>

                <div className="form-group !mb-0">
                    <label className="form-label">Catatan (opsional)</label>
                    <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>

                <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Buat Slip Gaji
                </button>
            </form>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { Wallet, Send, Loader2, Plus, Trash2, FileText, Eye, X, Download, FileSpreadsheet } from "lucide-react";
import { exportToExcel, exportPayslipPdf } from "@/lib/export";

interface Employee { id: string; employeeId: string; name: string; }
interface AllowanceItem { name: string; amount: number; }
interface MasterComponent { id: string; name: string; type: string; defaultAmount: number; isActive: boolean; }
interface Payslip {
    id: string; employeeId: string; period: string; basicSalary: number;
    allowances: AllowanceItem[]; deductions: AllowanceItem[];
    overtime: number; netSalary: number; issuedDate: string; notes?: string;
}

type Tab = "create" | "history";

export default function PayrollPage() {
    const [tab, setTab] = useState<Tab>("create");
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [masterComponents, setMasterComponents] = useState<MasterComponent[]>([]);
    const [selected, setSelected] = useState<Payslip | null>(null);
    const [form, setForm] = useState({
        employeeId: "", period: "", basicSalary: 0, overtime: 0, notes: "",
    });
    const [allowances, setAllowances] = useState<AllowanceItem[]>([]);
    const [deductions, setDeductions] = useState<AllowanceItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState("");

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
        fetch("/api/payslips").then((r) => r.json()).then((d: Payslip[]) => { if (Array.isArray(d)) setPayslips(d); });
        fetch("/api/master/payroll-components").then((r) => r.json()).then((d) => {
            if (Array.isArray(d)) {
                setMasterComponents(d);
                const active = d.filter(c => c.isActive);
                setAllowances(active.filter(c => c.type === "allowance").map(c => ({ name: c.name, amount: c.defaultAmount })));
                setDeductions(active.filter(c => c.type === "deduction").map(c => ({ name: c.name, amount: c.defaultAmount })));
            }
        });
    }, []);

    const getEmpName = (empId: string) => employees.find((e) => e.employeeId === empId)?.name || empId;

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
                ...form, allowances: filteredAllowances, deductions: filteredDeductions, netSalary,
                issuedDate: new Date().toISOString().split("T")[0],
            }),
        });
        if (res.ok) {
            const newPayslip = await res.json();
            setSuccess("Slip gaji berhasil dibuat!");
            setForm({ employeeId: "", period: "", basicSalary: 0, overtime: 0, notes: "" });

            // Reset to master defaults
            const active = masterComponents.filter(c => c.isActive);
            setAllowances(active.filter(c => c.type === "allowance").map(c => ({ name: c.name, amount: c.defaultAmount })));
            setDeductions(active.filter(c => c.type === "deduction").map(c => ({ name: c.name, amount: c.defaultAmount })));

            setPayslips((prev) => [newPayslip, ...prev]);
        }
        setLoading(false);
    };

    const addAllowance = () => setAllowances([...allowances, { name: "", amount: 0 }]);
    const removeAllowance = (i: number) => setAllowances(allowances.filter((_, idx) => idx !== i));
    const updateAllowance = (i: number, key: keyof AllowanceItem, val: string | number) => {
        const next = [...allowances]; next[i] = { ...next[i], [key]: val }; setAllowances(next);
    };
    const addDeduction = () => setDeductions([...deductions, { name: "", amount: 0 }]);
    const removeDeduction = (i: number) => setDeductions(deductions.filter((_, idx) => idx !== i));
    const updateDeduction = (i: number, key: keyof AllowanceItem, val: string | number) => {
        const next = [...deductions]; next[i] = { ...next[i], [key]: val }; setDeductions(next);
    };

    const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

    const handleExportHistory = () => {
        const data = payslips.map((p) => ({
            employeeId: p.employeeId,
            name: getEmpName(p.employeeId),
            period: p.period,
            basicSalary: p.basicSalary,
            allowances: Array.isArray(p.allowances) ? p.allowances.reduce((s: number, a: AllowanceItem) => s + a.amount, 0) : 0,
            overtime: p.overtime,
            deductions: Array.isArray(p.deductions) ? p.deductions.reduce((s: number, d: AllowanceItem) => s + d.amount, 0) : 0,
            netSalary: p.netSalary,
            issuedDate: p.issuedDate,
        }));
        exportToExcel(data, [
            { key: "employeeId", label: "ID Karyawan" },
            { key: "name", label: "Nama" },
            { key: "period", label: "Periode" },
            { key: "basicSalary", label: "Gaji Pokok" },
            { key: "allowances", label: "Total Tunjangan" },
            { key: "overtime", label: "Lembur" },
            { key: "deductions", label: "Total Potongan" },
            { key: "netSalary", label: "Gaji Bersih" },
            { key: "issuedDate", label: "Tanggal Terbit" },
        ], "Rekap_Payroll", "Payroll");
    };

    const handlePayslipPdf = (p: Payslip) => {
        exportPayslipPdf({
            employeeId: p.employeeId,
            employeeName: getEmpName(p.employeeId),
            period: p.period,
            basicSalary: p.basicSalary,
            overtime: p.overtime,
            allowances: Array.isArray(p.allowances) ? p.allowances : [],
            deductions: Array.isArray(p.deductions) ? p.deductions : [],
            netSalary: p.netSalary,
            issuedDate: p.issuedDate,
            notes: p.notes,
        });
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-[var(--primary)]" />
                        Payroll
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Kelola slip gaji karyawan</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
                <button onClick={() => setTab("create")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === "create" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                    <Send className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Buat Slip Gaji
                </button>
                <button onClick={() => setTab("history")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === "history" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                    <FileText className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Riwayat ({payslips.length})
                </button>
            </div>

            {tab === "create" && (
                <>
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
                </>
            )}

            {tab === "history" && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button onClick={handleExportHistory} className="btn btn-secondary btn-sm" disabled={payslips.length === 0}>
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
                        </button>
                    </div>

                    {payslips.length === 0 ? (
                        <div className="card p-12 text-center">
                            <FileText className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada slip gaji</p>
                        </div>
                    ) : (
                        <div className="card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Karyawan</th>
                                            <th>Periode</th>
                                            <th className="hidden md:table-cell">Gaji Pokok</th>
                                            <th>Gaji Bersih</th>
                                            <th>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payslips.map((p) => (
                                            <tr key={p.id}>
                                                <td className="font-medium text-[var(--text-primary)]">
                                                    <div>
                                                        <p>{getEmpName(p.employeeId)}</p>
                                                        <p className="text-[10px] text-[var(--text-muted)]">{p.employeeId}</p>
                                                    </div>
                                                </td>
                                                <td>{p.period}</td>
                                                <td className="hidden md:table-cell">{fmt(p.basicSalary)}</td>
                                                <td className="font-bold text-[var(--primary)]">{fmt(p.netSalary)}</td>
                                                <td>
                                                    <div className="flex items-center gap-1.5">
                                                        <button onClick={() => setSelected(p)} className="btn btn-ghost btn-sm !p-1.5 text-[var(--primary)]"><Eye className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handlePayslipPdf(p)} className="btn btn-ghost btn-sm !p-1.5 text-red-600"><Download className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Detail Modal */}
            {selected && (
                <div className="modal-overlay" onClick={() => setSelected(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Slip Gaji — {selected.period}</h2>
                            <button className="modal-close" onClick={() => setSelected(null)}><X className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="text-center pb-4 border-b border-[var(--border)]">
                                <p className="text-sm font-bold text-[var(--text-primary)]">PT Wijaya Inovasi Gemilang</p>
                                <p className="text-xs text-[var(--text-muted)]">Slip Gaji Karyawan — {getEmpName(selected.employeeId)}</p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm py-1.5">
                                    <span className="text-[var(--text-secondary)]">Gaji Pokok</span>
                                    <span className="font-semibold">{fmt(selected.basicSalary)}</span>
                                </div>
                                {Array.isArray(selected.allowances) && selected.allowances.length > 0 && (
                                    <>
                                        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-3">Tunjangan</p>
                                        {selected.allowances.map((a, i) => (
                                            <div key={`a-${i}`} className="flex justify-between text-sm py-1 pl-3">
                                                <span className="text-[var(--text-secondary)]">{a.name}</span>
                                                <span className="font-medium text-green-600">+{fmt(a.amount)}</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                                {selected.overtime > 0 && (
                                    <div className="flex justify-between text-sm py-1.5">
                                        <span className="text-[var(--text-secondary)]">Lembur</span>
                                        <span className="font-medium text-green-600">+{fmt(selected.overtime)}</span>
                                    </div>
                                )}
                                {Array.isArray(selected.deductions) && selected.deductions.length > 0 && (
                                    <>
                                        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-3">Potongan</p>
                                        {selected.deductions.map((d, i) => (
                                            <div key={`d-${i}`} className="flex justify-between text-sm py-1 pl-3">
                                                <span className="text-[var(--text-secondary)]">{d.name}</span>
                                                <span className="font-medium text-red-600">-{fmt(d.amount)}</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                                <div className="flex justify-between py-3 mt-3 border-t-2 border-[var(--primary)] bg-[var(--primary)]/5 px-3 rounded-lg">
                                    <span className="text-sm font-bold text-[var(--text-primary)]">Take Home Pay</span>
                                    <span className="text-lg font-extrabold text-[var(--primary)]">{fmt(selected.netSalary)}</span>
                                </div>
                            </div>
                            <button onClick={() => handlePayslipPdf(selected)} className="btn btn-primary w-full mt-4">
                                <Download className="w-4 h-4" /> Download PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

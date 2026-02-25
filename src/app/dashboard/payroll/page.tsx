"use client";

import { useEffect, useState } from "react";
import { Wallet, Send, Loader2, Plus, Trash2, FileText, Eye, X, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Search, Filter } from "lucide-react";
import { exportToExcel, exportPayslipPdf } from "@/lib/export";

interface Employee {
    id: string;
    employeeId: string;
    name: string;
    basicSalary: number;
    isActive: boolean;
    department: string;
    division?: string | null;
    payrollComponents?: {
        amount: number;
        component: { name: string; type: "allowance" | "deduction" };
    }[];
}
interface Department { id: string; name: string; }
interface Division { id: string; name: string; departmentId: string; department: { name: string } }
interface AllowanceItem { name: string; amount: number; }
interface MasterComponent { id: string; name: string; type: string; defaultAmount: number; isActive: boolean; }
interface Payslip {
    id: string; employeeId: string; period: string; basicSalary: number;
    allowances: AllowanceItem[]; deductions: AllowanceItem[];
    overtime: number; netSalary: number; issuedDate: string; notes?: string;
}

type Tab = "recap" | "create" | "history";

export default function PayrollPage() {
    const [tab, setTab] = useState<Tab>("recap");
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [masterComponents, setMasterComponents] = useState<MasterComponent[]>([]);
    const [masterDepts, setMasterDepts] = useState<Department[]>([]);
    const [masterDivisions, setMasterDivisions] = useState<Division[]>([]);

    const [selected, setSelected] = useState<Payslip | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    // Filter states
    const [search, setSearch] = useState("");
    const [filterDept, setFilterDept] = useState("");
    const [filterDiv, setFilterDiv] = useState("");

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
            if (Array.isArray(d)) setMasterComponents(d);
        });
        fetch("/api/master/departments").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setMasterDepts(d); });
        fetch("/api/master/divisions").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setMasterDivisions(d); });
    }, []);

    // Effect to auto-populate payroll data when employee is selected in Create Tab
    useEffect(() => {
        if (!form.employeeId) {
            setForm(f => ({ ...f, basicSalary: 0 }));
            setAllowances([]);
            setDeductions([]);
            return;
        }

        const emp = employees.find(e => e.employeeId === form.employeeId);
        if (emp) {
            setForm(f => ({ ...f, basicSalary: emp.basicSalary || 0 }));

            if (emp.payrollComponents && emp.payrollComponents.length > 0) {
                const allowances = emp.payrollComponents
                    .filter(pc => pc.component.type === "allowance")
                    .map(pc => ({ name: pc.component.name, amount: pc.amount }));
                const deductions = emp.payrollComponents
                    .filter(pc => pc.component.type === "deduction")
                    .map(pc => ({ name: pc.component.name, amount: pc.amount }));

                setAllowances(allowances);
                setDeductions(deductions);
            } else {
                const active = masterComponents.filter(c => c.isActive);
                setAllowances(active.filter(c => c.type === "allowance").map(c => ({ name: c.name, amount: c.defaultAmount })));
                setDeductions(active.filter(c => c.type === "deduction").map(c => ({ name: c.name, amount: c.defaultAmount })));
            }
        }
    }, [form.employeeId, employees, masterComponents]);

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
            setPayslips((prev) => [newPayslip, ...prev]);
        }
        setLoading(false);
    };

    const handleProsesRecap = (emp: Employee) => {
        setForm({
            employeeId: emp.employeeId,
            period: selectedPeriod,
            basicSalary: emp.basicSalary || 0,
            overtime: 0,
            notes: "",
        });

        if (emp.payrollComponents && emp.payrollComponents.length > 0) {
            setAllowances(emp.payrollComponents.filter(pc => pc.component.type === "allowance").map(pc => ({ name: pc.component.name, amount: pc.amount })));
            setDeductions(emp.payrollComponents.filter(pc => pc.component.type === "deduction").map(pc => ({ name: pc.component.name, amount: pc.amount })));
        } else {
            const active = masterComponents.filter(c => c.isActive);
            setAllowances(active.filter(c => c.type === "allowance").map(c => ({ name: c.name, amount: c.defaultAmount })));
            setDeductions(active.filter(c => c.type === "deduction").map(c => ({ name: c.name, amount: c.defaultAmount })));
        }

        setTab("create");
        setSuccess("");
    };

    const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

    // Filtered data for Recap
    const filteredRecapEmployees = employees.filter(e => e.isActive).filter(e => {
        if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.employeeId.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterDept && e.department !== filterDept) return false;
        if (filterDiv && e.division !== filterDiv) return false;
        return true;
    });

    // Filtered data for History
    const filteredHistoryPayslips = payslips.filter(p => {
        const emp = employees.find(e => e.employeeId === p.employeeId);
        if (!emp) return true; // Should not happen
        if (search && !emp.name.toLowerCase().includes(search.toLowerCase()) && !emp.employeeId.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterDept && emp.department !== filterDept) return false;
        if (filterDiv && emp.division !== filterDiv) return false;
        if (selectedPeriod && p.period !== selectedPeriod) return false; // Optional: match period in history too?
        return true;
    });

    const handleExportHistory = () => {
        const data = filteredHistoryPayslips.map((p) => ({
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
        ], "History_Payroll", "History");
    };

    const handleExportRecapExcel = () => {
        const data = filteredRecapEmployees.map(e => {
            const hasPayslip = payslips.some(p => p.employeeId === e.employeeId && p.period === selectedPeriod);
            const empAllowances = e.payrollComponents?.filter(pc => pc.component.type === "allowance").reduce((s, pc) => s + pc.amount, 0) || 0;
            const empDeductions = e.payrollComponents?.filter(pc => pc.component.type === "deduction").reduce((s, pc) => s + pc.amount, 0) || 0;

            return {
                employeeId: e.employeeId,
                name: e.name,
                dept: e.department,
                div: e.division || "-",
                period: selectedPeriod,
                basicSalary: e.basicSalary,
                allowances: empAllowances,
                deductions: empDeductions,
                netSalary: e.basicSalary + empAllowances - empDeductions,
                status: hasPayslip ? "Sudah Terbit" : "Belum Terbit",
            };
        });

        exportToExcel(data, [
            { key: "employeeId", label: "ID Karyawan" },
            { key: "name", label: "Nama" },
            { key: "dept", label: "Departemen" },
            { key: "div", label: "Divisi" },
            { key: "period", label: "Periode" },
            { key: "basicSalary", label: "Gaji Pokok" },
            { key: "allowances", label: "Total Tunjangan" },
            { key: "deductions", label: "Total Potongan" },
            { key: "netSalary", label: "Estimasi Gaji Bersih" },
            { key: "status", label: "Status" },
        ], `Recap_Payroll_${selectedPeriod}`, "Recap");
    };

    const handleExportRecapPdf = () => {
        const tableData = filteredRecapEmployees.map((e, idx) => {
            const hasPayslip = payslips.some(p => p.employeeId === e.employeeId && p.period === selectedPeriod);
            const empAllowances = e.payrollComponents?.filter(pc => pc.component.type === "allowance").reduce((s, pc) => s + pc.amount, 0) || 0;
            const empDeductions = e.payrollComponents?.filter(pc => pc.component.type === "deduction").reduce((s, pc) => s + pc.amount, 0) || 0;
            const estNet = e.basicSalary + empAllowances - empDeductions;

            return [
                idx + 1,
                e.employeeId,
                e.name,
                e.department,
                e.division || "-",
                fmt(e.basicSalary),
                fmt(empAllowances),
                fmt(empDeductions),
                fmt(estNet),
                hasPayslip ? "Sudah" : "Belum"
            ];
        });

        const headers = ["No", "ID", "Nama", "Dept", "Divisi", "Gapok", "Tunj", "Pot", "Est. Bersih", "Stat"];
        import("@/lib/export").then(m => {
            m.exportToPdfTable(
                tableData,
                headers,
                `REKAPITULASI PAYROLL - ${selectedPeriod}`,
                `Recap_Payroll_${selectedPeriod}`,
                `Filter: ${filterDept || 'Semua Dept'}${filterDiv ? ' / ' + filterDiv : ''}`
            );
        });
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

    const availableDivisions = masterDivisions.filter(v => v.department.name === filterDept);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-[var(--primary)]" />
                        Payroll
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Kelola dan rekapitulasi gaji karyawan</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
                <button onClick={() => setTab("recap")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === "recap" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                    <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Rekap Payroll
                </button>
                <button onClick={() => setTab("create")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === "create" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                    <Plus className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Buat Slip Gaji
                </button>
                <button onClick={() => setTab("history")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === "history" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                    <FileText className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Riwayat ({payslips.length})
                </button>
            </div>

            {/* Global Filters (shown on Recap and History) */}
            {(tab === "recap" || tab === "history") && (
                <div className="card p-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] mb-1">
                        <Filter className="w-4 h-4 text-[var(--primary)]" />
                        FILTER DATA
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                className="form-input pl-10"
                                placeholder="Cari nama atau ID..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <select className="form-select" value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setFilterDiv(""); }}>
                            <option value="">Semua Departemen</option>
                            {masterDepts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                        </select>
                        <select className="form-select" value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)} disabled={!filterDept}>
                            <option value="">Semua Divisi</option>
                            {availableDivisions.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                        </select>
                        {tab === "recap" && (
                            <input type="month" className="form-input" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} />
                        )}
                        {tab === "history" && (
                            <input type="month" className="form-input" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} />
                        )}
                    </div>
                </div>
            )}

            {tab === "recap" && (
                <div className="space-y-4">
                    <div className="flex justify-end gap-2">
                        <button onClick={handleExportRecapExcel} className="btn btn-secondary btn-sm" disabled={filteredRecapEmployees.length === 0}>
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
                        </button>
                        <button onClick={handleExportRecapPdf} className="btn btn-secondary btn-sm" disabled={filteredRecapEmployees.length === 0}>
                            <FileText className="w-3.5 h-3.5" /> Export PDF Recap
                        </button>
                    </div>

                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Karyawan</th>
                                        <th>Gaji Pokok</th>
                                        <th className="hidden lg:table-cell">Tunjangan</th>
                                        <th className="hidden lg:table-cell">Potongan</th>
                                        <th>Estimasi Bersih</th>
                                        <th>Status</th>
                                        <th>Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRecapEmployees.length === 0 ? (
                                        <tr><td colSpan={7} className="text-center py-8 text-sm text-[var(--text-muted)]">Data tidak ditemukan</td></tr>
                                    ) : (
                                        filteredRecapEmployees.map((e) => {
                                            const hasPayslip = payslips.some(p => p.employeeId === e.employeeId && p.period === selectedPeriod);
                                            const empAllowances = e.payrollComponents?.filter(pc => pc.component.type === "allowance").reduce((s, pc) => s + pc.amount, 0) || 0;
                                            const empDeductions = e.payrollComponents?.filter(pc => pc.component.type === "deduction").reduce((s, pc) => s + pc.amount, 0) || 0;
                                            const estNet = e.basicSalary + empAllowances - empDeductions;

                                            return (
                                                <tr key={e.id}>
                                                    <td className="font-medium">
                                                        <div>
                                                            <p className="text-[var(--text-primary)]">{e.name}</p>
                                                            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                                                                <span>{e.employeeId}</span>
                                                                <span>•</span>
                                                                <span>{e.department}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>{fmt(e.basicSalary)}</td>
                                                    <td className="hidden lg:table-cell text-green-600 font-medium">+{fmt(empAllowances)}</td>
                                                    <td className="hidden lg:table-cell text-red-600 font-medium">-{fmt(empDeductions)}</td>
                                                    <td className="font-bold text-[var(--text-primary)]">{fmt(estNet)}</td>
                                                    <td>
                                                        {hasPayslip ? (
                                                            <span className="badge badge-success flex items-center gap-1 !w-fit"><CheckCircle2 className="w-3 h-3" /> Terbit</span>
                                                        ) : (
                                                            <span className="badge badge-warning flex items-center gap-1 !w-fit"><AlertCircle className="w-3 h-3" /> Belum</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <button
                                                            onClick={() => handleProsesRecap(e)}
                                                            disabled={hasPayslip}
                                                            className={`btn btn-sm ${hasPayslip ? "btn-ghost opacity-50 cursor-not-allowed" : "btn-primary"}`}
                                                        >
                                                            {hasPayslip ? "Tuntas" : "Proses"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {tab === "create" && (
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

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Creation form... same as before but uses form states */}
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

                        {/* Allowances/Deductions/Summary... (Keeping previous implementation logic) */}
                        {/* ... (Allowances section) ... */}
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
            )}

            {tab === "history" && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button onClick={handleExportHistory} className="btn btn-secondary btn-sm" disabled={filteredHistoryPayslips.length === 0}>
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Export History Excel
                        </button>
                    </div>

                    {filteredHistoryPayslips.length === 0 ? (
                        <div className="card p-12 text-center">
                            <FileText className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Data tidak ditemukan</p>
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
                                        {filteredHistoryPayslips.map((p) => (
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
                                {selected.allowances.length > 0 && selected.allowances.map((a, i) => (
                                    <div key={`a-${i}`} className="flex justify-between text-sm py-1 pl-3">
                                        <span className="text-[var(--text-secondary)]">{a.name}</span>
                                        <span className="font-medium text-green-600">+{fmt(a.amount)}</span>
                                    </div>
                                ))}
                                {selected.overtime > 0 && <div className="flex justify-between text-sm py-1.5"><span className="text-[var(--text-secondary)]">Lembur</span><span className="font-medium text-green-600">+{fmt(selected.overtime)}</span></div>}
                                {selected.deductions.length > 0 && selected.deductions.map((d, i) => (
                                    <div key={`d-${i}`} className="flex justify-between text-sm py-1 pl-3">
                                        <span className="text-[var(--text-secondary)]">{d.name}</span>
                                        <span className="font-medium text-red-600">-{fmt(d.amount)}</span>
                                    </div>
                                ))}
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

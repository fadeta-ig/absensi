"use client";

import { useState, useEffect } from "react";
import { Wallet, Plus, FileText, FileSpreadsheet } from "lucide-react";
import { exportToExcel, exportPayslipPdf } from "@/lib/export";

import { Employee, Division, Department, AllowanceItem, MasterComponent, PayslipItem, Payslip, Tab } from "./types";
import { PayrollFilters } from "./components/PayrollFilters";
import { PayrollRecapTab } from "./components/PayrollRecapTab";
import { PayrollCreateTab } from "./components/PayrollCreateTab";
import { PayrollHistoryTab } from "./components/PayrollHistoryTab";
import { PayrollBulkModal, PayrollPayslipModal } from "./components/PayrollModals";

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

    const [overtimeRequests, setOvertimeRequests] = useState<{ employeeId: string; date: string; overtimePay: number; status: string }[]>([]);

    // Bulk payslip state
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; message: string } | null>(null);

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
        fetch("/api/payslips").then((r) => r.json()).then((d: Payslip[]) => { if (Array.isArray(d)) setPayslips(d); });
        fetch("/api/master/payroll-components").then((r) => r.json()).then((d) => {
            if (Array.isArray(d)) setMasterComponents(d);
        });
        fetch("/api/master/departments").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setMasterDepts(d); });
        fetch("/api/master/divisions").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setMasterDivisions(d); });
        fetch("/api/overtime").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setOvertimeRequests(d); });
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

            // Auto-populate overtime from approved requests
            const empOvertime = overtimeRequests
                .filter(o => o.employeeId === form.employeeId && o.status === "approved" && o.date.startsWith(form.period))
                .reduce((sum, o) => sum + (o.overtimePay || 0), 0);
            setForm(f => ({ ...f, overtime: empOvertime }));

            if (emp.payrollComponents && emp.payrollComponents.length > 0) {
                const allowances = emp.payrollComponents
                    .filter(pc => pc.component.type === "earning")
                    .map(pc => ({ name: pc.component.name, amount: pc.amount }));
                const deductions = emp.payrollComponents
                    .filter(pc => pc.component.type === "deduction")
                    .map(pc => ({ name: pc.component.name, amount: pc.amount }));

                setAllowances(allowances);
                setDeductions(deductions);
            } else {
                const active = masterComponents.filter(c => c.isActive);
                setAllowances(active.filter(c => c.type === "earning").map(c => ({ name: c.name, amount: c.defaultAmount })));
                setDeductions(active.filter(c => c.type === "deduction").map(c => ({ name: c.name, amount: c.defaultAmount })));
            }
        }
    }, [form.employeeId, form.period, employees, masterComponents, overtimeRequests]);

    const getEmpName = (empId: string) => employees.find((e) => e.employeeId === empId)?.name || empId;

    const totalAllowances = allowances.reduce((s, a) => s + a.amount, 0);
    const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
    const netSalary = form.basicSalary + totalAllowances + form.overtime - totalDeductions;

    const getItemsAllowances = (items: PayslipItem[] | undefined) => items ? items.filter(i => i.type === "ALLOWANCE") : [];
    const getItemsDeductions = (items: PayslipItem[] | undefined) => items ? items.filter(i => i.type === "DEDUCTION") : [];

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
        // Calculate overtime from approved requests for this employee and period
        const empOvertime = overtimeRequests
            .filter(o => o.employeeId === emp.employeeId && o.status === "approved" && o.date.startsWith(selectedPeriod))
            .reduce((sum, o) => sum + (o.overtimePay || 0), 0);

        setForm({
            employeeId: emp.employeeId,
            period: selectedPeriod,
            basicSalary: emp.basicSalary || 0,
            overtime: empOvertime,
            notes: "",
        });

        if (emp.payrollComponents && emp.payrollComponents.length > 0) {
            setAllowances(emp.payrollComponents.filter(pc => pc.component.type === "earning").map(pc => ({ name: pc.component.name, amount: pc.amount })));
            setDeductions(emp.payrollComponents.filter(pc => pc.component.type === "deduction").map(pc => ({ name: pc.component.name, amount: pc.amount })));
        } else {
            const active = masterComponents.filter(c => c.isActive);
            setAllowances(active.filter(c => c.type === "earning").map(c => ({ name: c.name, amount: c.defaultAmount })));
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
            allowances: getItemsAllowances(p.items).reduce((s: number, a: PayslipItem) => s + a.amount, 0),
            overtime: p.overtime,
            deductions: getItemsDeductions(p.items).reduce((s: number, d: PayslipItem) => s + d.amount, 0),
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
            const empAllowances = e.payrollComponents?.filter(pc => pc.component.type === "earning").reduce((s, pc) => s + pc.amount, 0) || 0;
            const empDeductions = e.payrollComponents?.filter(pc => pc.component.type === "deduction").reduce((s, pc) => s + pc.amount, 0) || 0;
            const empOvertime = overtimeRequests
                .filter(o => o.employeeId === e.employeeId && o.status === "approved" && o.date.startsWith(selectedPeriod))
                .reduce((sum, o) => sum + (o.overtimePay || 0), 0);

            return {
                employeeId: e.employeeId,
                name: e.name,
                dept: e.department,
                div: e.division || "-",
                period: selectedPeriod,
                basicSalary: e.basicSalary,
                allowances: empAllowances,
                overtime: empOvertime,
                deductions: empDeductions,
                netSalary: e.basicSalary + empAllowances + empOvertime - empDeductions,
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
            { key: "overtime", label: "Lembur" },
            { key: "deductions", label: "Total Potongan" },
            { key: "netSalary", label: "Estimasi Gaji Bersih" },
            { key: "status", label: "Status" },
        ], `Recap_Payroll_${selectedPeriod}`, "Recap");
    };

    const handleExportRecapPdf = () => {
        const tableData = filteredRecapEmployees.map((e, idx) => {
            const hasPayslip = payslips.some(p => p.employeeId === e.employeeId && p.period === selectedPeriod);
            const empAllowances = e.payrollComponents?.filter(pc => pc.component.type === "earning").reduce((s, pc) => s + pc.amount, 0) || 0;
            const empDeductions = e.payrollComponents?.filter(pc => pc.component.type === "deduction").reduce((s, pc) => s + pc.amount, 0) || 0;
            const empOvertime = overtimeRequests
                .filter(o => o.employeeId === e.employeeId && o.status === "approved" && o.date.startsWith(selectedPeriod))
                .reduce((sum, o) => sum + (o.overtimePay || 0), 0);
            const estNet = e.basicSalary + empAllowances + empOvertime - empDeductions;

            return [
                idx + 1,
                e.employeeId,
                e.name,
                e.department,
                e.division || "-",
                fmt(e.basicSalary),
                fmt(empAllowances),
                fmt(empOvertime),
                fmt(empDeductions),
                fmt(estNet),
                hasPayslip ? "Sudah" : "Belum"
            ];
        });

        const headers = ["No", "ID", "Nama", "Dept", "Divisi", "Gapok", "Tunj", "Lembur", "Pot", "Est. Bersih", "Stat"];
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

    const handleBulkGenerate = () => {
        setBulkResult(null);
        setShowBulkModal(true);
    };

    const confirmBulk = async () => {
        setBulkLoading(true);
        setBulkResult(null);
        try {
            const toGenerate = filteredRecapEmployees
                .filter((e) => !payslips.some((p) => p.employeeId === e.employeeId && p.period === selectedPeriod))
                .map((e) => e.employeeId);

            if (toGenerate.length === 0) {
                setBulkResult({ created: 0, skipped: filteredRecapEmployees.length, message: "Semua karyawan sudah memiliki slip gaji untuk periode ini." });
                setBulkLoading(false);
                return;
            }

            const res = await fetch("/api/payslips/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ period: selectedPeriod, employeeIds: toGenerate }),
            });

            const data = await res.json() as { created: number; skipped: number; message: string };
            setBulkResult(data);

            if (res.ok && data.created > 0) {
                const freshPayslips = await fetch("/api/payslips").then((r) => r.json());
                if (Array.isArray(freshPayslips)) setPayslips(freshPayslips);
            }
        } catch {
            setBulkResult({ created: 0, skipped: 0, message: "Terjadi kesalahan koneksi." });
        } finally {
            setBulkLoading(false);
        }
    };

    const handlePayslipPdf = (p: Payslip) => {
        exportPayslipPdf({
            employeeId: p.employeeId,
            employeeName: getEmpName(p.employeeId),
            period: p.period,
            basicSalary: p.basicSalary,
            overtime: p.overtime,
            allowances: getItemsAllowances(p.items),
            deductions: getItemsDeductions(p.items),
            netSalary: p.netSalary,
            issuedDate: p.issuedDate,
            notes: p.notes,
        });
    };

    const selectedFilterDivision = masterDivisions.find(v => v.name === filterDiv);
    const availableDepartments = masterDepts.filter(d => selectedFilterDivision ? d.divisionId === selectedFilterDivision.id : false);

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

            {/* Global Filters */}
            {(tab === "recap" || tab === "history") && (
                <PayrollFilters 
                    search={search} setSearch={setSearch}
                    filterDiv={filterDiv} setFilterDiv={setFilterDiv}
                    filterDept={filterDept} setFilterDept={setFilterDept}
                    selectedPeriod={selectedPeriod} setSelectedPeriod={setSelectedPeriod}
                    masterDivisions={masterDivisions} availableDepartments={availableDepartments}
                    tab={tab}
                />
            )}

            {tab === "recap" && (
                <PayrollRecapTab
                    filteredRecapEmployees={filteredRecapEmployees}
                    payslips={payslips}
                    selectedPeriod={selectedPeriod}
                    overtimeRequests={overtimeRequests}
                    fmt={fmt}
                    handleBulkGenerate={handleBulkGenerate}
                    handleExportRecapExcel={handleExportRecapExcel}
                    handleExportRecapPdf={handleExportRecapPdf}
                    handleProsesRecap={handleProsesRecap}
                />
            )}

            {tab === "create" && (
                <PayrollCreateTab
                    success={success} setTab={setTab} handleSubmit={handleSubmit}
                    form={form} setForm={setForm} employees={employees}
                    allowances={allowances} setAllowances={setAllowances}
                    deductions={deductions} setDeductions={setDeductions}
                    totalAllowances={totalAllowances} totalDeductions={totalDeductions}
                    netSalary={netSalary} loading={loading} fmt={fmt}
                />
            )}

            {tab === "history" && (
                <PayrollHistoryTab
                    filteredHistoryPayslips={filteredHistoryPayslips}
                    employees={employees}
                    setPayslips={setPayslips}
                    setSelected={setSelected}
                    handlePayslipPdf={handlePayslipPdf}
                    handleExportHistory={handleExportHistory}
                    fmt={fmt}
                />
            )}

            <PayrollBulkModal 
                showBulkModal={showBulkModal} setShowBulkModal={setShowBulkModal}
                bulkLoading={bulkLoading} bulkResult={bulkResult}
                selectedPeriod={selectedPeriod} filteredRecapEmployees={filteredRecapEmployees}
                payslips={payslips} confirmBulk={confirmBulk} setTab={setTab}
            />

            <PayrollPayslipModal
                selected={selected} setSelected={setSelected}
                getEmpName={getEmpName} fmt={fmt}
                getItemsAllowances={getItemsAllowances} getItemsDeductions={getItemsDeductions}
                handlePayslipPdf={handlePayslipPdf}
            />
        </div>
    );
}

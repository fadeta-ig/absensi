import { CheckCircle2, AlertCircle, Zap, FileSpreadsheet, FileText } from "lucide-react";
import { Employee, Payslip } from "../types";

export interface PayrollRecapTabProps {
    filteredRecapEmployees: Employee[];
    payslips: Payslip[];
    selectedPeriod: string;
    overtimeRequests: { employeeId: string; date: string; overtimePay: number; status: string }[];
    fmt: (n: number) => string;
    handleBulkGenerate: () => void;
    handleExportRecapExcel: () => void;
    handleExportRecapPdf: () => void;
    handleProsesRecap: (e: Employee) => void;
}

export function PayrollRecapTab({
    filteredRecapEmployees,
    payslips,
    selectedPeriod,
    overtimeRequests,
    fmt,
    handleBulkGenerate,
    handleExportRecapExcel,
    handleExportRecapPdf,
    handleProsesRecap
}: PayrollRecapTabProps) {
    return (
        <div className="space-y-4">
            <div className="flex justify-end gap-2">
                <button onClick={handleBulkGenerate} className="btn btn-primary btn-sm" disabled={filteredRecapEmployees.length === 0}>
                    <Zap className="w-3.5 h-3.5" /> Generate Massal
                </button>
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
                                <th className="hidden lg:table-cell">Lembur</th>
                                <th className="hidden lg:table-cell">Potongan</th>
                                <th>Estimasi Bersih</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecapEmployees.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-8 text-sm text-[var(--text-muted)]">Data tidak ditemukan</td></tr>
                            ) : (
                                filteredRecapEmployees.map((e) => {
                                    const hasPayslip = payslips.some(p => p.employeeId === e.employeeId && p.period === selectedPeriod);
                                    const empAllowances = e.payrollComponents?.filter(pc => pc.component.type === "earning").reduce((s, pc) => s + pc.amount, 0) || 0;
                                    const empDeductions = e.payrollComponents?.filter(pc => pc.component.type === "deduction").reduce((s, pc) => s + pc.amount, 0) || 0;
                                    const empOvertime = overtimeRequests
                                        .filter(o => o.employeeId === e.employeeId && o.status === "approved" && o.date.startsWith(selectedPeriod))
                                        .reduce((sum, o) => sum + (o.overtimePay || 0), 0);
                                    const estNet = e.basicSalary + empAllowances + empOvertime - empDeductions;

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
                                            <td className="hidden lg:table-cell text-blue-600 font-medium">{empOvertime > 0 ? `+${fmt(empOvertime)}` : "-"}</td>
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
    );
}

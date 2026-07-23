import { useState } from "react";
import { FileText, Eye, Download, Trash2, FileSpreadsheet, Loader2 } from "lucide-react";
import { Payslip, Employee } from "../types";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

export interface PayrollHistoryTabProps {
    filteredHistoryPayslips: Payslip[];
    employees: Employee[];
    setPayslips: React.Dispatch<React.SetStateAction<Payslip[]>>;
    setSelected: (p: Payslip) => void;
    handlePayslipPdf: (p: Payslip) => void;
    handleExportHistory: () => void;
    fmt: (n: number) => string;
}

export function PayrollHistoryTab({
    filteredHistoryPayslips,
    employees,
    setPayslips,
    setSelected,
    handlePayslipPdf,
    handleExportHistory,
    fmt
}: PayrollHistoryTabProps) {
    const toast = useToast();
    const confirm = useConfirm();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const getEmpName = (empId: string) => employees.find((e) => e.employeeId === empId)?.name || empId;

    return (
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
                                                <button onClick={() => setSelected(p)} className="btn btn-ghost btn-sm !p-1.5 text-[var(--primary)]" title="Lihat Detail"><Eye className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => handlePayslipPdf(p)} className="btn btn-ghost btn-sm !p-1.5 text-red-600" title="Download PDF"><Download className="w-3.5 h-3.5" /></button>
                                                <button
                                                    onClick={() => {
                                                        confirm({
                                                            title: "Hapus slip gaji?",
                                                            message: `Slip gaji ${getEmpName(p.employeeId)} periode ${p.period} akan dihapus dari riwayat.`,
                                                            confirmLabel: "Hapus",
                                                            cancelLabel: "Batal",
                                                            variant: "danger",
                                                            onConfirm: async () => {
                                                                setDeletingId(p.id);
                                                                try {
                                                                    const res = await fetch(`/api/payslips?id=${p.id}`, { method: "DELETE" });
                                                                    if (!res.ok) {
                                                                        throw new Error(await getResponseErrorMessage(res, "Gagal menghapus slip gaji."));
                                                                    }
                                                                    setPayslips(prev => prev.filter(x => x.id !== p.id));
                                                                    toast("Slip gaji berhasil dihapus.", "success");
                                                                } catch (error) {
                                                                    reportClientError("PayrollHistoryTab", "Gagal menghapus slip gaji", error, { payslipId: p.id, employeeId: p.employeeId, period: p.period });
                                                                    toast(error instanceof Error ? error.message : "Gagal menghapus slip gaji.", "error");
                                                                } finally {
                                                                    setDeletingId(null);
                                                                }
                                                            },
                                                        });
                                                    }}
                                                    disabled={deletingId === p.id}
                                                    className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50"
                                                    title="Hapus Slip Gaji"
                                                >
                                                    {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                </button>
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
    );
}

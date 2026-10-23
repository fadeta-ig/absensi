"use client";

import { useEffect, useState } from "react";
import { FileText, Download, X, Eye, AlertCircle } from "lucide-react";
import { exportPayslipPdf } from "@/lib/export";
import { formatDisplayDate } from "@/lib/utils";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";

interface PayslipItem { type: "ALLOWANCE" | "DEDUCTION"; name: string; amount: number; }
interface Payslip {
    id: string; employeeId: string; period: string;
    basicSalary: number; items: PayslipItem[];
    overtime: number; netSalary: number; issuedDate: string; notes?: string;
}

export default function PayslipPage() {
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [selected, setSelected] = useState<Payslip | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);

    useEffect(() => {
        const loadPayslips = async () => {
            setLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/payslips");
                if (!res.ok) {
                    throw new Error(await getResponseErrorMessage(res, "Gagal memuat slip gaji."));
                }

                const data = await res.json();
                setPayslips(Array.isArray(data) ? data : []);
            } catch (err) {
                reportClientError("PayslipPage", "Gagal memuat slip gaji employee", err);
                setPayslips([]);
                setLoadError(err instanceof Error ? err.message : "Gagal memuat slip gaji.");
            } finally {
                setLoading(false);
            }
        };

        void loadPayslips();
    }, []);

    const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

    const allowances = (items: PayslipItem[]) => items.filter(i => i.type === "ALLOWANCE");
    const deductions = (items: PayslipItem[]) => items.filter(i => i.type === "DEDUCTION");

    const totalAllowances = (items: PayslipItem[]) => allowances(items).reduce((s, a) => s + a.amount, 0);
    const totalDeductions = (items: PayslipItem[]) => deductions(items).reduce((s, d) => s + d.amount, 0);

    const handleDownloadPdf = (p: Payslip) => {
        exportPayslipPdf({
            employeeId: p.employeeId,
            period: p.period,
            basicSalary: p.basicSalary,
            overtime: p.overtime,
            allowances: (p.items || []).filter(i => i.type === "ALLOWANCE"),
            deductions: (p.items || []).filter(i => i.type === "DEDUCTION"),
            netSalary: p.netSalary,
            issuedDate: p.issuedDate,
            notes: p.notes,
        });
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[var(--primary)]" />
                    Slip Gaji
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Riwayat slip gaji Anda</p>
            </div>

            {loading ? (
                <div className="space-y-3" role="status" aria-live="polite" aria-label="Memuat slip gaji">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="card p-5 space-y-2">
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-3 w-1/3" />
                        </div>
                    ))}
                </div>
            ) : loadError ? (
                <div className="card p-12 text-center">
                    <AlertCircle className="w-12 h-12 text-[var(--destructive)] opacity-60 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--destructive)]">{loadError}</p>
                </div>
            ) : payslips.length === 0 ? (
                <div className="card p-12 text-center">
                    <FileText className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada slip gaji</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Slip gaji akan muncul di sini setelah HR membuatnya</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {payslips.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((p) => (
                        <div key={p.id} className="card p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-[var(--text-primary)]">Periode: {p.period}</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-1">Diterbitkan: {formatDisplayDate(p.issuedDate)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-extrabold text-[var(--primary)]">{fmt(p.netSalary)}</p>
                                    <div className="flex items-center gap-1.5 mt-1 justify-end">
                                        <button onClick={() => setSelected(p)} className="btn btn-ghost btn-sm text-[var(--primary)]">
                                            <Eye className="w-3.5 h-3.5" /> Detail
                                        </button>
                                        <button onClick={() => handleDownloadPdf(p)} className="btn btn-ghost btn-sm text-red-600">
                                            <Download className="w-3.5 h-3.5" /> PDF
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    <DataTablePagination
                        currentPage={currentPage}
                        totalPages={Math.ceil(payslips.length / pageSize) || 1}
                        totalItems={payslips.length}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                        pageSizeOptions={[5, 10, 20]}
                        itemLabel="slip gaji"
                    />
                </div>
            )}

            {/* Detail Modal */}
            {selected && (
                <AccessibleModal ariaLabel={`Slip gaji ${selected.period}`} onClose={() => setSelected(null)}>
                        <div className="modal-header">
                            <h2 className="modal-title">Slip Gaji — {selected.period}</h2>
                            <button className="modal-close" onClick={() => setSelected(null)}><X className="w-4 h-4" /></button>
                        </div>

                        <div className="space-y-4">
                            {/* Company Header */}
                            <div className="text-center pb-4 border-b border-[var(--border)]">
                                <p className="text-sm font-bold text-[var(--text-primary)]">PT Wijaya Inovasi Gemilang</p>
                                <p className="text-xs text-[var(--text-muted)]">Slip Gaji Karyawan</p>
                            </div>

                            {/* Items */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm py-1.5">
                                    <span className="text-[var(--text-secondary)]">Gaji Pokok</span>
                                    <span className="font-semibold">{fmt(selected.basicSalary)}</span>
                                </div>

                                {/* Allowances */}
                                {allowances(selected.items || []).length > 0 && (
                                    <>
                                        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-3">Tunjangan</p>
                                        {allowances(selected.items).map((a, i) => (
                                            <div key={`a-${i}`} className="flex justify-between text-sm py-1 pl-3">
                                                <span className="text-[var(--text-secondary)]">{a.name}</span>
                                                <span className="font-medium text-green-600">+{fmt(a.amount)}</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between text-sm py-1 pl-3 border-t border-dashed border-[var(--border)]">
                                            <span className="text-[var(--text-secondary)] font-medium">Subtotal Tunjangan</span>
                                            <span className="font-semibold text-green-600">+{fmt(totalAllowances(selected.items))}</span>
                                        </div>
                                    </>
                                )}

                                {selected.overtime > 0 && (
                                    <div className="flex justify-between text-sm py-1.5">
                                        <span className="text-[var(--text-secondary)]">Lembur</span>
                                        <span className="font-medium text-green-600">+{fmt(selected.overtime)}</span>
                                    </div>
                                )}

                                {/* Deductions */}
                                {deductions(selected.items || []).length > 0 && (
                                    <>
                                        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mt-3">Potongan</p>
                                        {deductions(selected.items).map((d, i) => (
                                            <div key={`d-${i}`} className="flex justify-between text-sm py-1 pl-3">
                                                <span className="text-[var(--text-secondary)]">{d.name}</span>
                                                <span className="font-medium text-red-600">-{fmt(d.amount)}</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between text-sm py-1 pl-3 border-t border-dashed border-[var(--border)]">
                                            <span className="text-[var(--text-secondary)] font-medium">Subtotal Potongan</span>
                                            <span className="font-semibold text-red-600">-{fmt(totalDeductions(selected.items))}</span>
                                        </div>
                                    </>
                                )}

                                {/* Net */}
                                <div className="flex justify-between py-3 mt-3 border-t-2 border-[var(--primary)] bg-[var(--primary)]/5 px-3 rounded-lg">
                                    <span className="text-sm font-bold text-[var(--text-primary)]">Take Home Pay</span>
                                    <span className="text-lg font-extrabold text-[var(--primary)]">{fmt(selected.netSalary)}</span>
                                </div>

                                {selected.notes && (
                                    <div className="mt-3 p-3 bg-[var(--secondary)] rounded-lg">
                                        <p className="text-xs text-[var(--text-muted)]">Catatan:</p>
                                        <p className="text-sm text-[var(--text-secondary)] mt-1">{selected.notes}</p>
                                    </div>
                                )}
                            </div>

                            <button onClick={() => handleDownloadPdf(selected)} className="btn btn-primary w-full mt-4">
                                <Download className="w-4 h-4" /> Download PDF
                            </button>
                        </div>
                </AccessibleModal>
            )}
        </div>
    );
}

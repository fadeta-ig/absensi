"use client";

import { useEffect, useState } from "react";
import { FileText, Download, X, Eye } from "lucide-react";
import { exportPayslipPdf } from "@/lib/export";

interface PayslipItem { type: "ALLOWANCE" | "DEDUCTION"; name: string; amount: number; }
interface Payslip {
    id: string; employeeId: string; period: string;
    basicSalary: number; items: PayslipItem[];
    overtime: number; netSalary: number; issuedDate: string; notes?: string;
}

export default function PayslipPage() {
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [selected, setSelected] = useState<Payslip | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    useEffect(() => {
        fetch("/api/payslips").then((r) => r.json()).then((data) => {
            if (Array.isArray(data)) setPayslips(data);
        });
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

            {payslips.length === 0 ? (
                <div className="card p-12 text-center">
                    <FileText className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada slip gaji</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Slip gaji akan muncul di sini setelah HR membuatnya</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {payslips.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((p) => (
                        <div key={p.id} className="card p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-[var(--text-primary)]">Periode: {p.period}</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-1">Diterbitkan: {new Date(p.issuedDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
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

                    {payslips.length > ITEMS_PER_PAGE && (
                        <div className="flex justify-between items-center px-4 py-3 border-t border-[var(--border)] mt-4">
                            <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Prev</button>
                            <span className="text-xs font-medium text-[var(--text-muted)]">Halaman {currentPage} dari {Math.ceil(payslips.length / ITEMS_PER_PAGE) || 1}</span>
                            <button className="btn btn-secondary btn-sm" disabled={currentPage === (Math.ceil(payslips.length / ITEMS_PER_PAGE) || 1)} onClick={() => setCurrentPage(c => c + 1)}>Next</button>
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
                    </div>
                </div>
            )}
        </div>
    );
}

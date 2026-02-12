"use client";

import { useEffect, useState } from "react";
import { FileText, Eye, X, DollarSign, TrendingUp, TrendingDown, Banknote } from "lucide-react";

interface PayslipRecord {
    id: string;
    period: string;
    basicSalary: number;
    allowances: number;
    deductions: number;
    overtime: number;
    netSalary: number;
    issuedDate: string;
    notes?: string;
}

export default function PayslipPage() {
    const [payslips, setPayslips] = useState<PayslipRecord[]>([]);
    const [selected, setSelected] = useState<PayslipRecord | null>(null);

    useEffect(() => {
        fetch("/api/payslips").then((r) => r.json()).then(setPayslips);
    }, []);

    const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);

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
                    <Banknote className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada slip gaji</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Slip gaji akan muncul setelah HR menerbitkannya</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {payslips.map((p) => (
                        <div key={p.id} className="card p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-[var(--primary)]" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">Periode {p.period}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{p.issuedDate}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <p className="text-sm font-bold text-[var(--primary)] hidden sm:block">{fmt(p.netSalary)}</p>
                                <button onClick={() => setSelected(p)} className="btn btn-secondary btn-sm">
                                    <Eye className="w-3.5 h-3.5" /> Detail
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {selected && (
                <div className="modal-overlay" onClick={() => setSelected(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Slip Gaji — {selected.period}</h2>
                            <button className="modal-close" onClick={() => setSelected(null)}><X className="w-4 h-4" /></button>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                                <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><DollarSign className="w-4 h-4" /> Gaji Pokok</span>
                                <span className="text-sm font-semibold">{fmt(selected.basicSalary)}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                                <span className="flex items-center gap-2 text-sm text-green-600"><TrendingUp className="w-4 h-4" /> Tunjangan</span>
                                <span className="text-sm font-semibold text-green-600">+{fmt(selected.allowances)}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                                <span className="flex items-center gap-2 text-sm text-green-600"><TrendingUp className="w-4 h-4" /> Lembur</span>
                                <span className="text-sm font-semibold text-green-600">+{fmt(selected.overtime)}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                                <span className="flex items-center gap-2 text-sm text-red-600"><TrendingDown className="w-4 h-4" /> Potongan</span>
                                <span className="text-sm font-semibold text-red-600">-{fmt(selected.deductions)}</span>
                            </div>
                            <div className="flex items-center justify-between py-3 bg-[var(--primary)]/5 rounded-lg px-3">
                                <span className="text-sm font-bold text-[var(--text-primary)]">Gaji Bersih</span>
                                <span className="text-lg font-extrabold text-[var(--primary)]">{fmt(selected.netSalary)}</span>
                            </div>
                            {selected.notes && (
                                <p className="text-xs text-[var(--text-muted)] pt-2">Catatan: {selected.notes}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

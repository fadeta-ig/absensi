import { X, CheckCircle2, AlertCircle, Loader2, Zap, Download } from "lucide-react";
import { Employee, Payslip, PayslipItem } from "../types";

export interface BulkModalProps {
    showBulkModal: boolean;
    setShowBulkModal: (v: boolean) => void;
    bulkLoading: boolean;
    bulkResult: { created: number; skipped: number; message: string } | null;
    selectedPeriod: string;
    filteredRecapEmployees: Employee[];
    payslips: Payslip[];
    confirmBulk: () => void;
    setTab: (t: "history") => void;
}

export function PayrollBulkModal({
    showBulkModal, setShowBulkModal, bulkLoading, bulkResult,
    selectedPeriod, filteredRecapEmployees, payslips, confirmBulk, setTab
}: BulkModalProps) {
    if (!showBulkModal) return null;
    return (
        <div className="modal-overlay" onClick={() => { if (!bulkLoading) setShowBulkModal(false); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Generate Slip Gaji Massal</h2>
                    <button className="modal-close" onClick={() => setShowBulkModal(false)} disabled={bulkLoading}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-4">
                    {!bulkResult ? (
                        <>
                            <div className="bg-[var(--secondary)] rounded-xl p-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--text-secondary)]">Periode</span>
                                    <span className="font-bold text-[var(--text-primary)]">{selectedPeriod}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--text-secondary)]">Total Karyawan</span>
                                    <span className="font-bold text-[var(--text-primary)]">{filteredRecapEmployees.length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--text-secondary)]">Sudah Terbit</span>
                                    <span className="font-bold text-green-600">
                                        {filteredRecapEmployees.filter((e) => payslips.some((p) => p.employeeId === e.employeeId && p.period === selectedPeriod)).length}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm border-t border-[var(--border)] pt-2 mt-2">
                                    <span className="text-[var(--text-secondary)]">Akan Diproses</span>
                                    <span className="font-extrabold text-[var(--primary)]">
                                        {filteredRecapEmployees.filter((e) => !payslips.some((p) => p.employeeId === e.employeeId && p.period === selectedPeriod)).length}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700">
                                    Slip gaji akan dihitung otomatis dari gaji pokok, komponen payroll, dan lembur yang sudah disetujui. Karyawan yang sudah memiliki slip gaji untuk periode ini akan dilewati.
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button className="btn btn-secondary flex-1" onClick={() => setShowBulkModal(false)} disabled={bulkLoading}>Batal</button>
                                <button className="btn btn-primary flex-1" onClick={confirmBulk} disabled={bulkLoading}>
                                    {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    {bulkLoading ? "Memproses..." : "Generate Sekarang"}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={`flex items-center gap-3 p-4 rounded-xl ${bulkResult.created > 0 ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"}`}>
                                {bulkResult.created > 0 ? (
                                    <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                                ) : (
                                    <AlertCircle className="w-6 h-6 text-orange-600 shrink-0" />
                                )}
                                <div>
                                    <p className="text-sm font-bold text-[var(--text-primary)]">{bulkResult.message}</p>
                                    {bulkResult.created > 0 && (
                                        <p className="text-xs text-[var(--text-muted)] mt-1">
                                            {bulkResult.created} slip dibuat • {bulkResult.skipped} dilewati
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button className="btn btn-primary w-full" onClick={() => { setShowBulkModal(false); setTab("history"); }}>
                                Lihat Riwayat
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export interface PayslipModalProps {
    selected: Payslip | null;
    setSelected: (p: Payslip | null) => void;
    getEmpName: (id: string) => string;
    fmt: (n: number) => string;
    getItemsAllowances: (items: PayslipItem[] | undefined) => PayslipItem[];
    getItemsDeductions: (items: PayslipItem[] | undefined) => PayslipItem[];
    handlePayslipPdf: (p: Payslip) => void;
}

export function PayrollPayslipModal({
    selected, setSelected, getEmpName, fmt,
    getItemsAllowances, getItemsDeductions, handlePayslipPdf
}: PayslipModalProps) {
    if (!selected) return null;
    return (
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
                        {getItemsAllowances(selected.items).length > 0 && getItemsAllowances(selected.items).map((a, i) => (
                            <div key={`a-${i}`} className="flex justify-between text-sm py-1 pl-3">
                                <span className="text-[var(--text-secondary)]">{a.name}</span>
                                <span className="font-medium text-green-600">+{fmt(a.amount)}</span>
                            </div>
                        ))}
                        {selected.overtime > 0 && <div className="flex justify-between text-sm py-1.5"><span className="text-[var(--text-secondary)]">Lembur</span><span className="font-medium text-green-600">+{fmt(selected.overtime)}</span></div>}
                        {getItemsDeductions(selected.items).length > 0 && getItemsDeductions(selected.items).map((d, i) => (
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
    );
}

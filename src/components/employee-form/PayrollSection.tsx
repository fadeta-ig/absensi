import { Plus, Trash2, Wallet } from "lucide-react";
import { FormPayrollComponent, MasterPayrollComponent, FormState } from "./types";

interface Props {
    form: FormState;
    setForm: React.Dispatch<React.SetStateAction<FormState>>;
    masterPayroll: MasterPayrollComponent[];
    addPayrollComp: () => void;
    removePayrollComp: (idx: number) => void;
    updatePayrollComp: (idx: number, field: string, value: string | number) => void;
}

export function PayrollSection({
    form, setForm, masterPayroll, addPayrollComp, removePayrollComp, updatePayrollComp
}: Props) {
    return (
        <div className="card p-6 space-y-5 bg-blue-50/30 border-blue-100">
            <div className="flex items-center gap-2 pb-2 border-b border-blue-100">
                <Wallet className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">Pengaturan Payroll</h2>
            </div>

            <div className="form-group">
                <label className="form-label font-bold text-blue-800">Gaji Pokok (Std)</label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">Rp</span>
                    <input type="number" className="form-input pl-9 border-blue-200 focus:ring-blue-500" value={form.basicSalary || ""} onChange={(e) => setForm({ ...form, basicSalary: Number(e.target.value) })} placeholder="0" />
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-tight">Tunjangan & Potongan Tetap</h3>
                    <button type="button" onClick={addPayrollComp} className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline">
                        <Plus className="w-3 h-3" /> Tambah Item
                    </button>
                </div>

                <div className="space-y-3">
                    {form.payrollComponents.length === 0 ? (
                        <div className="text-center py-4 border-2 border-dashed border-[var(--border)] rounded-lg">
                            <p className="text-[10px] text-[var(--text-muted)] italic">Belum ada komponen tambahan</p>
                        </div>
                    ) : (
                        form.payrollComponents.map((c: FormPayrollComponent, i: number) => (
                            <div key={i} className="flex items-start gap-2 p-3 bg-[var(--card)] rounded-lg border border-blue-100 shadow-sm">
                                <div className="flex-1 space-y-2">
                                    <select
                                        className="form-select text-xs h-8 !py-0 border-none bg-[var(--secondary)]"
                                        value={c.componentId}
                                        onChange={(e) => updatePayrollComp(i, "componentId", e.target.value)}
                                    >
                                        {masterPayroll.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.type === "earning" ? "+" : "-"})</option>
                                        ))}
                                    </select>
                                    <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">Rp</span>
                                        <input
                                            type="number"
                                            className="form-input text-xs h-8 pl-7 border-none bg-[var(--secondary)]"
                                            value={c.amount || ""}
                                            onChange={(e) => updatePayrollComp(i, "amount", Number(e.target.value))}
                                        />
                                    </div>
                                </div>
                                <button type="button" onClick={() => removePayrollComp(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

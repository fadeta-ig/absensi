import { Mail, Phone, Users } from "lucide-react";

import { FormState } from "./types";

interface Props {
    form: FormState;
    setForm: React.Dispatch<React.SetStateAction<FormState>>;
}

export function IdentitySection({ form, setForm }: Props) {
    return (
        <div className="card p-6 space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
                <Users className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Identitas Pribadi</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label">ID Karyawan</label>
                    <input className="form-input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="ID25000001" required />
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label">Nama Lengkap</label>
                    <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama Lengkap" required />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label"><span className="flex items-center gap-1"><Mail className="w-3 h-3 text-[var(--text-muted)]" /> Email</span></label>
                    <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@company.com" required />
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label"><span className="flex items-center gap-1"><Phone className="w-3 h-3 text-[var(--text-muted)]" /> Telepon</span></label>
                    <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0812..." required />
                </div>
            </div>
        </div>
    );
}

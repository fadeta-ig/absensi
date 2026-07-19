import { Mail, Phone, Users } from "lucide-react";
import { FormState } from "./types";

interface Props {
    form: FormState;
    setForm: React.Dispatch<React.SetStateAction<FormState>>;
    isEdit?: boolean;
}

export function IdentitySection({ form, setForm, isEdit }: Props) {
    return (
        <div className="card p-6 space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
                <Users className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Identitas Dasar</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label">NIP / ID Karyawan</label>
                    <input className="form-input" value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} placeholder="ID-25020044" required disabled={isEdit} />
                    {isEdit && <p className="mt-1 text-[10px] text-[var(--text-muted)]">NIP tidak dapat diubah setelah registrasi karena digunakan oleh histori sistem.</p>}
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label">Nama Lengkap</label>
                    <input className="form-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nama lengkap sesuai identitas" required />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label">Gelar</label>
                    <input className="form-input" value={form.academicTitle} onChange={(event) => setForm({ ...form, academicTitle: event.target.value })} placeholder="Contoh: S.E." />
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label">Nama Panggilan</label>
                    <input className="form-input" value={form.preferredName} onChange={(event) => setForm({ ...form, preferredName: event.target.value })} placeholder="Nama panggilan" />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label"><span className="flex items-center gap-1"><Mail className="w-3 h-3 text-[var(--text-muted)]" /> Email</span></label>
                    <input type="email" className="form-input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="email@company.com" required />
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label">Jenis Kelamin</label>
                    <select className="form-select" value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value as FormState["gender"] })} required>
                        <option value="Laki-Laki">Laki-Laki</option>
                        <option value="Perempuan">Perempuan</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label"><span className="flex items-center gap-1"><Phone className="w-3 h-3 text-[var(--text-muted)]" /> Nomor HP Utama</span></label>
                    <input className="form-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="0812..." required />
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label">Nomor HP Lain</label>
                    <input className="form-input" value={form.alternatePhone} onChange={(event) => setForm({ ...form, alternatePhone: event.target.value })} placeholder="Opsional" />
                </div>
            </div>
        </div>
    );
}

import { CreditCard, HeartHandshake, MapPinned, ShieldCheck, UserRound } from "lucide-react";
import { FormState } from "./types";

interface Props {
    form: FormState;
    setForm: React.Dispatch<React.SetStateAction<FormState>>;
}

export function PrivateDataSection({ form, setForm }: Props) {
    const set = <K extends keyof FormState>(field: K, value: FormState[K]) => setForm((current) => ({ ...current, [field]: value }));

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-800">
                Data di bawah bersifat privat, hanya dapat diakses Super Admin HR dan Admin HR, serta setiap pembukaan detail dicatat pada audit log.
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="card p-6 space-y-4">
                    <SectionTitle icon={UserRound} title="Data Pribadi" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Tempat Lahir"><input className="form-input" value={form.birthPlace} onChange={(event) => set("birthPlace", event.target.value)} /></Field>
                        <Field label="Tanggal Lahir"><input type="date" className="form-input" value={form.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => set("birthDate", event.target.value)} /></Field>
                        <Field label="Status Pernikahan">
                            <select className="form-select" value={form.maritalStatus} onChange={(event) => set("maritalStatus", event.target.value)}>
                                <option value="">Pilih status</option><option>Belum Kawin</option><option>Kawin</option><option>Cerai Hidup</option><option>Cerai Mati</option>
                            </select>
                        </Field>
                        <Field label="Golongan Darah">
                            <select className="form-select" value={form.bloodType} onChange={(event) => set("bloodType", event.target.value)}>
                                <option value="">Tidak diketahui</option><option>A</option><option>B</option><option>AB</option><option>O</option>
                            </select>
                        </Field>
                        <Field label="Agama"><input className="form-input" value={form.religion} onChange={(event) => set("religion", event.target.value)} placeholder="Contoh: Islam" /></Field>
                        <Field label="Pendidikan Terakhir"><input className="form-input" value={form.lastEducation} onChange={(event) => set("lastEducation", event.target.value)} placeholder="Contoh: S1" /></Field>
                    </div>
                </section>

                <section className="card p-6 space-y-4">
                    <SectionTitle icon={ShieldCheck} title="Nomor Identitas" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SensitiveField label="No. KTP / NIK" value={form.nationalId} onChange={(value) => set("nationalId", value)} />
                        <SensitiveField label="No. Kartu Keluarga" value={form.familyCardNumber} onChange={(value) => set("familyCardNumber", value)} />
                        <SensitiveField label="No. KPJ / BPJS TK" value={form.bpjsEmploymentNumber} onChange={(value) => set("bpjsEmploymentNumber", value)} />
                        <SensitiveField label="No. JKN-KIS / BPJS Kesehatan" value={form.bpjsHealthNumber} onChange={(value) => set("bpjsHealthNumber", value)} />
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)]">Nomor disimpan terenkripsi dan diperlakukan sebagai teks agar angka nol di depan tidak hilang.</p>
                </section>

                <section className="card p-6 space-y-4">
                    <SectionTitle icon={MapPinned} title="Alamat" />
                    <Field label="Alamat sesuai KTP"><textarea className="form-textarea" rows={3} value={form.idCardAddress} onChange={(event) => set("idCardAddress", event.target.value)} /></Field>
                    <Field label="Alamat Domisili"><textarea className="form-textarea" rows={3} value={form.domicileAddress} onChange={(event) => set("domicileAddress", event.target.value)} /></Field>
                </section>

                <section className="card p-6 space-y-4">
                    <SectionTitle icon={HeartHandshake} title="Kontak Darurat" />
                    <Field label="Nama Kerabat"><input className="form-input" value={form.emergencyContactName} onChange={(event) => set("emergencyContactName", event.target.value)} /></Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Hubungan"><input className="form-input" value={form.emergencyContactRelationship} onChange={(event) => set("emergencyContactRelationship", event.target.value)} placeholder="Orang tua/Pasangan/Saudara" /></Field>
                        <Field label="Nomor HP"><input className="form-input" value={form.emergencyContactPhone} onChange={(event) => set("emergencyContactPhone", event.target.value)} /></Field>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)]">Jika salah satu diisi, ketiga data kontak darurat wajib lengkap.</p>
                </section>

                <section className="card p-6 space-y-4">
                    <SectionTitle icon={CreditCard} title="Rekening & Pajak" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Nama Bank"><input className="form-input" value={form.bankName} onChange={(event) => set("bankName", event.target.value)} placeholder="Bank apa saja" /></Field>
                        <SensitiveField label="Nomor Rekening" value={form.bankAccountNumber} onChange={(value) => set("bankAccountNumber", value)} />
                    </div>
                    <Field label="Nama Pemilik Rekening"><input className="form-input" value={form.bankAccountHolderName} onChange={(event) => set("bankAccountHolderName", event.target.value)} /></Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Status PTKP">
                            <select className="form-select" value={form.ptkpStatus} onChange={(event) => set("ptkpStatus", event.target.value)}>
                                <option value="">Belum diisi</option>{["TK", "K/0", "K/1", "K/2", "K/3", "TK/1", "TK/2", "TK/3"].map((value) => <option key={value}>{value}</option>)}
                            </select>
                        </Field>
                        <Field label="Tanggal Berlaku PTKP"><input type="date" className="form-input" value={form.ptkpEffectiveDate} onChange={(event) => set("ptkpEffectiveDate", event.target.value)} required={Boolean(form.ptkpStatus)} /></Field>
                    </div>
                </section>

                <section className="card p-6 space-y-4">
                    <SectionTitle icon={ShieldCheck} title="Catatan HR" />
                    <Field label="Keterangan"><textarea className="form-textarea" rows={8} value={form.notes} onChange={(event) => set("notes", event.target.value)} maxLength={5000} /></Field>
                </section>
            </div>
        </div>
    );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof UserRound; title: string }) {
    return <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2"><Icon className="h-4 w-4 text-[var(--primary)]" /><h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">{title}</h2></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div className="form-group !mb-0"><label className="form-label">{label}</label>{children}</div>;
}

function SensitiveField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return <Field label={label}><input className="form-input font-mono" value={value} onChange={(event) => onChange(event.target.value)} inputMode="numeric" autoComplete="off" /></Field>;
}

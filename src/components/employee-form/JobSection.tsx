import { Briefcase, Building, Calendar, Clock, Layers, UserCog } from "lucide-react";
import { Division, Department, Position, WorkShift, FormState } from "./types";
import { Employee } from "@/types";

interface Props {
    form: FormState;
    setForm: React.Dispatch<React.SetStateAction<FormState>>;
    masterDivisions: Division[];
    availableDepartments: Department[];
    masterPositions: Position[];
    allEmployees: { employeeId: string; name: string }[];
    shifts: WorkShift[];
    initialData?: Partial<Employee>;
}

export function JobSection({
    form, setForm, masterDivisions, availableDepartments,
    masterPositions, allEmployees, shifts, initialData
}: Props) {
    return (
        <div className="card p-6 space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
                <Briefcase className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Data Pekerjaan</h2>
            </div>

            <div className="grid grid-cols-1 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label"><span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Divisi</span></label>
                    <select className="form-select" value={form.divisionId} onChange={(e) => setForm({ ...form, divisionId: e.target.value, departmentId: "" })} required>
                        <option value="">Pilih Divisi</option>
                        {masterDivisions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label"><span className="flex items-center gap-1"><Building className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Departemen</span></label>
                    <select className="form-select" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} required disabled={!form.divisionId}>
                        <option value="">Pilih Departemen</option>
                        {availableDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label">Jabatan</label>
                    <select className="form-select" value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value, managerId: "" })} required>
                        <option value="">Pilih Jabatan</option>
                        {masterPositions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label"><span className="flex items-center gap-1"><UserCog className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Atasan Langsung</span></label>
                    <select className="form-select" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                        <option value="">Tidak Ada / Langsung ke CEO</option>
                        {allEmployees
                            .filter(e => e.employeeId !== (initialData?.employeeId || ""))
                            .map(e => <option key={e.employeeId} value={e.employeeId}>{e.name} ({e.employeeId})</option>)
                        }
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label"><span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[var(--text-muted)]" /> Shift Kerja</span></label>
                    <select className="form-select" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })} required>
                        <option value="">Pilih Shift</option>
                        {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label"><span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-[var(--text-muted)]" /> Tanggal Bergabung</span></label>
                    <input type="date" className="form-input" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} required />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group !mb-0">
                    <label className="form-label">Jatah Cuti / Tahun</label>
                    <input type="number" className="form-input" value={form.totalLeave} onChange={(e) => setForm({ ...form, totalLeave: Number(e.target.value) })} />
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-700">
                    Status aktif/nonaktif dikelola dari halaman Manajemen Karyawan agar alasan dan riwayatnya tercatat.
                </div>
            </div>
        </div>
    );
}

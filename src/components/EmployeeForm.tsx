"use client";

import { useEffect, useState } from "react";
import {
    Users, Mail, Phone, Building, Briefcase, Calendar,
    Clock, Layers, MapPin, Wallet, Plus, Trash2,
    Loader2, Check, ArrowLeft
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Employee, EmployeePayrollComponent } from "@/types";

interface ShiftDay { dayOfWeek: number; startTime: string; endTime: string; isOff: boolean; }
interface WorkShift { id: string; name: string; isDefault: boolean; days: ShiftDay[]; }
interface Location { id: string; name: string; }
interface Department { id: string; name: string; }
interface Division { id: string; name: string; departmentId: string; department: { name: string } }
interface Position { id: string; name: string; }
interface MasterPayrollComponent { id: string; name: string; type: "allowance" | "deduction"; defaultAmount: number; isActive: boolean; }

interface Props {
    initialData?: Partial<Employee>;
    isEdit?: boolean;
}

export default function EmployeeForm({ initialData, isEdit }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);

    // Master data states
    const [shifts, setShifts] = useState<WorkShift[]>([]);
    const [masterDepts, setMasterDepts] = useState<Department[]>([]);
    const [masterDivisions, setMasterDivisions] = useState<Division[]>([]);
    const [masterPositions, setMasterPositions] = useState<Position[]>([]);
    const [masterLocations, setMasterLocations] = useState<Location[]>([]);
    const [masterPayroll, setMasterPayroll] = useState<MasterPayrollComponent[]>([]);

    const [form, setForm] = useState({
        employeeId: initialData?.employeeId || "",
        name: initialData?.name || "",
        email: initialData?.email || "",
        phone: initialData?.phone || "",
        department: initialData?.department || "",
        division: initialData?.division || "",
        position: initialData?.position || "",
        role: (initialData?.role || "employee") as "employee" | "hr",
        joinDate: initialData?.joinDate || new Date().toISOString().split("T")[0],
        totalLeave: initialData?.totalLeave ?? 12,
        usedLeave: initialData?.usedLeave ?? 0,
        isActive: initialData?.isActive ?? true,
        shiftId: initialData?.shiftId || "",
        bypassLocation: initialData?.bypassLocation || false,
        locations: initialData?.locations || [] as { id: string; name: string }[],
        basicSalary: initialData?.basicSalary || 0,
        payrollComponents: initialData?.payrollComponents || [] as any[],
    });

    useEffect(() => {
        const load = async () => {
            try {
                const [d, v, p, l, s, m] = await Promise.all([
                    fetch("/api/master/departments").then(r => r.json()),
                    fetch("/api/master/divisions").then(r => r.json()),
                    fetch("/api/master/positions").then(r => r.json()),
                    fetch("/api/master/locations").then(r => r.json()),
                    fetch("/api/shifts").then(r => r.json()),
                    fetch("/api/master/payroll-components").then(r => r.json()),
                ]);
                setMasterDepts(d);
                setMasterDivisions(v);
                setMasterPositions(p);
                setMasterLocations(l);
                setShifts(s);
                setMasterPayroll(m);

                // Set default shift if creating new
                if (!isEdit && !form.shiftId) {
                    const def = s.find((x: any) => x.isDefault);
                    if (def) setForm(f => ({ ...f, shiftId: def.id }));
                }

                // Initialize payroll components if creating new
                if (!isEdit && form.payrollComponents.length === 0) {
                    const comps = m.filter((x: any) => x.isActive).map((x: any) => ({
                        componentId: x.id,
                        amount: x.defaultAmount,
                        component: x
                    }));
                    setForm(f => ({ ...f, payrollComponents: comps }));
                }
            } catch (err) {
                console.error("Failed to load master data", err);
            } finally {
                setFetching(false);
            }
        };
        load();
    }, [isEdit]);

    const availableDivisions = masterDivisions.filter(v =>
        form.department ? v.department.name === form.department : false
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const method = isEdit ? "PUT" : "POST";
            const body = isEdit ? { ...form, id: initialData?.id } : form;
            const res = await fetch("/api/employees", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                router.push("/dashboard/employees");
                router.refresh();
            } else {
                const error = await res.json();
                alert(error.error || "Gagal menyimpan data");
            }
        } catch (err) {
            alert("Kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };

    const toggleLocation = (loc: Location) => {
        const exists = form.locations.find(l => l.id === loc.id);
        if (exists) {
            setForm({ ...form, locations: form.locations.filter(l => l.id !== loc.id) });
        } else {
            setForm({ ...form, locations: [...form.locations, { id: loc.id, name: loc.name }] });
        }
    };

    const addPayrollComp = () => {
        const first = masterPayroll.find(p => !form.payrollComponents.some(c => c.componentId === p.id));
        if (!first) return;
        setForm({
            ...form,
            payrollComponents: [...form.payrollComponents, { componentId: first.id, amount: first.defaultAmount, component: first }]
        });
    };

    const removePayrollComp = (idx: number) => {
        setForm({
            ...form,
            payrollComponents: form.payrollComponents.filter((_, i) => i !== idx)
        });
    };

    const updatePayrollComp = (idx: number, field: string, value: any) => {
        const next = [...form.payrollComponents];
        if (field === "componentId") {
            const comp = masterPayroll.find(p => p.id === value);
            next[idx] = { ...next[idx], componentId: value, amount: comp?.defaultAmount || 0, component: comp };
        } else {
            next[idx] = { ...next[idx], [field]: value };
        }
        setForm({ ...form, payrollComponents: next });
    };

    if (fetching) return (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)] animate-pulse">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm font-medium">Memuat data...</p>
        </div>
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-8 pb-10 max-w-5xl mx-auto">
            <div className="flex items-center justify-between sticky top-0 bg-[var(--background)]/80 backdrop-blur-sm z-10 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-[var(--text-primary)]">{isEdit ? "Edit Karyawan" : "Tambah Karyawan Baru"}</h1>
                        <p className="text-xs text-[var(--text-muted)]">Pastikan data diisi dengan benar untuk keperluan payroll.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => router.back()} className="btn btn-secondary">Batal</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {isEdit ? "Simpan Perubahan" : "Simpan Karyawan"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column (Identity & Job) */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Identity Section */}
                    <div className="card p-6 space-y-5">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                            <Users className="w-4 h-4 text-[var(--primary)]" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Identitas Pribadi</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group !mb-0">
                                <label className="form-label">ID Karyawan</label>
                                <input className="form-input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="WIG001" required />
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label">Nama Lengkap</label>
                                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama Lengkap" required />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group !mb-0">
                                <label className="form-label"><span className="flex items-center gap-1"><Mail className="w-3 h-3 text-slate-400" /> Email</span></label>
                                <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@company.com" required />
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label"><span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> Telepon</span></label>
                                <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0812..." required />
                            </div>
                        </div>
                    </div>

                    {/* Job Details Section */}
                    <div className="card p-6 space-y-5">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                            <Briefcase className="w-4 h-4 text-[var(--primary)]" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Pekerjaan & Akses</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group !mb-0">
                                <label className="form-label"><span className="flex items-center gap-1"><Building className="w-3 h-3 text-slate-400" /> Departemen</span></label>
                                <select className="form-select" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value, division: "" })} required>
                                    <option value="">Pilih Departemen</option>
                                    {masterDepts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label"><span className="flex items-center gap-1"><Layers className="w-3 h-3 text-slate-400" /> Divisi</span></label>
                                <select className="form-select" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} required disabled={!form.department}>
                                    <option value="">Pilih Divisi</option>
                                    {availableDivisions.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group !mb-0">
                                <label className="form-label">Jabatan</label>
                                <select className="form-select" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} required>
                                    <option value="">Pilih Jabatan</option>
                                    {masterPositions.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label">Role Sistem</label>
                                <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
                                    <option value="employee">Employee (User)</option>
                                    <option value="hr">HR (Manager)</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group !mb-0">
                                <label className="form-label"><span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" /> Shift Kerja</span></label>
                                <select className="form-select" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })} required>
                                    <option value="">Pilih Shift</option>
                                    {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label"><span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-400" /> Tanggal Bergabung</span></label>
                                <input type="date" className="form-input" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} required />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group !mb-0">
                                <label className="form-label">Jatah Cuti / Tahun</label>
                                <input type="number" className="form-input" value={form.totalLeave} onChange={(e) => setForm({ ...form, totalLeave: Number(e.target.value) })} />
                            </div>
                            <div className="flex items-end pb-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 rounded text-[var(--primary)]" />
                                    <span className="text-sm font-medium">Karyawan Aktif</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column (Payroll & Locations) */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Payroll Section */}
                    <div className="card p-6 space-y-5 bg-blue-50/30 border-blue-100">
                        <div className="flex items-center gap-2 pb-2 border-b border-blue-100">
                            <Wallet className="w-4 h-4 text-blue-600" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">Pengaturan Payroll</h2>
                        </div>

                        <div className="form-group">
                            <label className="form-label font-bold text-blue-800">Gaji Pokok (Std)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                                <input type="number" className="form-input pl-9 border-blue-200 focus:ring-blue-500" value={form.basicSalary || ""} onChange={(e) => setForm({ ...form, basicSalary: Number(e.target.value) })} placeholder="0" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-tight">Tunjangan & Potongan Tetap</h3>
                                <button type="button" onClick={addPayrollComp} className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline">
                                    <Plus className="w-3 h-3" /> Tambah Item
                                </button>
                            </div>

                            <div className="space-y-3">
                                {form.payrollComponents.length === 0 ? (
                                    <div className="text-center py-4 border-2 border-dashed border-slate-200 rounded-lg">
                                        <p className="text-[10px] text-slate-400 italic">Belum ada komponen tambahan</p>
                                    </div>
                                ) : (
                                    form.payrollComponents.map((c, i) => (
                                        <div key={i} className="flex items-start gap-2 p-3 bg-white rounded-lg border border-blue-100 shadow-sm">
                                            <div className="flex-1 space-y-2">
                                                <select
                                                    className="form-select text-xs h-8 !py-0 border-none bg-slate-50"
                                                    value={c.componentId}
                                                    onChange={(e) => updatePayrollComp(i, "componentId", e.target.value)}
                                                >
                                                    {masterPayroll.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name} ({p.type === "allowance" ? "+" : "-"})</option>
                                                    ))}
                                                </select>
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">Rp</span>
                                                    <input
                                                        type="number"
                                                        className="form-input text-xs h-8 pl-7 border-none bg-slate-50"
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

                    {/* Location Section */}
                    <div className="card p-6 space-y-5">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-orange-600" />
                                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Lokasi Absensi</h2>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={form.bypassLocation} onChange={(e) => setForm({ ...form, bypassLocation: e.target.checked })} className="w-3.5 h-3.5 rounded text-orange-600" />
                                <span className="text-xs font-semibold text-orange-700">Bypass</span>
                            </label>
                        </div>

                        {!form.bypassLocation && (
                            <div className="space-y-3">
                                <p className="text-[10px] text-[var(--text-muted)] italic leading-relaxed">Pilih satu atau beberapa lokasi kerja untuk karyawan ini.</p>
                                <div className="grid grid-cols-1 gap-2">
                                    {masterLocations.map(loc => {
                                        const isSelected = form.locations.some(l => l.id === loc.id);
                                        return (
                                            <button
                                                key={loc.id}
                                                type="button"
                                                onClick={() => toggleLocation(loc)}
                                                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${isSelected ? "border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--text-primary)]" : "border-slate-100 hover:border-slate-200 text-slate-600"}`}
                                            >
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-[var(--primary)] border-[var(--primary)] text-white" : "border-slate-300"}`}>
                                                    {isSelected && <Check className="w-2.5 h-2.5" />}
                                                </div>
                                                <span className="text-xs font-medium">{loc.name}</span>
                                            </button>
                                        );
                                    })}
                                    {masterLocations.length === 0 && (
                                        <p className="text-xs text-red-500 font-medium py-2">Belum ada data lokasi di Master Data.</p>
                                    )}
                                </div>
                            </div>
                        )}
                        {form.bypassLocation && (
                            <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 text-center">
                                <p className="text-xs text-orange-800 font-medium">Bypass aktif: Karyawan dapat absen dari mana saja.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </form>
    );
}

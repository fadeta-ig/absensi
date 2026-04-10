"use client";

import { useEffect, useState } from "react";
import { Users, Plus, Search, Pencil, Trash2, X, Loader2, Clock, Mail, Phone, Building, Briefcase, Calendar, Key, Layers, Upload } from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";
import BulkImportModal from "@/components/BulkImportModal";

interface ShiftDay { dayOfWeek: number; startTime: string; endTime: string; isOff: boolean; }
interface WorkShift { id: string; name: string; isDefault: boolean; days: ShiftDay[]; }
interface Employee {
    id: string; employeeId: string; name: string; email: string; phone: string;
    department: string; division?: string | null; position: string; role: string; isActive: boolean; joinDate: string; shiftId?: string;
    bypassLocation: boolean; locations?: { id: string; name: string }[];
}

export default function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [shifts, setShifts] = useState<WorkShift[]>([]);
    const [search, setSearch] = useState("");
    const [sendingPassword, setSendingPassword] = useState<string | null>(null);
    const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);

    const DAY_LABELS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
        fetch("/api/shifts").then((r) => r.json()).then((data: WorkShift[]) => {
            setShifts(data);
        });
    }, []);

    const filtered = employees.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
        e.department.toLowerCase().includes(search.toLowerCase()) ||
        (e.division && e.division.toLowerCase().includes(search.toLowerCase()))
    );

    const getShiftName = (sId?: string) => {
        if (!sId) return "-";
        const s = shifts.find((sh) => sh.id === sId);
        if (!s) return "-";
        const workDays = s.days.filter((d) => !d.isOff);
        if (workDays.length === 0) return s.name;
        const firstDay = workDays[0];
        return `${s.name} (${firstDay.startTime}-${firstDay.endTime})`;
    };

    const getShiftDaysSummary = (sId?: string) => {
        if (!sId) return "-";
        const s = shifts.find((sh) => sh.id === sId);
        if (!s) return "-";
        const workDayNums = s.days.filter((d) => !d.isOff).map((d) => d.dayOfWeek);
        if (workDayNums.length === 0) return "Tidak ada hari kerja";
        if (workDayNums.length === 7) return "Setiap Hari";
        return workDayNums.map((d) => DAY_LABELS_SHORT[d]).join(", ");
    };

    const handleEdit = (emp: Employee) => {
        window.location.href = `/dashboard/employees/${emp.id}/edit`;
    };

    const confirm = useConfirm();

    const handleDelete = async (id: string) => {
        confirm({
            title: "Hapus Karyawan",
            message: "Yakin ingin menghapus karyawan ini? Data tidak dapat dikembalikan.",
            variant: "danger",
            confirmLabel: "Ya, Hapus",
            onConfirm: async () => {
                const res = await fetch(`/api/employees?id=${id}`, { method: "DELETE" });
                if (res.ok) setEmployees((prev) => prev.filter((e) => e.id !== id));
            },
        });
    };

    const handleSendPassword = async (emp: Employee) => {
        confirm({
            title: "Kirim Password",
            message: `Kirim password baru ke email ${emp.name}?`,
            variant: "warning",
            confirmLabel: "Kirim",
            onConfirm: async () => {
                setSendingPassword(emp.id);
                setPasswordMsg(null);
                try {
                    const res = await fetch("/api/auth/send-password", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ employeeId: emp.employeeId }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                        setPasswordMsg({ type: "success", text: data.message });
                    } else {
                        setPasswordMsg({ type: "error", text: data.error || "Gagal mengirim password" });
                    }
                } catch {
                    setPasswordMsg({ type: "error", text: "Terjadi kesalahan koneksi" });
                }
                setSendingPassword(null);
            },
        });
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Users className="w-5 h-5 text-[var(--primary)]" />
                        Manajemen Karyawan
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">{employees.length} karyawan terdaftar</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="btn btn-secondary border border-[var(--border)]" onClick={() => setShowImportModal(true)}>
                        <Upload className="w-4 h-4 text-[var(--text-muted)]" /> Import Massal
                    </button>
                    <button className="btn btn-primary" onClick={() => window.location.href = "/dashboard/employees/create"}>
                        <Plus className="w-4 h-4" /> Tambah Karyawan
                    </button>
                </div>
            </div>

            {/* Password Message */}
            {passwordMsg && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${passwordMsg.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {passwordMsg.text}
                    <button onClick={() => setPasswordMsg(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input type="text" className="form-input pl-10" placeholder="Cari nama, ID, departemen, atau divisi..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nama</th>
                                <th className="hidden md:table-cell">Dept / Divisi</th>
                                <th>Jabatan</th>
                                <th className="hidden lg:table-cell">Lokasi</th>
                                <th className="hidden lg:table-cell">Jam Kerja</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada karyawan ditemukan</td></tr>
                            ) : (
                                filtered.map((e) => (
                                    <tr key={e.id}>
                                        <td className="font-mono text-xs">{e.employeeId}</td>
                                        <td className="font-medium text-[var(--text-primary)]">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{e.name.charAt(0)}</div>
                                                <div>
                                                    <p>{e.name}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)] md:hidden">{e.department} {e.division ? `/ ${e.division}` : ""}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="hidden md:table-cell">
                                            <div className="text-sm">{e.department}</div>
                                            {e.division && <div className="text-[10px] text-[var(--text-muted)]">{e.division}</div>}
                                        </td>
                                        <td className="hidden lg:table-cell">{e.position}</td>
                                        <td className="hidden lg:table-cell">
                                            {e.bypassLocation ? (
                                                <span className="text-[10px] text-blue-600 font-medium">Bypass</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {e.locations && e.locations.length > 0 ? (
                                                        e.locations.map(l => (
                                                            <span key={l.id} className="text-[10px] px-1.5 py-0.5 bg-[var(--secondary)] rounded text-[var(--text-secondary)]">
                                                                {l.name}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-[10px] text-red-500 font-medium">Belum diset</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="hidden lg:table-cell text-xs">
                                            <div>{getShiftName(e.shiftId)}</div>
                                            <div className="text-[10px] text-[var(--text-muted)]">{getShiftDaysSummary(e.shiftId)}</div>
                                        </td>
                                        <td><span className={`badge ${e.isActive ? "badge-success" : "badge-error"}`}>{e.isActive ? "Aktif" : "Nonaktif"}</span></td>
                                        <td>
                                            <div className="flex items-center gap-1.5">
                                                {e.role === "employee" && e.isActive && (
                                                    <button
                                                        onClick={() => handleSendPassword(e)}
                                                        className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:!bg-blue-50"
                                                        disabled={sendingPassword === e.id}
                                                        title="Kirim Password via Email"
                                                    >
                                                        {sendingPassword === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => window.location.href = `/dashboard/employees/${e.id}/360-view`}
                                                    className="btn btn-ghost btn-sm !p-1.5 text-emerald-600 hover:!bg-emerald-50"
                                                    title="Lihat Profil 360°"
                                                >
                                                    <Layers className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => handleEdit(e)} className="btn btn-ghost btn-sm !p-1.5"><Pencil className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => handleDelete(e.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <BulkImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImportComplete={() => {
                    // Refetch employees after successful import
                    fetch("/api/employees").then((r) => r.json()).then(setEmployees);
                }}
            />
        </div>
    );
}

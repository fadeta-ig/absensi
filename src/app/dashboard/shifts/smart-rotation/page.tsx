"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertCircle,
    CalendarClock,
    Camera,
    CheckCircle2,
    Clock,
    Loader2,
    Lock,
    Search,
    ShieldCheck,
    Sparkles,
    Sun,
    Sunrise,
    Moon,
    Trash2,
    UserPlus,
    Users,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { mapToThreeSmartShifts, type SmartShiftDefinition } from "@/lib/services/smartShiftResolver";

interface SmartShiftParticipant {
    employeeId: string;
    name: string;
    department: string;
    division: string;
    position: string;
    isActive: boolean;
}

interface EmployeeOption {
    employeeId: string;
    name: string;
    department?: string;
    division?: string;
    position?: string;
    isActive?: boolean;
}

function parseMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}

function formatMinutes(total: number): string {
    const norm = ((total % 1440) + 1440) % 1440;
    const h = Math.floor(norm / 60);
    const m = norm % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function calcDurationLabel(start: string, end: string): string {
    let diff = parseMinutes(end) - parseMinutes(start);
    if (diff < 0) diff += 24 * 60;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return mins > 0 ? `${hours}j ${mins}m` : `${hours} jam`;
}

const CARD_STYLES = {
    1: {
        icon: Sunrise,
        accentClass: "border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20",
        badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    },
    2: {
        icon: Sun,
        accentClass: "border-sky-200 dark:border-sky-800/70 bg-sky-50/50 dark:bg-sky-950/20",
        badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800",
    },
    3: {
        icon: Moon,
        accentClass: "border-violet-200 dark:border-violet-800/70 bg-violet-50/50 dark:bg-violet-950/20",
        badgeClass: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200 dark:border-violet-800",
    },
} as const;

export default function SmartShiftRotationPage() {
    const confirm = useConfirm();
    const toast = useToast();

    const [smartEmployeeIds, setSmartEmployeeIds] = useState<string[]>([]);
    const [smartEmployees, setSmartEmployees] = useState<SmartShiftParticipant[]>([]);
    const [threeShifts, setThreeShifts] = useState<[SmartShiftDefinition, SmartShiftDefinition, SmartShiftDefinition]>(() =>
        mapToThreeSmartShifts([])
    );
    const [canManage, setCanManage] = useState(false);
    const [allEmployees, setAllEmployees] = useState<EmployeeOption[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [initialLoading, setInitialLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [actionError, setActionError] = useState("");

    useEffect(() => {
        const loadData = async () => {
            setInitialLoading(true);
            setLoadError("");
            try {
                const [res, shiftsRes] = await Promise.all([
                    fetch("/api/shifts/smart-rotation", { cache: "no-store" }),
                    fetch("/api/shifts", { cache: "no-store" }).catch(() => null),
                ]);
                if (!res.ok) {
                    throw new Error(await getResponseErrorMessage(res, "Gagal memuat data Rotasi 3-Shift Otomatis."));
                }
                const data = await res.json();
                setSmartEmployeeIds(Array.isArray(data.employeeIds) ? data.employeeIds : []);
                setSmartEmployees(Array.isArray(data.employees) ? data.employees : []);
                const allowed = data.canManage === true;
                setCanManage(allowed);

                if (shiftsRes && shiftsRes.ok) {
                    const shiftsData = await shiftsRes.json();
                    if (Array.isArray(shiftsData)) {
                        setThreeShifts(mapToThreeSmartShifts(shiftsData));
                    }
                }

                if (allowed) {
                    const empRes = await fetch("/api/employees");
                    if (empRes.ok) {
                        const empData = await empRes.json();
                        if (Array.isArray(empData)) setAllEmployees(empData);
                    }
                }
            } catch (error) {
                reportClientError("SmartShiftRotationPage", "Gagal memuat data Rotasi 3-Shift Otomatis", error);
                const message = error instanceof Error ? error.message : "Gagal memuat data Rotasi 3-Shift Otomatis.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setInitialLoading(false);
            }
        };

        void loadData();
    }, [toast]);

    const dynamicShiftCards = useMemo(() => {
        return threeShifts.map((shift, idx) => {
            const nextShift = threeShifts[(idx + 1) % 3];
            const mon = shift.days.find((d) => d.dayOfWeek === 1) ?? shift.days[1];
            const sat = shift.days.find((d) => d.dayOfWeek === 6) ?? shift.days[6];
            const nextMon = nextShift.days.find((d) => d.dayOfWeek === 1) ?? nextShift.days[1];
            const nextSat = nextShift.days.find((d) => d.dayOfWeek === 6) ?? nextShift.days[6];

            const earlyIn = shift.tolerance.earlyCheckIn ?? 120;
            const lateIn = shift.tolerance.lateCheckIn ?? 0;
            const nextEarlyIn = nextShift.tolerance.earlyCheckIn ?? 120;

            const monOpen = Math.max(0, parseMinutes(mon.startTime) - earlyIn);
            const monClose = Math.max(0, parseMinutes(nextMon.startTime) - nextEarlyIn - 1);
            const satOpen = Math.max(0, parseMinutes(sat.startTime) - earlyIn);
            const satIsOvernight = parseMinutes(sat.endTime) < parseMinutes(sat.startTime);
            const satClose =
                shift.shiftNumber === 3 && !satIsOvernight
                    ? parseMinutes(sat.endTime)
                    : Math.max(0, parseMinutes(nextSat.startTime) - nextEarlyIn - 1);

            const monOvernight = parseMinutes(mon.endTime) < parseMinutes(mon.startTime);
            const monDeadline = formatMinutes(parseMinutes(mon.startTime) + lateIn);
            const satDeadline = formatMinutes(parseMinutes(sat.startTime) + lateIn);

            return {
                shift,
                weekdayHours: mon.isOff
                    ? "Libur"
                    : `${mon.startTime} – ${mon.endTime} WIB (${monOvernight ? "+1 hari, " : ""}${calcDurationLabel(mon.startTime, mon.endTime)})`,
                saturdayHours: sat.isOff
                    ? "Libur"
                    : `${sat.startTime} – ${sat.endTime} WIB (${calcDurationLabel(sat.startTime, sat.endTime)})`,
                weekdayWindow: mon.isOff
                    ? "Terkunci (Libur)"
                    : `${formatMinutes(monOpen)} – ${formatMinutes(monClose)} WIB${monOvernight ? " (+1 hari)" : ""}`,
                saturdayWindow: sat.isOff
                    ? "Terkunci (Libur)"
                    : `${formatMinutes(satOpen)} – ${formatMinutes(satClose)} WIB`,
                onTimeRule: `Tepat waktu s.d. ${monDeadline} WIB (Sabtu s.d. ${satDeadline} WIB) • Toleransi terlambat ${lateIn} menit`,
            };
        });
    }, [threeShifts]);

    const candidateEmployees = useMemo(() => {
        const enrolledSet = new Set(smartEmployeeIds);
        const q = searchQuery.trim().toLowerCase();
        return allEmployees
            .filter((emp) => emp.isActive !== false && !enrolledSet.has(emp.employeeId))
            .filter((emp) => {
                if (!q) return true;
                return (
                    emp.name.toLowerCase().includes(q) ||
                    emp.employeeId.toLowerCase().includes(q) ||
                    (emp.division ?? "").toLowerCase().includes(q) ||
                    (emp.department ?? "").toLowerCase().includes(q) ||
                    (emp.position ?? "").toLowerCase().includes(q)
                );
            })
            .slice(0, 10);
    }, [allEmployees, smartEmployeeIds, searchQuery]);

    const saveParticipants = async (nextIds: string[], successMessage: string) => {
        setSaving(true);
        setActionError("");
        try {
            const res = await fetch("/api/shifts/smart-rotation", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeIds: nextIds }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan daftar peserta Rotasi 3-Shift Otomatis."));
            }
            const data = await res.json();
            setSmartEmployeeIds(Array.isArray(data.employeeIds) ? data.employeeIds : []);
            setSmartEmployees(Array.isArray(data.employees) ? data.employees : []);
            setSearchQuery("");
            toast(successMessage, "success");
        } catch (error) {
            reportClientError("SmartShiftRotationPage", "Gagal memperbarui peserta Rotasi 3-Shift Otomatis", error);
            const message = error instanceof Error ? error.message : "Gagal menyimpan perubahan peserta.";
            setActionError(message);
            toast(message, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleAddEmployee = (emp: EmployeeOption) => {
        if (smartEmployeeIds.includes(emp.employeeId)) return;
        const nextIds = [...smartEmployeeIds, emp.employeeId];
        void saveParticipants(nextIds, `${emp.name} (${emp.employeeId}) ditambahkan ke Rotasi 3-Shift Otomatis.`);
    };

    const handleRemoveEmployee = (emp: SmartShiftParticipant) => {
        confirm({
            title: "Keluarkan dari Rotasi 3-Shift Otomatis",
            message: `Keluarkan ${emp.name} (${emp.employeeId}) dari mode pilih shift di kamera presensi? Setelah dikeluarkan, karyawan ini kembali mengikuti jadwal Jam Kerja atau Roster Shift reguler.`,
            variant: "warning",
            confirmLabel: "Keluarkan Karyawan",
            onConfirm: () => {
                const nextIds = smartEmployeeIds.filter((id) => id !== emp.employeeId);
                void saveParticipants(nextIds, `${emp.name} dikeluarkan dari Rotasi 3-Shift Otomatis.`);
            },
        });
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* ── Header Halaman ── */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="space-y-1">
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[var(--primary)]" />
                        Rotasi 3-Shift Otomatis
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] max-w-3xl">
                        Modul khusus karyawan lapangan yang rotasi shift hariannya berubah cepat dan memilih sendiri tombol{" "}
                        <strong className="text-[var(--text-primary)]">[Shift 1]</strong>,{" "}
                        <strong className="text-[var(--text-primary)]">[Shift 2]</strong>, atau{" "}
                        <strong className="text-[var(--text-primary)]">[Shift 3]</strong> di kamera presensi sesuai jam server WIB.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        href="/dashboard/shifts"
                        className="btn btn-secondary text-xs flex items-center gap-1.5"
                        title="Ubah jam kerja Shift 1, Shift 2, atau Shift 3 di Master Jam Kerja"
                    >
                        <Clock className="w-4 h-4" /> Pengaturan Jam Kerja
                    </Link>
                    <Link
                        href="/dashboard/shifts/roster"
                        className="btn btn-secondary text-xs flex items-center gap-1.5"
                        title="Buka jadwal roster ber-tanggal untuk shift terjadwal"
                    >
                        <CalendarClock className="w-4 h-4" /> Roster Shift Terjadwal
                    </Link>
                </div>
            </div>

            {/* ── Pembanding Singkat Agar Admin HR Tidak Bingung ── */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="space-y-1">
                    <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        1. Pengaturan Jam Kerja (Sumber Jadwal)
                    </span>
                    <p className="text-[var(--text-muted)] leading-relaxed">
                        Tempat mengatur jam masuk, jam pulang, hari libur, dan toleransi. Jika jam Shift 1, Shift 2, atau Shift 3 diubah di sana, halaman ini otomatis mengikuti.
                    </p>
                </div>
                <div className="space-y-1">
                    <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <CalendarClock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        2. Roster Shift Terjadwal
                    </span>
                    <p className="text-[var(--text-muted)] leading-relaxed">
                        Digunakan bila jadwal rotasi karyawan sudah ditentukan lebih dulu oleh HR per rentang tanggal pada kalender.
                    </p>
                </div>
                <div className="space-y-1 rounded-lg bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))] p-2.5 -m-1 border border-[color-mix(in_srgb,var(--primary)_25%,transparent)]">
                    <span className="font-bold text-[var(--primary)] flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5" />
                        3. Rotasi 3-Shift Otomatis (Halaman Ini)
                    </span>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                        Digunakan khusus karyawan lapangan yang rotasi hariannya berubah mendadak. HR cukup mendaftarkan namanya satu kali di sini tanpa perlu mengubah jadwal harian.
                    </p>
                </div>
            </div>

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {actionError && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{actionError}</span>
                </div>
            )}

            {/* ── Jadwal & Aturan Penguncian Tombol Kamera (Tersinkron Otomatis dari Pengaturan Jam Kerja) ── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Camera className="w-4 h-4 text-[var(--primary)]" />
                        Aturan Jendela Tombol Shift di Kamera Presensi
                    </h2>
                    <span className="text-xs text-[var(--text-muted)]">
                        Tersinkron otomatis dari menu <Link href="/dashboard/shifts" className="text-[var(--primary)] font-semibold hover:underline">Pengaturan Jam Kerja</Link>
                    </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {dynamicShiftCards.map(({ shift, weekdayHours, saturdayHours, weekdayWindow, saturdayWindow, onTimeRule }) => {
                        const style = CARD_STYLES[shift.shiftNumber];
                        const Icon = style.icon;
                        return (
                            <div
                                key={shift.shiftNumber}
                                className={`card p-4 space-y-3 border ${style.accentClass}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Icon className="w-4 h-4 text-[var(--primary)] shrink-0" />
                                        <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{shift.name}</h3>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${style.badgeClass}`}>
                                        Tombol [{shift.shortLabel}]
                                    </span>
                                </div>

                                <div className="space-y-1.5 text-xs">
                                    <div className="flex items-center justify-between gap-2 py-1 border-b border-[var(--border)]/60">
                                        <span className="text-[var(--text-muted)]">Jam Kerja Senin–Jumat</span>
                                        <span className="font-mono font-bold text-[var(--text-primary)]">{weekdayHours}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 py-1 border-b border-[var(--border)]/60">
                                        <span className="text-[var(--text-muted)]">Jam Kerja Sabtu</span>
                                        <span className="font-mono font-bold text-[var(--text-primary)]">{saturdayHours}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 py-1 border-b border-[var(--border)]/60">
                                        <span className="text-[var(--text-muted)]">Tombol Aktif (Sen–Jum)</span>
                                        <span className="font-mono font-semibold text-[var(--primary)]">{weekdayWindow}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 py-1">
                                        <span className="text-[var(--text-muted)]">Tombol Aktif (Sabtu)</span>
                                        <span className="font-mono font-semibold text-[var(--primary)]">{saturdayWindow}</span>
                                    </div>
                                </div>

                                <p className="text-[11px] text-[var(--text-secondary)] bg-[var(--card)]/90 rounded-lg p-2.5 border border-[var(--border)] leading-relaxed">
                                    {onTimeRule}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Daftar Karyawan Peserta & Kontrol Penambahan (WIG001) ── */}
            <div className="card p-5 space-y-5 border border-[var(--border)]">
                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Users className="w-4 h-4 text-[var(--primary)]" />
                            <h2 className="text-base font-bold text-[var(--text-primary)]">
                                Daftar Karyawan Peserta Rotasi 3-Shift Otomatis
                            </h2>
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--primary)]">
                                {smartEmployees.length} Karyawan
                            </span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">
                            Hanya karyawan yang terdaftar di bawah ini yang menampilkan pilihan tombol{" "}
                            <strong className="text-[var(--text-primary)]">[Shift 1] [Shift 2] [Shift 3]</strong> di kamera presensi. Saat presensi pulang, sistem otomatis menutup shift sesuai jam masuknya.
                        </p>
                    </div>

                    {canManage ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <ShieldCheck className="w-3.5 h-3.5" /> Mode Kelola WIG001 Aktif
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-[var(--secondary)] text-[var(--text-muted)]">
                            <Lock className="w-3.5 h-3.5" /> Hanya akun WIG001 yang dapat menambah atau mengeluarkan peserta
                        </span>
                    )}
                </div>

                {/* Form Pencarian & Tambah Peserta (Khusus WIG001) */}
                {canManage && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 space-y-3">
                        <label htmlFor="smart-shift-employee-search" className="block text-xs font-bold text-[var(--text-primary)]">
                            Tambah Karyawan ke Rotasi 3-Shift Otomatis
                        </label>
                        <div className="relative max-w-lg">
                            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                id="smart-shift-employee-search"
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Ketik nama, ID karyawan, atau divisi..."
                                className="form-input !pl-9 !py-2 !text-xs w-full"
                                disabled={saving}
                            />
                        </div>

                        {searchQuery.trim().length > 0 && (
                            <div className="space-y-2 pt-1">
                                <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                                    Hasil Pencarian Karyawan Aktif:
                                </span>
                                {candidateEmployees.length === 0 ? (
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Tidak ditemukan karyawan aktif yang belum terdaftar dengan kata kunci tersebut.
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {candidateEmployees.map((emp) => (
                                            <button
                                                key={emp.employeeId}
                                                type="button"
                                                disabled={saving}
                                                onClick={() => handleAddEmployee(emp)}
                                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:bg-[var(--secondary)] text-xs transition-all cursor-pointer"
                                            >
                                                <UserPlus className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                                                <span className="font-bold text-[var(--text-primary)]">{emp.name}</span>
                                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--primary)]">
                                                    {emp.employeeId}
                                                </span>
                                                {emp.division && (
                                                    <span className="text-[11px] text-[var(--text-muted)]">• {emp.division}</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Tabel Peserta */}
                {initialLoading ? (
                    <div className="py-12 text-center text-[var(--text-muted)]">
                        <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-[var(--primary)] opacity-60" />
                        <p className="text-xs font-medium">Memuat daftar karyawan peserta Rotasi 3-Shift Otomatis...</p>
                    </div>
                ) : smartEmployees.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center space-y-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                            Belum ada karyawan peserta Rotasi 3-Shift Otomatis
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                            {canManage
                                ? "Gunakan kotak pencarian di atas untuk menambahkan karyawan lapangan ke mode pilih shift 3-Shift."
                                : "Hubungi admin utama (WIG001) untuk mendaftarkan karyawan pada mode ini."}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                    <th className="py-3 px-4">ID Karyawan</th>
                                    <th className="py-3 px-4">Nama Karyawan</th>
                                    <th className="py-3 px-4">Jabatan</th>
                                    <th className="py-3 px-4">Divisi / Departemen</th>
                                    <th className="py-3 px-4">Mode Presensi</th>
                                    {canManage && <th className="py-3 px-4 text-right">Aksi</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)] text-xs">
                                {smartEmployees.map((emp) => (
                                    <tr key={emp.employeeId} className="hover:bg-[var(--secondary)]/40 transition-colors">
                                        <td className="py-3 px-4 font-mono font-bold text-[var(--primary)]">
                                            {emp.employeeId}
                                        </td>
                                        <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                                            {emp.name}
                                        </td>
                                        <td className="py-3 px-4 text-[var(--text-secondary)]">
                                            {emp.position}
                                        </td>
                                        <td className="py-3 px-4 text-[var(--text-secondary)]">
                                            {emp.division} {emp.department && emp.department !== "-" ? `• ${emp.department}` : ""}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                <CheckCircle2 className="w-3 h-3" />
                                                Pilih Shift 1 / 2 / 3 di Kamera
                                            </span>
                                        </td>
                                        {canManage && (
                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    type="button"
                                                    disabled={saving}
                                                    onClick={() => handleRemoveEmployee(emp)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                                    title={`Keluarkan ${emp.name} dari Rotasi 3-Shift Otomatis`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    Keluarkan
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

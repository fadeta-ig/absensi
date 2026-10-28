"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Eye, Loader2, RotateCcw, Search, X } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { stripGelar } from "@/lib/utils/formatters";

type RincianStatus = "Tepat Waktu" | "Overdue" | "Tunggakan";

interface RincianTask {
    taskId: string;
    title: string;
    meetingId: string;
    meetingTitle: string;
    assignerEmployeeId: string;
    assignerName: string;
    deadline: string;
    submittedAt: string | null;
    status: RincianStatus;
    selisihHari: number | null;
    masihBerjalan: boolean;
}

interface KinerjaRow {
    employeeId: string;
    name: string;
    division: string;
    department: string;
    total: number;
    tepat: number;
    overdue: number;
    tunggakan: number;
    onProgress: number;
    tingkatKetepatan: number | null;
    rataPengumpulan: number | null;
    tasks: RincianTask[];
}

interface TunggakanBulan {
    month: string;
    label: string;
    taskCount: number;
    employeeCount: number;
}

function fmtTanggal(iso: string | null): string {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function fmtSelisih(v: number | null): string {
    if (v === null) return "-";
    if (v > 0) return `H-${v}`;
    if (v < 0) return `H+${-v}`;
    return "Hari H";
}

function badgeCls(t: RincianTask): string {
    if (t.masihBerjalan) return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    if (t.status === "Tepat Waktu") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
    return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
}

function badgeText(t: RincianTask): string {
    if (t.masihBerjalan) return "Masih On Progress";
    return t.status;
}

function monthRange(monthValue: string): { from: string; to: string } {
    const [y, m] = monthValue.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export default function MeetingMonitorPage() {
    const router = useRouter();
    const now = new Date();
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    const [rows, setRows] = useState<KinerjaRow[]>([]);
    const [tunggakanLalu, setTunggakanLalu] = useState<TunggakanBulan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filterQ, setFilterQ] = useState("");
    const [filterDivisi, setFilterDivisi] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const load = useCallback(async (from: string, to: string) => {
        setLoading(true);
        setError("");
        try {
            const capRes = await fetch("/api/employee/meeting-capabilities", { credentials: "same-origin" });
            if (!capRes.ok) throw new Error(await getResponseErrorMessage(capRes, "Gagal memeriksa akses pantau."));
            const capJson = await capRes.json();
            if (!capJson.data?.canMonitor) {
                setAllowed(false);
                setLoading(false);
                return;
            }
            setAllowed(true);
            const params = new URLSearchParams({ from, to });
            const res = await fetch(`/api/employee/pantau-kinerja?${params.toString()}`, { credentials: "same-origin" });
            if (res.status === 403) {
                setAllowed(false);
                setLoading(false);
                return;
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat pantauan."));
            const json = await res.json();
            setRows(Array.isArray(json.data) ? json.data : []);
            setTunggakanLalu(Array.isArray(json.tunggakanLalu) ? json.tunggakanLalu : []);
        } catch (err) {
            reportClientError("MeetingMonitorPage", "Gagal memuat pantauan", err);
            setError(err instanceof Error ? err.message : "Gagal memuat pantauan.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const { from, to } = monthRange(month);
        void load(from, to);
    }, [month, load]);

    const divisiOptions = useMemo(() => {
        const set = new Set<string>();
        for (const r of rows) if (r.division && r.division !== "-") set.add(r.division);
        return [...set].sort();
    }, [rows]);

    const filtered = useMemo(() => {
        const q = filterQ.trim().toLowerCase();
        return rows.filter((r) => {
            if (filterDivisi && r.division !== filterDivisi) return false;
            if (q && !(r.name.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q))) return false;
            return true;
        });
    }, [rows, filterQ, filterDivisi]);

    function toggleExpand(id: string) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    if (allowed === false && !loading) {
        return (
            <div className="space-y-4">
                <button type="button" onClick={() => router.push("/employee/appointments")} className="btn btn-secondary btn-sm">
                    <ArrowLeft className="w-4 h-4" /> Kembali
                </button>
                <div className="card p-6 text-center">
                    <Eye className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" />
                    <p className="text-sm font-medium text-[var(--text-primary)]">Akses ditolak</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Halaman ini hanya untuk pemantau yang ditunjuk WIG002.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <button type="button" onClick={() => router.push("/employee/appointments")} className="btn btn-secondary btn-sm" aria-label="Kembali ke E Meeting">
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Eye className="w-5 h-5 text-[var(--primary)]" /> Pantau E-Meeting
                    </h1>
                    <p className="text-xs text-[var(--text-muted)]">Tingkat ketepatan penyelesaian task seluruh karyawan</p>
                </div>
            </div>

            {tunggakanLalu.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/20" role="status">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-200">Masih ada tunggakan dari bulan lalu yang belum selesai:</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {tunggakanLalu.map((t) => (
                            <button
                                key={t.month}
                                type="button"
                                onClick={() => setMonth(t.month)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/70 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-200"
                            >
                                {t.label}: {t.taskCount} task ({t.employeeCount} karyawan) — lihat
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="card p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="pantau-bulan">Periode</label>
                        <input
                            id="pantau-bulan"
                            type="month"
                            className="form-input"
                            value={month}
                            onChange={(e) => { if (e.target.value) setMonth(e.target.value); }}
                        />
                    </div>
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="pantau-divisi">Divisi</label>
                        <select
                            id="pantau-divisi"
                            className="form-input"
                            value={filterDivisi}
                            onChange={(e) => setFilterDivisi(e.target.value)}
                        >
                            <option value="">Semua divisi</option>
                            {divisiOptions.map((d) => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                    <input
                        className="form-input pl-10 pr-9"
                        value={filterQ}
                        onChange={(e) => setFilterQ(e.target.value)}
                        placeholder="Cari nama atau nomor induk karyawan…"
                        aria-label="Cari karyawan"
                    />
                    {filterQ && (
                        <button
                            type="button"
                            onClick={() => setFilterQ("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 min-w-9 min-h-9 flex items-center justify-center text-[var(--text-muted)]"
                            aria-label="Hapus pencarian"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}

            {loading ? (
                <p className="text-sm text-[var(--text-muted)] flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Memuat pantauan…
                </p>
            ) : filtered.length === 0 ? (
                <div className="card p-6 text-center">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Tidak ada data</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Tidak ada karyawan yang memiliki task pada periode ini.</p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {filtered.map((r) => {
                        const open = expanded.has(r.employeeId);
                        return (
                            <article key={r.employeeId} className="card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{stripGelar(r.name)}</p>
                                        <p className="text-[11px] font-mono text-[var(--text-muted)]">{r.employeeId}</p>
                                        <p className="text-[11px] text-[var(--text-muted)]">{r.division !== "-" ? r.division : r.department}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xl font-extrabold text-[var(--primary)]">
                                            {r.tingkatKetepatan === null ? "-" : `${r.tingkatKetepatan}%`}
                                        </p>
                                        <p className="text-[10px] text-[var(--text-muted)]">Tingkat Ketepatan</p>
                                    </div>
                                </div>
                                <dl className="grid grid-cols-4 gap-1.5 mt-2.5 text-center">
                                    {[
                                        { label: "Tepat Waktu", value: r.tepat },
                                        { label: "Overdue", value: r.overdue },
                                        { label: "Tunggakan", value: r.tunggakan },
                                        { label: "Masih On Progress", value: r.onProgress },
                                    ].map((s) => (
                                        <div key={s.label} className="rounded-lg bg-[var(--secondary)] px-1 py-1.5">
                                            <p className="text-sm font-bold text-[var(--text-primary)]">{s.value}</p>
                                            <p className="text-[10px] text-[var(--text-muted)] leading-tight">{s.label}</p>
                                        </div>
                                    ))}
                                </dl>
                                <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                                    Total {r.total} task · Rata-rata pengumpulan: <strong className="text-[var(--text-secondary)]">{fmtSelisih(r.rataPengumpulan)}</strong>
                                </p>
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(r.employeeId)}
                                    aria-expanded={open}
                                    className="mt-2 w-full px-3 py-2 rounded-lg text-xs font-semibold min-h-10 bg-[var(--secondary)] text-[var(--text-secondary)] flex items-center justify-center gap-1"
                                >
                                    {open ? "Tutup rincian" : "Lihat rincian task"}
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                                </button>
                                {open && (
                                    <ul className="mt-2 space-y-1.5">
                                        {r.tasks.map((t) => (
                                            <li key={`${t.taskId}-${t.status}`} className="rounded-xl border border-[var(--border)] p-2.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-xs font-semibold text-[var(--text-primary)]">{t.title}</p>
                                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeCls(t)}`}>
                                                        {badgeText(t)}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                                                    {t.meetingTitle} · Dari {stripGelar(t.assignerName)}
                                                </p>
                                                <p className="text-[11px] text-[var(--text-muted)]">
                                                    Tenggat {fmtTanggal(t.deadline)} · Dikumpulkan {fmtTanggal(t.submittedAt)}
                                                    {t.selisihHari !== null && ` (${fmtSelisih(t.selisihHari)})`}
                                                </p>
                                                <div className="flex gap-1.5 mt-1.5">
                                                    <Link
                                                        href={`/employee/appointments/detail/${t.meetingId}/history`}
                                                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--secondary)] text-[var(--text-secondary)]"
                                                    >
                                                        Riwayat
                                                    </Link>
                                                    <Link
                                                        href={`/employee/appointments/detail/${t.meetingId}`}
                                                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--secondary)] text-[var(--text-secondary)]"
                                                    >
                                                        Detail
                                                    </Link>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </article>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => {
                            const { from, to } = monthRange(month);
                            void load(from, to);
                        }}
                        disabled={loading}
                        className="btn btn-secondary btn-sm w-full disabled:opacity-50"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> Muat Ulang
                    </button>
                </div>
            )}
        </div>
    );
}

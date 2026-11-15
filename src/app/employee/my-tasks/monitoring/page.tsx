"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Eye, RotateCcw, Search, X } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import { stripGelar } from "@/lib/utils/formatters";

type RincianStatus = "Tepat Waktu" | "Overdue" | "Tunggakan";

interface RincianTask {
    taskId: string;
    title: string;
    sourceType?: string;
    meetingId: string | null;
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
    if (t.masihBerjalan) return "bg-[var(--warning-bg)] text-[var(--warning)]";
    if (t.status === "Tepat Waktu") return "bg-[var(--success-bg)] text-[var(--success)]";
    return "bg-[var(--destructive-bg)] text-[var(--destructive-text)]";
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
    const [debouncedQ, setDebouncedQ] = useState("");
    const [filterDivisi, setFilterDivisi] = useState("");
    const [sourceFilter, setSourceFilter] = useState("");
    const [serverDivisions, setServerDivisions] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const capabilityCheckedRef = useRef(false);
    const requestSeqRef = useRef(0);

    const load = useCallback(async (from: string, to: string, source: string, recheckCapability = false, pageNum = 1, q = "", division = "") => {
        // Guard balapan: hanya respons permintaan terakhir yang boleh menulis state.
        const seq = ++requestSeqRef.current;
        setLoading(true);
        setError("");
        try {
            if (recheckCapability || !capabilityCheckedRef.current) {
                const capRes = await fetch("/api/my-tasks/capabilities", { credentials: "same-origin" });
                if (!capRes.ok) throw new Error(await getResponseErrorMessage(capRes, "Gagal memeriksa akses. Periksa koneksi Anda, lalu coba lagi."));
                const capJson = await capRes.json();
                capabilityCheckedRef.current = true;
                if (!capJson.data?.canMonitor) {
                    if (seq === requestSeqRef.current) { setAllowed(false); setLoading(false); }
                    return;
                }
                if (seq === requestSeqRef.current) setAllowed(true);
            }
            const params = new URLSearchParams({ from, to, page: String(pageNum), limit: "10" });
            if (source) params.set("source", source);
            if (q.trim()) params.set("q", q.trim());
            if (division) params.set("division", division);
            const res = await fetch(`/api/my-tasks/monitoring?${params.toString()}`, { credentials: "same-origin" });
            if (res.status === 403) {
                if (seq === requestSeqRef.current) { setAllowed(false); setLoading(false); }
                return;
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat pantauan. Periksa koneksi Anda, lalu coba lagi."));
            const json = await res.json();
            if (seq !== requestSeqRef.current) return;
            setRows(Array.isArray(json.data) ? json.data : []);
            setTunggakanLalu(Array.isArray(json.tunggakanLalu) ? json.tunggakanLalu : []);
            setTotalRows(typeof json.total === "number" ? json.total : 0);
            setTotalPages(typeof json.totalPages === "number" ? json.totalPages : 1);
            if (typeof json.page === "number" && json.page !== pageNum) setPage(json.page);
            setServerDivisions(Array.isArray(json.divisions) ? json.divisions : []);
        } catch (err) {
            if (seq !== requestSeqRef.current) return;
            reportClientError("MeetingMonitorPage", "Gagal memuat pantauan", err);
            setError(err instanceof Error ? err.message : "Gagal memuat pantauan. Periksa koneksi Anda, lalu coba lagi.");
        } finally {
            if (seq === requestSeqRef.current) setLoading(false);
        }
    }, []);

    // Pencarian di-debounce agar tidak memicu request per ketikan.
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQ(filterQ);
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [filterQ]);

    useEffect(() => {
        const { from, to } = monthRange(month);
        void load(from, to, sourceFilter, false, page, debouncedQ, filterDivisi);
    }, [month, sourceFilter, page, debouncedQ, filterDivisi, load]);

    const divisiOptions = serverDivisions;
    const filtered = rows;

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
            <div className="space-y-5">
                <button type="button" onClick={() => router.push("/employee/my-tasks")} className="btn btn-secondary btn-sm">
                    <ArrowLeft className="w-4 h-4" /> Kembali
                </button>
                <EmptyState
                    icon={Eye}
                    title="Anda belum bisa membuka halaman ini"
                    description="Halaman ini khusus pemantau yang ditunjuk WIG002. Minta WIG002 menunjuk Anda untuk membukanya."
                />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2">
                <button type="button" onClick={() => router.push("/employee/my-tasks")} className="btn btn-secondary btn-sm" aria-label="Kembali ke Tugas Saya">
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                    <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] flex items-center gap-1.5">
                        <Eye className="w-5 h-5 text-[var(--primary)]" /> Pantau Tugas
                    </h1>
                    <p className="text-[11px] font-medium text-[var(--text-secondary)]">Ketepatan penyelesaian tugas seluruh karyawan. Diurutkan dari tingkat ketepatan terendah.</p>
                </div>
            </div>

            {tunggakanLalu.length > 0 && (
                <div className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2.5" role="status">
                    <p className="text-xs font-bold text-[var(--warning)]">Masih ada tunggakan dari bulan lalu yang belum selesai:</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {tunggakanLalu.map((t) => (
                            <button
                                key={t.month}
                                type="button"
                                onClick={() => setMonth(t.month)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--card)] text-[var(--warning)] border border-[var(--warning-border)]"
                            >
                                {t.label}: {t.taskCount} tugas ({t.employeeCount} karyawan) — lihat
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="emp-surface p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="pantau-bulan">Periode</label>
                        <input
                            id="pantau-bulan"
                            type="month"
                            className="form-input"
                            value={month}
                            onChange={(e) => { if (e.target.value) { setMonth(e.target.value); setPage(1); } }}
                        />
                    </div>
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="pantau-divisi">Divisi</label>
                        <select
                            id="pantau-divisi"
                            className="form-input"
                            value={filterDivisi}
                            onChange={(e) => { setFilterDivisi(e.target.value); setPage(1); }}
                        >
                            <option value="">Semua divisi</option>
                            {divisiOptions.map((d) => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label" htmlFor="pantau-sumber">Sumber tugas</label>
                    <select
                        id="pantau-sumber"
                        className="form-input"
                        value={sourceFilter}
                        onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">Semua sumber</option>
                        <option value="APPOINTMENTS">E-Meeting</option>
                        <option value="OPERASIONAL">Operasional</option>
                    </select>
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
                <p className="text-[11px] text-[var(--text-muted)]">Yang dinilai: tugas E-Meeting dan Operasional. Tugas yang dibatalkan pemberi atau ditolak penerima tidak dihitung.</p>
            </div>

            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}

            {loading ? (
                <ListSkeleton label="Memuat pantauan" />
            ) : filtered.length === 0 ? (
                <EmptyState
                    title="Belum ada data pada periode ini"
                    description="Pilih periode lain atau ubah filter untuk melihat hasil."
                    action={(filterQ || filterDivisi || sourceFilter) ? (
                        <button type="button" onClick={() => { setFilterQ(""); setFilterDivisi(""); setSourceFilter(""); setPage(1); }} className="btn btn-secondary btn-sm">Reset filter</button>
                    ) : undefined}
                />
            ) : (
                <div className="space-y-2.5">
                    {filtered.map((r) => {
                        const open = expanded.has(r.employeeId);
                        return (
                            <article key={r.employeeId} className="emp-surface p-4">
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
                                    Total {r.total} tugas · Rata-rata pengumpulan: <strong className="text-[var(--text-secondary)]">{fmtSelisih(r.rataPengumpulan)}</strong>
                                </p>
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(r.employeeId)}
                                    aria-expanded={open}
                                    className="btn btn-secondary btn-sm mt-2 w-full min-h-10"
                                >
                                    {open ? "Tutup rincian" : "Lihat rincian tugas"}
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
                                                    {t.sourceType === "OPERASIONAL" ? "Operasional" : t.meetingTitle} · Dari {stripGelar(t.assignerName)}
                                                </p>
                                                <p className="text-[11px] text-[var(--text-muted)]">
                                                    Tenggat {fmtTanggal(t.deadline)} · Dikumpulkan {fmtTanggal(t.submittedAt)}
                                                    {t.selisihHari !== null && ` (${fmtSelisih(t.selisihHari)})`}
                                                </p>
                                                {t.meetingId && (
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
                                                            Detail meeting
                                                        </Link>
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </article>
                        );
                    })}
                    {totalRows > 0 && (
                        <div className="flex items-center justify-between gap-2">
                            <button type="button" disabled={loading || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="btn btn-secondary btn-sm min-h-10 disabled:opacity-50">Sebelumnya</button>
                            <p className="text-[11px] text-[var(--text-muted)] text-center">Halaman {page} dari {totalPages} · {totalRows} karyawan</p>
                            <button type="button" disabled={loading || page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="btn btn-secondary btn-sm min-h-10 disabled:opacity-50">Berikutnya</button>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            const { from, to } = monthRange(month);
                            void load(from, to, sourceFilter, true, page, debouncedQ, filterDivisi);
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

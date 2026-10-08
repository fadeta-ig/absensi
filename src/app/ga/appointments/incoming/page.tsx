"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Eye, X, CalendarClock, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import AccessibleModal from "@/components/ui/AccessibleModal";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { AppointmentStatusBadge, AttendanceMarkBadge, InviteResponseBadge } from "@/components/appointments/AppointmentBadges";
import { participantDisplayName } from "@/components/appointments/useAppointments";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { useConfirm } from "@/components/ConfirmModal";

interface IncomingItem {
    id: string;
    title: string;
    status: string;
    lifecycle?: string;
    startAt: string;
    endAt: string;
    isFullDay: boolean;
    meetingLink: string | null;
    requesterEmployeeId: string | null;
    room: { id: string; name: string } | null;
    participants: Array<{ id: string; employeeId: string | null; guestName: string | null; isExternal: boolean; attendance: string; inviteStatus?: string; inviteNote?: string | null; employee?: { name: string } | null }>;
}

interface RoomOption {
    id: string;
    name: string;
    capacity: number | null;
}

function fmtDT(iso: string): string {
    return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function GaAppointmentsIncomingPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [items, setItems] = useState<IncomingItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [detail, setDetail] = useState<IncomingItem | null>(null);
    const [rooms, setRooms] = useState<RoomOption[]>([]);
    const [acting, setActing] = useState(false);
    const [resched, setResched] = useState({ date: "", startTime: "", endTime: "", roomId: "", meetingLink: "", reason: "", force: false });
    const [askingResched, setAskingResched] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [askingCancel, setAskingCancel] = useState(false);
    const fetchedRef = useRef("");
    const limit = 20;

    const fetchData = useCallback(async (p: number, status: string) => {
        const key = `${p}-${status}`;
        fetchedRef.current = key;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: String(p), limit: String(limit) });
            if (status !== "ALL") params.set("status", status);
            const res = await fetch(`/api/appointments?${params.toString()}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat data meeting."));
            const json = (await res.json()) as { data: IncomingItem[]; total: number };
            if (fetchedRef.current !== key) return;
            setItems(json.data);
            setTotal(json.total);
        } catch (err) {
            if (fetchedRef.current !== key) return;
            reportClientError("GaAppointmentsIncoming", "Gagal memuat data janji temu", err);
            setError(err instanceof Error ? err.message : "Gagal memuat data. Silakan coba lagi.");
        } finally {
            if (fetchedRef.current === key) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchData(page, statusFilter);
    }, [page, statusFilter, fetchData]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const detailId = new URLSearchParams(window.location.search).get("detail");
        if (detailId) {
            window.history.replaceState(null, "", window.location.pathname);
            void openDetail(detailId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetch("/api/appointments/rooms")
            .then((res) => (res.ok ? res.json() : null))
            .then((json: unknown) => {
                if (json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)) {
                    setRooms((json as { data: RoomOption[] }).data);
                }
            })
            .catch(() => undefined);
    }, []);

    function resetForms(item: IncomingItem) {
        setCancelReason("");
        setAskingCancel(false);
        setAskingResched(false);
        const d = new Date(item.startAt);
        const pad = (n: number) => String(n).padStart(2, "0");
        setResched({
            date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            startTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
            endTime: `${pad(new Date(item.endAt).getHours())}:${pad(new Date(item.endAt).getMinutes())}`,
            roomId: item.room?.id ?? "",
            meetingLink: item.meetingLink ?? "",
            reason: "",
            force: false,
        });
    }

    async function openDetail(id: string) {
        try {
            const res = await fetch(`/api/appointments/${id}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail."));
            const json = (await res.json()) as { data: IncomingItem };
            setDetail(json.data);
            resetForms(json.data);
        } catch (err) {
            reportClientError("GaAppointmentsIncoming", "Gagal memuat detail janji temu", err);
            toast(err instanceof Error ? err.message : "Gagal memuat detail meeting.", "error");
        }
    }

    async function postAction(url: string, method: string, body: unknown, successMsg: string) {
        if (acting) return;
        setActing(true);
        try {
            const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Aksi gagal."));
            toast(successMsg, "success");
            setDetail(null);
            await fetchData(page, statusFilter);
        } catch (err) {
            reportClientError("GaAppointmentsIncoming", "Tindakan gagal diproses", err);
            toast(err instanceof Error ? err.message : "Tindakan gagal diproses. Silakan coba lagi.", "error");
        } finally {
            setActing(false);
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return (
        <div className="w-full min-w-0 space-y-4">
            <div>
                <h1 className="text-lg font-extrabold text-[var(--text-primary)]">Pemantauan Meeting</h1>
                <p className="text-xs text-[var(--text-muted)]">Menjadwalkan ulang, memindahkan ruang meeting, dan membatalkan meeting dalam kondisi mendesak tanpa persetujuan penyelenggara</p>
            </div>

            {error && (
                <FeedbackMessage variant="error" title="Gagal memuat">
                    {error}
                </FeedbackMessage>
            )}

            <div className="flex gap-2 items-center">
                <label htmlFor="status-filter" className="text-xs font-semibold text-[var(--text-secondary)]">Status</label>
                <select
                    id="status-filter"
                    className="form-input w-auto"
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                >
                    <option value="SCHEDULED">Terjadwal</option>
                    <option value="IN_PROGRESS">Sedang Berlangsung</option>
                    <option value="COMPLETED">Selesai</option>
                    <option value="CANCELLED">Dibatalkan</option>
                    <option value="ALL">Semua Status</option>
                </select>
            </div>

            <div className="card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Topik dan Pemohon</TableHead>
                            <TableHead>Jadwal dan Ruang Meeting</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Tindakan</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center">
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--primary)]" />
                                    <span className="sr-only">Memuat</span>
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && items.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-[var(--text-muted)]">Tidak ada meeting.</TableCell>
                            </TableRow>
                        )}
                        {items.map((a) => (
                            <TableRow key={a.id}>
                                <TableCell>
                                    <span className="font-semibold block truncate max-w-[220px]">{a.title}</span>
                                    <span className="block text-[11px] font-mono text-[var(--text-muted)]">{a.requesterEmployeeId ?? "-"}</span>
                                    <span className="block text-[11px] text-[var(--text-muted)]">{a.participants.length} peserta</span>
                                </TableCell>
                                <TableCell>
                                    <span className="block text-xs">{a.isFullDay ? "Seharian" : `${fmtDT(a.startAt)} – ${fmtDT(a.endAt)}`}</span>
                                    <span className="block text-[11px] text-[var(--text-muted)]">{a.room?.name ?? "Online"}</span>
                                </TableCell>
                                <TableCell>
                                    <AppointmentStatusBadge status={a.status} lifecycle={a.lifecycle} />
                                </TableCell>
                                <TableCell>
                                    <button
                                        type="button"
                                        onClick={() => { void openDetail(a.id); }}
                                        className="p-2 rounded-lg hover:bg-[var(--secondary)] min-w-9 min-h-9 inline-flex items-center justify-center"
                                        aria-label={`Lihat detail ${a.title}`}
                                    >
                                        <Eye className="w-4 h-4" />
                                    </button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <DataTablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={limit}
                onPageChange={setPage}
                itemLabel="meeting"
            />

            {detail && (
                <AccessibleModal ariaLabel="Detail meeting" onClose={() => setDetail(null)} className="!max-w-2xl" disableClose={acting}>
                    <div className="modal-header">
                        <h2 className="modal-title">{detail.title}</h2>
                        <button className="modal-close" onClick={() => setDetail(null)} disabled={acting} aria-label="Tutup detail">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-3">
                        <AppointmentStatusBadge status={detail.status} lifecycle={detail.lifecycle} />
                        <p className="text-sm text-[var(--text-secondary)]">
                            {detail.isFullDay ? "Seharian" : `${fmtDT(detail.startAt)} – ${fmtDT(detail.endAt)}`} · {detail.room?.name ?? "Online"}
                            {detail.meetingLink ? ` · ${detail.meetingLink}` : ""}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">Pemohon: <span className="font-mono">{detail.requesterEmployeeId ?? "-"}</span></p>

                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Peserta ({detail.participants.length})</p>
                            <ul className="space-y-1.5">
                                {detail.participants.map((p) => (
                                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                                        <span className="truncate">
                                            {participantDisplayName(p)}
                                            {p.isExternal && <span className="text-[11px] text-[var(--text-muted)]"> (Tamu Eksternal)</span>}
                                            {p.inviteStatus === "DECLINED" && p.inviteNote && (
                                                <span className="block text-[11px] text-[var(--text-muted)]">Alasan penolakan: {p.inviteNote}</span>
                                            )}
                                        </span>
                                        <span className="flex gap-1 shrink-0 items-center">
                                            {!p.isExternal && <InviteResponseBadge status={p.inviteStatus ?? "PENDING"} />}
                                            <AttendanceMarkBadge mark={p.attendance} />
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {detail.status === "SCHEDULED" && (                            <div className="space-y-2">
                                <button type="button" onClick={() => setAskingResched(!askingResched)} className="btn btn-secondary w-full">
                                    <CalendarClock className="w-4 h-4" /> Ubah Jadwal dan Ruang Meeting
                                </button>
                                {askingResched && (
                                    <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
                                        <div className="form-group !mb-0">
                                            <span className="form-label" id="rs-mode-label">Tempat Pelaksanaan *</span>
                                            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="rs-mode-label">
                                                {(
                                                    [
                                                        { key: "fisik", label: "Ruang Fisik" },
                                                        { key: "daring", label: "Daring" },
                                                    ] as const
                                                ).map((m) => (
                                                    <button
                                                        key={m.key}
                                                        type="button"
                                                        aria-pressed={(resched.roomId ? "fisik" : "daring") === m.key}
                                                        onClick={() => {
                                                            if (m.key === "fisik") setResched({ ...resched, meetingLink: "" });
                                                            else setResched({ ...resched, roomId: "" });
                                                        }}
                                                        className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                                                            (resched.roomId ? "fisik" : "daring") === m.key
                                                                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                                                                : "border-[var(--border)] text-[var(--text-secondary)]"
                                                        }`}
                                                    >
                                                        {m.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="form-group !mb-0">
                                                <label className="form-label" htmlFor="rs-date">Tanggal *</label>
                                                <input id="rs-date" type="date" className="form-input" value={resched.date} onChange={(e) => setResched({ ...resched, date: e.target.value })} />
                                            </div>
                                            {resched.roomId ? (
                                                <div className="form-group !mb-0">
                                                    <label className="form-label" htmlFor="rs-room">Ruangan *</label>
                                                    <select id="rs-room" className="form-input" value={resched.roomId} onChange={(e) => setResched({ ...resched, roomId: e.target.value })}>
                                                        {rooms.map((r) => (
                                                            <option key={r.id} value={r.id}>{r.name}{r.capacity ? ` (Kapasitas ${r.capacity} orang)` : ""}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : (
                                                <div className="form-group !mb-0">
                                                    <label className="form-label" htmlFor="rs-link">Tautan Meeting Daring *</label>
                                                    <input id="rs-link" className="form-input" value={resched.meetingLink} onChange={(e) => setResched({ ...resched, meetingLink: e.target.value })} placeholder="Contoh: https://meet.google.com/xxx-xxxx-xxx" />
                                                </div>
                                            )}
                                            <div className="form-group !mb-0">
                                                <label className="form-label" htmlFor="rs-start">Jam Mulai *</label>
                                                <input id="rs-start" type="time" className="form-input" value={resched.startTime} onChange={(e) => setResched({ ...resched, startTime: e.target.value })} />
                                            </div>
                                            <div className="form-group !mb-0">
                                                <label className="form-label" htmlFor="rs-end">Jam Selesai *</label>
                                                <input id="rs-end" type="time" className="form-input" value={resched.endTime} onChange={(e) => setResched({ ...resched, endTime: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-group !mb-0">
                                            <label className="form-label" htmlFor="rs-reason">Alasan Perubahan *</label>
                                            <input id="rs-reason" className="form-input" value={resched.reason} onChange={(e) => setResched({ ...resched, reason: e.target.value })} placeholder="Tuliskan alasan perubahan jadwal (minimal 5 karakter)" />
                                        </div>
                                        <label className="flex items-center gap-2 text-xs font-medium">
                                            <input type="checkbox" checked={resched.force} onChange={(e) => setResched({ ...resched, force: e.target.checked })} className="w-4 h-4" />
                                            Tetap simpan meskipun jadwal bentrok (dicatat pada riwayat perubahan)
                                        </label>
                                        <button
                                            type="button"
                                            disabled={acting || !resched.date || !resched.startTime || !resched.endTime || (!resched.roomId && !resched.meetingLink.trim()) || resched.reason.trim().length < 5}
                                            onClick={() => {
                                                void postAction(`/api/appointments/${detail.id}`, "PATCH", {
                                                    date: resched.date,
                                                    startTime: resched.startTime,
                                                    endTime: resched.endTime,
                                                    roomId: resched.roomId || null,
                                                    meetingLink: resched.meetingLink.trim() || null,
                                                    changeReason: resched.reason.trim(),
                                                    force: resched.force,
                                                }, "Perubahan jadwal berhasil disimpan.");
                                            }}
                                            className="btn btn-primary w-full"
                                        >
                                            {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Simpan Perubahan
                                        </button>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setAskingCancel(!askingCancel)}
                                    className="btn w-full bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300"
                                >
                                    <Trash2 className="w-4 h-4" /> Batalkan Meeting
                                </button>
                                {askingCancel && (
                                    <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                                        <label className="form-label" htmlFor="cancel-reason">Alasan Pembatalan *</label>
                                        <input id="cancel-reason" className="form-input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Tuliskan alasan pembatalan (minimal 5 karakter)" />
                                        <button
                                            type="button"
                                            disabled={acting || cancelReason.trim().length < 5}
                                            onClick={() => { void postAction(`/api/appointments/${detail.id}`, "DELETE", { reason: cancelReason.trim() }, "Meeting berhasil dibatalkan."); }}
                                            className="btn w-full bg-rose-600 text-white hover:bg-rose-700"
                                        >
                                            {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Ya, Batalkan Meeting
                                        </button>
                                    </div>
                                )}
                                {detail.lifecycle === "IN_PROGRESS" && (
                                    <button
                                        type="button"
                                        disabled={acting}
                                        onClick={() =>
                                            confirm({
                                                title: "Selesaikan Meeting?",
                                                message: `Meeting "${detail.title}" akan ditandai selesai sekarang dan seluruh task diteruskan ke penerima.`,
                                                confirmLabel: "Ya, Selesaikan",
                                                variant: "info",
                                                onConfirm: () => { void postAction(`/api/appointments/${detail.id}/complete`, "POST", {}, "Meeting selesai. Task diteruskan ke penerima."); },
                                            })
                                        }
                                        className="btn btn-primary w-full"
                                    >
                                        {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Selesaikan Sekarang
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}

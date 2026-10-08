"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, MapPin, Link2, Clock3 } from "lucide-react";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { useToast } from "@/components/Toast";
import AppointmentDetailModal from "@/components/appointments/AppointmentDetailModal";
import { AppointmentStatusBadge } from "@/components/appointments/AppointmentBadges";
import { type AppointmentListItem } from "@/components/appointments/useAppointments";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { formatIndonesianDate } from "@/lib/utils";

function fmtTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, delta: number): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function toLocalToday(): string {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function AppointmentDayDetailPage() {
    const params = useParams<{ date: string }>();
    const router = useRouter();
    const toast = useToast();
    const date = params.date;

    const [items, setItems] = useState<AppointmentListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [detailItem, setDetailItem] = useState<AppointmentListItem | null>(null);

    const valid = DATE_RE.test(date ?? "");

    const load = useCallback(async () => {
        if (!valid) {
            setLoading(false);
            setLoadError("Format tanggal tidak valid.");
            return;
        }
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(`/api/appointments?from=${date}&to=${date}&limit=100`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat jadwal."));
            const json = (await res.json()) as { data: AppointmentListItem[] };
            const list = Array.isArray(json.data) ? json.data : [];
            list.sort((a, b) => a.startAt.localeCompare(b.startAt));
            setItems(list);
        } catch (err) {
            reportClientError("AppointmentDayDetailPage", "Gagal memuat", err);
            setLoadError(err instanceof Error ? err.message : "Gagal memuat jadwal.");
        } finally {
            setLoading(false);
        }
    }, [date, valid]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        fetch("/api/auth/me", { credentials: "same-origin" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: unknown) => {
                if (data && typeof data === "object" && "employeeId" in data) {
                    setMyEmployeeId(String((data as { employeeId: unknown }).employeeId ?? ""));
                }
            })
            .catch(() => undefined);
    }, []);

    const openDetail = useCallback(
        async (id: string) => {
            try {
                const res = await fetch(`/api/appointments/${id}`);
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail."));
                const json = (await res.json()) as { data: AppointmentListItem };
                setDetailId(id);
                setDetailItem(json.data);
            } catch (error) {
                reportClientError("AppointmentDayDetailPage", "Gagal detail", error);
                toast(error instanceof Error ? error.message : "Gagal memuat detail.", "error");
            }
        },
        [toast]
    );

    if (!valid) {
        return (
            <div className="w-full min-w-0 space-y-4">
                <FeedbackMessage variant="error" title="Tanggal tidak valid">
                    Kembali ke kalender dan pilih tanggal yang sesuai.
                </FeedbackMessage>
                <button type="button" onClick={() => router.push("/employee/appointments")} className="btn btn-secondary w-full">
                    Kembali ke Kalender
                </button>
            </div>
        );
    }

    const first = items[0];

    return (
        <div className="w-full min-w-0 space-y-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => router.push("/employee/appointments")}
                    className="min-w-11 min-h-11 p-2.5 flex items-center justify-center rounded-xl hover:bg-[var(--secondary)]"
                    aria-label="Kembali ke kalender"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-base font-extrabold text-[var(--text-primary)] truncate">{formatIndonesianDate(new Date(`${date}T00:00:00+07:00`))}</h1>
                    <p className="text-xs text-[var(--text-muted)]">
                        {loading ? "Memuat data…" : items.length === 0 ? "Tidak ada janji rapat" : `${items.length} janji rapat · Mulai pukul ${first ? fmtTime(first.startAt) : ""}`}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => router.push(`/employee/appointments/${shiftDate(date, -1)}`)}
                    className="min-w-11 min-h-11 p-2.5 flex items-center justify-center rounded-xl hover:bg-[var(--secondary)]"
                    aria-label="Hari sebelumnya"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                    type="button"
                    onClick={() => router.push(`/employee/appointments/${shiftDate(date, 1)}`)}
                    className="min-w-11 min-h-11 p-2.5 flex items-center justify-center rounded-xl hover:bg-[var(--secondary)]"
                    aria-label="Hari berikutnya"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {date !== toLocalToday() && (
                <button type="button" onClick={() => router.push(`/employee/appointments/${toLocalToday()}`)} className="btn btn-secondary btn-sm">
                    Kembali ke Hari Ini
                </button>
            )}

            {loadError && (
                <FeedbackMessage variant="error" title="Gagal memuat">
                    {loadError}
                </FeedbackMessage>
            )}

            {loading ? (
                <div className="space-y-3" aria-label="Memuat jadwal">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="card p-4 animate-pulse" role="status">
                            <div className="h-4 w-2/3 rounded bg-[var(--secondary)]" />
                            <div className="h-3 w-1/3 rounded bg-[var(--secondary)] mt-2" />
                        </div>
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="card p-12 text-center border-dashed">
                    <p className="text-sm font-medium text-[var(--text-muted)]">Belum ada janji rapat pada tanggal ini.</p>
                    <button
                        type="button"
                        onClick={() => router.push(`/employee/appointments?date=${date}&create=1`)}
                        className="btn btn-primary btn-sm mt-3"
                    >
                        <Plus className="w-3.5 h-3.5" /> Buat Janji Rapat pada Tanggal Ini
                    </button>
                </div>
            ) : (
                <ol className="space-y-3">
                    {items.map((a) => {
                        const accepted = a.participants.filter((p) => p.inviteStatus === "ACCEPTED").length;
                        return (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => { void openDetail(a.id); }}
                                    className="card w-full text-left p-4 hover:border-[var(--primary)]/40 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="shrink-0 w-14 text-center rounded-xl bg-[var(--secondary)] py-2">
                                            <span className="block text-sm font-extrabold text-[var(--primary)]">{fmtTime(a.startAt)}</span>
                                            <span className="block text-[10px] text-[var(--text-muted)]">{a.isFullDay ? "Seharian Penuh" : fmtTime(a.endAt)}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-[var(--text-primary)] truncate">{a.title}</p>
                                            <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1 truncate">
                                                {a.room ? (
                                                    <>
                                                        <MapPin className="w-3 h-3 shrink-0" /> {a.room.name}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Link2 className="w-3 h-3 shrink-0" /> Daring
                                                    </>
                                                )}
                                            </p>
                                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                                                <Clock3 className="w-3 h-3 shrink-0" />
                                                {a.participants.length} peserta · {accepted} menerima
                                            </p>
                                        </div>
                                        <AppointmentStatusBadge status={a.status} lifecycle={a.lifecycle} />
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}

            {!loading && items.length > 0 && (
                <button
                    type="button"
                    onClick={() => router.push(`/employee/appointments?date=${date}&create=1`)}
                    className="btn btn-secondary w-full"
                >
                    <Plus className="w-4 h-4" /> Buat Janji Rapat pada Tanggal Ini
                </button>
            )}

            {detailItem && detailId && (
                <AppointmentDetailModal
                    item={detailItem}
                    canManage={myEmployeeId !== null && detailItem.requesterEmployeeId === myEmployeeId}
                    myEmployeeId={myEmployeeId}
                    onClose={() => {
                        setDetailId(null);
                        setDetailItem(null);
                    }}
                    onChanged={() => {
                        void load();
                        if (detailId) void openDetail(detailId);
                    }}
                    onEdit={() => router.push(`/employee/appointments?date=${date}&create=1`)}
                />
            )}
        </div>
    );
}

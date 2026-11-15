"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Plus, MapPin, Link2, Clock3 } from "lucide-react";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import { AppointmentStatusBadge } from "@/components/appointments/AppointmentBadges";
import { participantDisplayName, requesterDisplayName, type AppointmentListItem } from "@/components/appointments/useAppointments";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { formatIndonesianDate } from "@/lib/utils";
import { addCalendarDays, getWIBHoursMinutes, toWIBDateString } from "@/lib/timezone";

function fmtTime(iso: string): string {
    const { hours, minutes } = getWIBHoursMinutes(new Date(iso));
    return `${String(hours).padStart(2, "0")}.${String(minutes).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, delta: number): string {
    return addCalendarDays(dateStr, delta);
}

function toLocalToday(): string {
    return toWIBDateString(new Date());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function AppointmentDayDetailPage() {
    const params = useParams<{ date: string }>();
    const router = useRouter();
    const date = params.date;

    const [items, setItems] = useState<AppointmentListItem[]>([]);
    const [total, setTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

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
            const json = (await res.json()) as { data: AppointmentListItem[]; total?: number };
            const list = Array.isArray(json.data) ? json.data : [];
            list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
            setItems(list);
            setTotal(typeof json.total === "number" ? json.total : list.length);
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

    const openDetail = useCallback(
        (id: string) => {
            router.push(`/employee/appointments/detail/${id}`);
        },
        [router]
    );

    if (!valid) {
        return (
            <div className="space-y-5">
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
        <div className="space-y-5">
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    onClick={() => router.push("/employee/appointments")}
                    className="min-w-11 min-h-11 p-2.5 flex items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--secondary)] active:scale-[0.99]"
                    aria-label="Kembali ke kalender"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <PageHeader
                    className="min-w-0 flex-1"
                    title={formatIndonesianDate(new Date(`${date}T00:00:00+07:00`))}
                    subtitle={
                        loading ? "Memuat data…" : items.length === 0 ? "Tidak ada meeting" : `${items.length} meeting${total !== null && total > items.length ? ` dari ${total}` : ""} · Mulai pukul ${first ? fmtTime(first.startAt) : ""}`
                    }
                    icon={CalendarDays}
                    action={
                        <>
                            <button
                                type="button"
                                onClick={() => router.push(`/employee/appointments/${shiftDate(date, -1)}`)}
                                className="min-w-11 min-h-11 p-2.5 flex items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--secondary)] active:scale-[0.99]"
                                aria-label="Hari sebelumnya"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => router.push(`/employee/appointments/${shiftDate(date, 1)}`)}
                                className="min-w-11 min-h-11 p-2.5 flex items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--secondary)] active:scale-[0.99]"
                                aria-label="Hari berikutnya"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </>
                    }
                />
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
                <ListSkeleton count={3} rows={2} label="Memuat jadwal" />
            ) : items.length === 0 ? (
                <EmptyState
                    icon={CalendarDays}
                    title="Belum ada meeting pada tanggal ini."
                    action={
                        <button
                            type="button"
                            onClick={() => router.push(`/employee/appointments?date=${date}&create=1`)}
                            className="btn btn-primary btn-sm"
                        >
                            <Plus className="w-3.5 h-3.5" /> Buat Meeting pada Tanggal Ini
                        </button>
                    }
                />
            ) : (
                <ol className="space-y-3">
                    {total !== null && total > items.length && (
                        <p className="text-[11px] text-[var(--text-muted)] text-center" role="note">
                            Menampilkan {items.length} dari {total} meeting. Persempit dengan filter atau buka tampilan bulanan.
                        </p>
                    )}
                    {items.map((a) => {
                        const accepted = a.participants.filter((p) => p.inviteStatus === "ACCEPTED").length;
                        const participantNames = a.participants.map((p) => participantDisplayName(p)).join(", ");
                        return (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => { void openDetail(a.id); }}
                                    className="emp-surface emp-surface-hover w-full text-left p-4 active:scale-[0.99]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="shrink-0 w-14 text-center rounded-xl bg-[var(--secondary)] py-2">
                                            <span className="block text-sm font-extrabold text-[var(--primary)]">{fmtTime(a.startAt)}</span>
                                            <span className="block text-[10px] text-[var(--text-muted)]">{a.isFullDay ? "Seharian Penuh" : fmtTime(a.endAt)}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-[var(--text-primary)] truncate">{a.title}</p>
                                            {a.agenda && (
                                                <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">{a.agenda}</p>
                                            )}
                                            <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1 truncate">
                                                {a.room ? (
                                                    <>
                                                        <MapPin className="w-3 h-3 shrink-0" /> <span>{a.room.name}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Link2 className="w-3 h-3 shrink-0" /> <span>Daring</span>
                                                    </>
                                                )}
                                                {a.requesterEmployeeId ? ` · Penyelenggara: ${requesterDisplayName(a)}` : ""}
                                            </p>
                                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                                                <Clock3 className="w-3 h-3 shrink-0" />
                                                {a.participants.length} peserta · {accepted} menerima
                                            </p>
                                            {participantNames && (
                                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                                                    Peserta: {participantNames}
                                                </p>
                                            )}
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
                    <Plus className="w-4 h-4" /> Buat Meeting pada Tanggal Ini
                </button>
            )}

        </div>
    );
}

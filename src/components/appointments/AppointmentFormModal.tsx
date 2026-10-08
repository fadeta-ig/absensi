"use client";

import { useEffect, useState } from "react";
import { FileText, CalendarDays, Clock3, X, Loader2, Link2, StickyNote } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import ParticipantPicker, { type PickedParticipant } from "@/components/appointments/ParticipantPicker";
import RoomSelect from "@/components/appointments/RoomSelect";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import { toDateString } from "@/lib/utils";
import type { AppointmentListItem } from "@/components/appointments/useAppointments";
import { participantDisplayName } from "@/components/appointments/useAppointments";

interface AppointmentFormModalProps {
    initialDate: string;
    editing: AppointmentListItem | null;
    onClose: () => void;
    onSaved: () => void;
}

export default function AppointmentFormModal({ initialDate, editing, onClose, onSaved }: AppointmentFormModalProps) {
    const [title, setTitle] = useState(editing?.title ?? "");
    const [date, setDate] = useState(() => {
        if (editing) return toDateString(editing.startAt);
        return initialDate;
    });
    const [startTime, setStartTime] = useState(() => (editing && !editing.isFullDay ? toHM(editing.startAt) : "09:00"));
    const [endTime, setEndTime] = useState(() => (editing && !editing.isFullDay ? toHM(editing.endAt) : "10:00"));
    const [isFullDay, setIsFullDay] = useState(editing?.isFullDay ?? false);
    const [roomId, setRoomId] = useState(editing?.room?.id ?? "");
    const [meetingLink, setMeetingLink] = useState(editing?.meetingLink ?? "");
    const [mode, setMode] = useState<"fisik" | "daring">(() => {
        if (editing?.room?.id) return "fisik";
        if (editing?.meetingLink) return "daring";
        return "fisik";
    });
    const [agenda, setAgenda] = useState("");
    const [participants, setParticipants] = useState<PickedParticipant[]>(() =>
        (editing?.participants ?? []).map((p) => ({
            key: p.employeeId ? `e:${p.employeeId}` : `g:${(p.guestName ?? "").toLowerCase()}`,
            employeeId: p.employeeId,
            name: participantDisplayName(p),
        }))
    );
    const [changeReason, setChangeReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflicts, setConflicts] = useState<string[]>([]);
    const [checkingConflicts, setCheckingConflicts] = useState(false);

    const canSubmit =
        (editing || title.trim()) && date && (isFullDay || (startTime && endTime)) && (mode === "fisik" ? roomId : meetingLink.trim()) && !loading;

    useEffect(() => {
        setConflicts([]);
        const ids = participants.filter((p) => p.employeeId).map((p) => p.employeeId as string);
        if (!date || isFullDay || !startTime || !endTime || ids.length === 0) return;
        const timer = setTimeout(async () => {
            setCheckingConflicts(true);
            try {
                const controller = new AbortController();
                const res = await fetch(`/api/appointments/availability?date=${date}&employees=${encodeURIComponent(ids.join(","))}`, {
                    signal: controller.signal,
                });
                if (!res.ok) return;
                const json = (await res.json()) as { data?: { employeeBusy?: Record<string, Array<{ startAt: string; endAt: string; leave?: boolean }>> } };
                const busy = json.data?.employeeBusy ?? {};
                const slotStart = new Date(`${date}T${startTime}:00+07:00`).getTime();
                const slotEnd = new Date(`${date}T${endTime}:00+07:00`).getTime();
                if (!(slotEnd > slotStart)) return;
                const hit: string[] = [];
                for (const p of participants) {
                    if (!p.employeeId) continue;
                    const intervals = busy[p.employeeId] ?? [];
                    if (intervals.some((b) => new Date(b.startAt).getTime() < slotEnd && new Date(b.endAt).getTime() > slotStart)) {
                        hit.push(stripGelar(p.name));
                    }
                }
                setConflicts(hit);
            } catch {
                /* abaikan — validasi final tetap di server */
            } finally {
                setCheckingConflicts(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [date, startTime, endTime, isFullDay, participants]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        setError(null);
        try {
            const payload = editing
                ? { roomId: mode === "fisik" ? roomId || null : null, meetingLink: mode === "daring" ? meetingLink.trim() || null : null, date, startTime: isFullDay ? undefined : startTime, endTime: isFullDay ? undefined : endTime, isFullDay, changeReason }
                : {
                    title: title.trim(),
                    agenda: agenda.trim() || null,
                    roomId: mode === "fisik" ? roomId || null : null,
                    meetingLink: mode === "daring" ? meetingLink.trim() || null : null,
                    date,
                    startTime: isFullDay ? undefined : startTime,
                    endTime: isFullDay ? undefined : endTime,
                    isFullDay,
                    participants: participants.map((p) => (p.employeeId ? { employeeId: p.employeeId } : { guestName: p.name })),
                };
            const res = await fetch(editing ? `/api/appointments/${editing.id}` : "/api/appointments", {
                method: editing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan meeting."));
            onSaved();
            onClose();
        } catch (err) {
            reportClientError("AppointmentFormModal", "Gagal menyimpan janji rapat", err);
            setError(err instanceof Error ? err.message : "Gagal menyimpan meeting. Periksa koneksi Anda, lalu coba lagi.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <AccessibleModal ariaLabel={editing ? "Ubah jadwal meeting" : "Buat meeting"} onClose={onClose} className="max-w-lg" disableClose={loading}>
            <div className="modal-header">
                <h2 className="modal-title">{editing ? "Ubah Jadwal Meeting" : "Buat Meeting"}</h2>
                <button className="modal-close" onClick={onClose} disabled={loading} aria-label="Tutup dialog meeting">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {error && (
                <FeedbackMessage variant="error" className="mb-4">
                    {error}
                </FeedbackMessage>
            )}
            {checkingConflicts && (
                <p className="text-[11px] text-[var(--text-muted)] mb-4">Memeriksa ketersediaan peserta…</p>
            )}
            {conflicts.length > 0 && (
                <FeedbackMessage variant="warning" className="mb-4" title="Peserta Tidak Tersedia">
                    {conflicts.join(", ")} sudah memiliki jadwal meeting, cuti, atau periode sibuk pada jam tersebut. Ruangan tersedia berdasarkan urutan pemesanan — ubah jam meeting atau hubungi penyelenggara apabila mendesak.
                </FeedbackMessage>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {!editing && (
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="appt-title">
                            <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Topik Meeting *
                            </span>
                        </label>
                        <input id="appt-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Meeting koordinasi" required />
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="appt-date">
                            <span className="flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" /> Tanggal *
                            </span>
                        </label>
                        <input id="appt-date" type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} required />
                    </div>
                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1">
                                <Clock3 className="w-3 h-3" /> Seharian
                            </span>
                        </label>
                        <button
                            type="button"
                            onClick={() => setIsFullDay(!isFullDay)}
                            aria-pressed={isFullDay}
                            className={`form-input text-left ${isFullDay ? "border-[var(--primary)] text-[var(--primary)] font-semibold" : ""}`}
                        >
                            {isFullDay ? "Ya, Seharian Penuh" : "Tidak, Terjadwal per Jam"}
                        </button>
                    </div>
                </div>

                {!isFullDay && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="appt-start">Jam Mulai *</label>
                            <input id="appt-start" type="time" className="form-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="appt-end">Jam Selesai *</label>
                            <input id="appt-end" type="time" className="form-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                        </div>
                    </div>
                )}

                <div className="form-group !mb-0">
                    <span className="form-label" id="appt-mode-label">Tempat Pelaksanaan *</span>
                    <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="appt-mode-label">
                        {(
                            [
                                { key: "fisik", label: "Ruang Fisik" },
                                { key: "daring", label: "Daring" },
                            ] as const
                        ).map((m) => (
                            <button
                                key={m.key}
                                type="button"
                                aria-pressed={mode === m.key}
                                onClick={() => {
                                    setMode(m.key);
                                    if (m.key === "fisik") setMeetingLink("");
                                    else setRoomId("");
                                }}
                                className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                                    mode === m.key
                                        ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                                        : "border-[var(--border)] text-[var(--text-secondary)]"
                                }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {mode === "fisik" ? (
                    <div className="form-group !mb-0">
                        <RoomSelect value={roomId} onChange={setRoomId} participantCount={participants.length} />
                    </div>
                ) : (
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="appt-link">
                            <span className="flex items-center gap-1">
                                <Link2 className="w-3 h-3" /> Tautan Meeting Daring *
                            </span>
                        </label>
                        <input id="appt-link" className="form-input" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="Contoh: https://meet…" required />
                    </div>
                )}

                {!editing && (
                    <>
                        <div className="form-group !mb-0">
                            <ParticipantPicker value={participants} onChange={setParticipants} />
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="appt-agenda">
                                <span className="flex items-center gap-1">
                                    <StickyNote className="w-3 h-3" /> Agenda (Opsional)
                                </span>
                            </label>
                            <textarea id="appt-agenda" className="form-input min-h-[60px] resize-none" value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="Tuliskan pokok bahasan meeting…" />
                        </div>
                    </>
                )}

                {editing && (
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="appt-reason">Alasan Perubahan *</label>
                        <input id="appt-reason" className="form-input" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Tuliskan alasan (minimal 5 karakter)" required />
                    </div>
                )}

                <button type="submit" className="btn btn-primary w-full" disabled={!canSubmit || (!!editing && changeReason.trim().length < 5)}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loading ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Buat Meeting"}
                </button>
            </form>
        </AccessibleModal>
    );
}

function toHM(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

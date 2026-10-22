"use client";

import { useEffect, useState } from "react";
import { FileText, CalendarDays, Clock3, X, Loader2, StickyNote } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import ParticipantPicker, { type PickedParticipant } from "@/components/appointments/ParticipantPicker";
import RoomSelect from "@/components/appointments/RoomSelect";
import TimeRangeFields, { minutesToHm } from "@/components/appointments/TimeRangeFields";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import { getWIBHoursMinutes, toWIBDateString } from "@/lib/timezone";
import type { AppointmentListItem } from "@/components/appointments/useAppointments";
import { participantDisplayName } from "@/components/appointments/useAppointments";

interface AppointmentFormModalProps {
    initialDate: string;
    editing: AppointmentListItem | null;
    myEmployeeId?: string | null;
    onClose: () => void;
    onSaved: () => void;
}

export default function AppointmentFormModal({ initialDate, editing, myEmployeeId, onClose, onSaved }: AppointmentFormModalProps) {
    const [title, setTitle] = useState(editing?.title ?? "");
    const createSlot = !editing ? nextWibSlot(initialDate) : null;
    const [date, setDate] = useState(() => {
        if (editing) return toWIBDateString(new Date(editing.startAt));
        return initialDate;
    });
    const [startTime, setStartTime] = useState(() => (editing && !editing.isFullDay ? toHM(editing.startAt) : createSlot?.start ?? "09:00"));
    const [endTime, setEndTime] = useState(() => (editing && !editing.isFullDay ? toHM(editing.endAt) : createSlot?.end ?? "10:00"));
    const [isFullDay, setIsFullDay] = useState(editing?.isFullDay ?? false);
    const [roomId, setRoomId] = useState(editing?.room?.id ?? "");
    const [agenda, setAgenda] = useState(editing?.agenda ?? "");
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
    const [roomConflict, setRoomConflict] = useState(false);
    const [checkingConflicts, setCheckingConflicts] = useState(false);

    const initialEditDate = editing ? toWIBDateString(new Date(editing.startAt)) : initialDate;
    const initialEditStart = editing && !editing.isFullDay ? toHM(editing.startAt) : "09:00";
    const initialEditEnd = editing && !editing.isFullDay ? toHM(editing.endAt) : "10:00";
    const initialEditFullDay = editing?.isFullDay ?? false;
    const initialEditRoomId = editing?.room?.id ?? "";

    const isScheduleOrPlaceChanged = Boolean(
        editing && (
            date !== initialEditDate ||
            isFullDay !== initialEditFullDay ||
            (!isFullDay && (startTime !== initialEditStart || endTime !== initialEditEnd)) ||
            roomId !== initialEditRoomId
        )
    );

    const isReasonValid = !editing
        ? true
        : isScheduleOrPlaceChanged
            ? changeReason.trim().length >= 5
            : changeReason.trim().length === 0 || changeReason.trim().length >= 5;

    const canSubmit =
        (editing || title.trim()) &&
        date &&
        (isFullDay || (startTime && endTime && endTime > startTime)) &&
        roomId &&
        isReasonValid &&
        !loading;

    const editingId = editing?.id;

    useEffect(() => {
        setConflicts([]);
        setRoomConflict(false);
        const ids = participants.filter((p) => p.employeeId).map((p) => p.employeeId as string);
        if (!date || isFullDay || !startTime || !endTime || (ids.length === 0 && !roomId)) return;
        const timer = setTimeout(async () => {
            setCheckingConflicts(true);
            try {
                const controller = new AbortController();
                const excludeParam = editingId ? `&excludeId=${encodeURIComponent(editingId)}` : "";
                const roomParam = roomId ? `&roomId=${encodeURIComponent(roomId)}` : "";
                const res = await fetch(`/api/appointments/availability?date=${date}&employees=${encodeURIComponent(ids.join(","))}${roomParam}${excludeParam}`, {
                    signal: controller.signal,
                });
                if (!res.ok) return;
                const json = (await res.json()) as { data?: { employeeBusy?: Record<string, Array<{ startAt: string; endAt: string; leave?: boolean }>>; roomBusy?: Array<{ startAt: string; endAt: string }> } };
                const busy = json.data?.employeeBusy ?? {};
                const roomBusy = json.data?.roomBusy ?? [];
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
                setRoomConflict(roomId ? roomBusy.some((b) => new Date(b.startAt).getTime() < slotEnd && new Date(b.endAt).getTime() > slotStart) : false);
            } catch {
                /* abaikan — validasi final tetap di server */
            } finally {
                setCheckingConflicts(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [date, startTime, endTime, isFullDay, participants, editingId, roomId]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        setError(null);
        try {
            const mappedParticipants = participants.map((p) => (p.employeeId ? { employeeId: p.employeeId } : { guestName: p.name }));
            const payload = editing
                ? {
                    title: title.trim(),
                    agenda: agenda.trim() || null,
                    roomId,
                    date,
                    startTime: isFullDay ? undefined : startTime,
                    endTime: isFullDay ? undefined : endTime,
                    isFullDay,
                    participants: mappedParticipants,
                    changeReason,
                }
                : {
                    title: title.trim(),
                    agenda: agenda.trim() || null,
                    roomId,
                    date,
                    startTime: isFullDay ? undefined : startTime,
                    endTime: isFullDay ? undefined : endTime,
                    isFullDay,
                    participants: mappedParticipants,
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
        <AccessibleModal ariaLabel={editing ? "Pengaturan meeting" : "Buat meeting"} onClose={onClose} className="max-w-lg" disableClose={loading}>
            <div className="modal-header">
                <h2 className="modal-title">{editing ? "Pengaturan Meeting" : "Buat Meeting"}</h2>
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
            {roomConflict && (
                <FeedbackMessage variant="warning" className="mb-4" title="Ruangan Bentrok">
                    Ruangan sudah terisi pada jam tersebut. Meeting tetap dapat disimpan — ruangan tersedia berdasarkan urutan pemesanan, simpan ulang bila server menolak karena bentrok.
                </FeedbackMessage>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="form-group !mb-0">
                    <label className="form-label" htmlFor="appt-title">
                        <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Topik Meeting *
                        </span>
                    </label>
                    <input id="appt-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Meeting koordinasi" required />
                </div>

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
                    <TimeRangeFields
                        idPrefix="appt"
                        startTime={startTime}
                        endTime={endTime}
                        onChange={(s, e) => { setStartTime(s); setEndTime(e); }}
                    />
                )}

                <div className="form-group !mb-0">
                    <RoomSelect value={roomId} onChange={setRoomId} participantCount={participants.length} />
                </div>

                <div className="form-group !mb-0">
                    <ParticipantPicker
                        value={participants}
                        onChange={setParticipants}
                        excludeEmployeeId={editing ? (editing.requesterEmployeeId ?? myEmployeeId ?? null) : (myEmployeeId ?? null)}
                    />
                </div>

                <div className="form-group !mb-0">
                    <label className="form-label" htmlFor="appt-agenda">
                        <span className="flex items-center gap-1">
                            <StickyNote className="w-3 h-3" /> Agenda / Pokok Bahasan (Opsional)
                        </span>
                    </label>
                    <textarea id="appt-agenda" className="form-input min-h-[60px] resize-none" value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="Tuliskan pokok bahasan meeting…" />
                </div>

                {editing && (
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="appt-reason">
                            {isScheduleOrPlaceChanged ? "Alasan Perubahan Jadwal *" : "Alasan Perubahan (Opsional untuk tambah/hapus peserta)"}
                        </label>
                        <input
                            id="appt-reason"
                            className="form-input"
                            value={changeReason}
                            onChange={(e) => setChangeReason(e.target.value)}
                            placeholder={isScheduleOrPlaceChanged ? "Tuliskan alasan (minimal 5 karakter)" : "Kosongkan bila hanya menambah/menghapus peserta"}
                            required={isScheduleOrPlaceChanged}
                        />
                    </div>
                )}

                <button type="submit" className="btn btn-primary w-full" disabled={!canSubmit}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loading ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Buat Meeting"}
                </button>
            </form>
        </AccessibleModal>
    );
}

function toHM(iso: string): string {
    const { hours, minutes } = getWIBHoursMinutes(new Date(iso));
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Jam mulai bawaan mengikuti WIB saat ini: untuk tanggal hari ini dipakai
 * slot 30 menit berikutnya dari sekarang; tanggal lain mulai 09:00.
 * Durasi bawaan 1 jam.
 */
function nextWibSlot(dateStr: string): { start: string; end: string } {
    if (dateStr !== toWIBDateString(new Date())) return { start: "09:00", end: "10:00" };
    const { hours, minutes } = getWIBHoursMinutes();
    const startMin = Math.min(Math.ceil((hours * 60 + minutes + 1) / 30) * 30, 23 * 60);
    return { start: minutesToHm(startMin), end: minutesToHm(startMin + 60) };
}

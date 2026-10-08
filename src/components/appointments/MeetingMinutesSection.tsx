"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Pencil } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";

interface MinutesData {
    id: string;
    minutes: string | null;
    minutesUpdatedBy: string | null;
    minutesUpdatedAt: string | null;
}

export default function MeetingMinutesSection({ appointmentId }: { appointmentId: string }) {
    const [data, setData] = useState<MinutesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState("");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/minutes`, { credentials: "same-origin" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat notulensi."));
            const json = await res.json();
            setData(json.data);
            setText(json.data?.minutes ?? "");
        } catch (err) {
            reportClientError("MeetingMinutesSection", "Gagal memuat notulensi", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal memuat notulensi.");
        } finally {
            setLoading(false);
        }
    }, [appointmentId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleSave() {
        setSaving(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/minutes`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ minutes: text, changeReason: reason }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan notulensi."));
            const json = await res.json();
            setData((prev) => (prev ? { ...prev, ...json.data } : json.data));
            setEditing(false);
            setReason("");
        } catch (err) {
            reportClientError("MeetingMinutesSection", "Gagal menyimpan notulensi", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal menyimpan notulensi.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div>
            <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Notulensi
            </p>
            {loading ? (
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5" aria-label="Memuat notulensi">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat notulensi…
                </p>
            ) : error && !data ? (
                <FeedbackMessage variant="error">{error}</FeedbackMessage>
            ) : !editing ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2.5">
                    {data?.minutes ? (
                        <>
                            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{data.minutes}</p>
                            {data.minutesUpdatedAt && (
                                <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                                    Terakhir diubah {new Date(data.minutesUpdatedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                    {data.minutesUpdatedBy ? ` oleh ${data.minutesUpdatedBy}` : ""}
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-xs text-[var(--text-muted)]">Belum ada notulensi. Peserta meeting dapat menuliskannya di sini.</p>
                    )}
                    <button
                        type="button"
                        onClick={() => { setText(data?.minutes ?? ""); setReason(""); setEditing(true); }}
                        className="btn btn-secondary btn-sm mt-2"
                    >
                        <Pencil className="w-3.5 h-3.5" /> {data?.minutes ? "Ubah Notulensi" : "Tulis Notulensi"}
                    </button>
                </div>
            ) : (
                <div className="space-y-2 rounded-xl border border-[var(--border)] p-2.5">
                    {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}
                    <label className="form-label" htmlFor="meeting-minutes">Isi Notulensi *</label>
                    <textarea
                        id="meeting-minutes"
                        className="form-textarea min-h-24"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Tuliskan hasil dan kesepakatan meeting…"
                        maxLength={20000}
                    />
                    <label className="form-label" htmlFor="meeting-minutes-reason">Alasan Perubahan *</label>
                    <input
                        id="meeting-minutes-reason"
                        className="form-input"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Minimal 5 karakter"
                    />
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="btn btn-secondary flex-1">
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={() => { void handleSave(); }}
                            disabled={saving || !text.trim() || reason.trim().length < 5}
                            className="btn btn-primary flex-1"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {saving ? "Menyimpan…" : "Simpan Notulensi"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

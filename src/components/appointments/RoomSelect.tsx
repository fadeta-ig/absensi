"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { reportClientError } from "@/lib/clientErrors";

export interface RoomOption {
    id: string;
    name: string;
    capacity: number | null;
    location: string | null;
}

export default function RoomSelect({
    value,
    onChange,
    participantCount,
}: {
    value: string;
    onChange: (id: string) => void;
    participantCount: number;
}) {
    const [rooms, setRooms] = useState<RoomOption[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        async function fetchRooms() {
            try {
                const res = await fetch("/api/appointments/rooms", { signal: controller.signal });
                if (!res.ok) throw new Error("Gagal memuat ruangan.");
                const json: unknown = await res.json();
                const data = json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)
                    ? (json as { data: RoomOption[] }).data
                    : [];
                if (!controller.signal.aborted) setRooms(data);
            } catch (error) {
                if (controller.signal.aborted) return;
                reportClientError("RoomSelect", "Gagal memuat ruangan", error);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void fetchRooms();
        return () => controller.abort();
    }, []);

    const selected = rooms.find((r) => r.id === value);
    const overCapacity = selected?.capacity != null && participantCount > selected.capacity;

    return (
        <div>
            <label className="form-label" htmlFor="appointment-room">
                <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Ruang Rapat (Kosongkan Apabila Rapat Daring)
                </span>
            </label>
            <select
                id="appointment-room"
                className="form-input"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={loading}
            >
                <option value="">— Daring / Tanpa Ruangan —</option>
                {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                        {r.name}{r.capacity ? ` (Kapasitas ${r.capacity} orang)` : ""}
                    </option>
                ))}
            </select>
            {selected?.capacity != null && (
                <p className="text-[11px] text-[var(--text-muted)] mt-1">Kapasitas: {selected.capacity} orang · Peserta: {participantCount} orang</p>
            )}
            {overCapacity && (
                <FeedbackMessage variant="warning" compact className="mt-2">
                    Jumlah peserta melebihi kapasitas ruangan. Janji rapat tetap dapat dibuat — ruangan tersedia berdasarkan urutan pemesanan.
                </FeedbackMessage>
            )}
        </div>
    );
}
